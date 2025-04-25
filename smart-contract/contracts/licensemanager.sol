// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract LicenseManager {
    mapping(address => string[]) public userLicenses;

    event LicenseIssued(address indexed user, string licenseKey, string softwareName);
    event LicenseTampered(string licenseKey, address reporter);
    event LicenseCracked(string licenseKey, address reporter);

    struct License {
        string softwareName;
        bool exists;
        bool isTampered;
        bool isCracked;
    }

    mapping(string => License) public licenses;

    constructor() {}

    function issueLicense(string calldata licenseKey, string calldata softwareName) external {
        require(!licenses[licenseKey].exists, "License already exists");
        licenses[licenseKey] = License(softwareName, true, false, false);
        userLicenses[msg.sender].push(licenseKey);
        emit LicenseIssued(msg.sender, licenseKey, softwareName);
    }

    function getUserLicenses(address user) external view returns (string[] memory) {
        return userLicenses[user];
    }

    function getLicenseDetails(string calldata licenseKey) external view returns (string memory softwareName, bool exists, bool isTampered, bool isCracked) {
        License memory license = licenses[licenseKey];
        return (license.softwareName, license.exists, license.isTampered, license.isCracked);
    }

    function isAuthentic(string calldata licenseKey) external view returns (bool) {
        License memory license = licenses[licenseKey];
        return license.exists && !license.isTampered && !license.isCracked;
    }

    function reportTampered(string calldata licenseKey) external {
        require(licenses[licenseKey].exists, "License does not exist");
        licenses[licenseKey].isTampered = true;
        emit LicenseTampered(licenseKey, msg.sender);
    }

    function reportCracked(string calldata licenseKey) external {
        require(licenses[licenseKey].exists, "License does not exist");
        require(!licenses[licenseKey].isCracked, "License already cracked");
        licenses[licenseKey].isCracked = true;
        emit LicenseCracked(licenseKey, msg.sender);
    }
}