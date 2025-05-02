// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract LicenseManager {
    address public admin;

    // Existing License struct
    struct License {
        string softwareName;
        bool exists;
        bool isTampered;
        bool isCracked;
    }

    // New Software struct
    struct Software {
        string hash;
        bool isApproved;
        address developer;
    }

    mapping(address => string[]) public userLicenses;
    mapping(string => License) public licenses;
    mapping(string => Software) public softwareRecords;

    event LicenseIssued(address indexed user, string licenseKey, string softwareName);
    event LicenseTampered(string licenseKey, address reporter);
    event LicenseCracked(string licenseKey, address reporter);
    event SoftwareAdded(string hash, address developer);
    event SoftwareApproved(string hash);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    function addSoftware(string calldata hash, address developer) external onlyAdmin {
        require(bytes(softwareRecords[hash].hash).length == 0, "Software already exists");
        softwareRecords[hash] = Software(hash, false, developer);
        emit SoftwareAdded(hash, developer);
    }

    function approveSoftware(string calldata hash) external onlyAdmin {
        require(bytes(softwareRecords[hash].hash).length != 0, "Software does not exist");
        softwareRecords[hash].isApproved = true;
        emit SoftwareApproved(hash);
    }

    function issueLicense(string calldata licenseKey, string calldata softwareName) external {
        require(!licenses[licenseKey].exists, "License already exists");
        require(bytes(softwareRecords[licenseKey].hash).length != 0, "Software not registered");
        require(softwareRecords[licenseKey].isApproved, "Software not approved");
        require(msg.sender == softwareRecords[licenseKey].developer, "Only developer can issue license");
        
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