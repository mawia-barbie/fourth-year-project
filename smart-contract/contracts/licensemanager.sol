// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract LicenseManager {
    address public admin;

    // License struct
    struct License {
        string softwareName; // Name of the software for this license
        string softwareHash; // Associated software hash
        bool isTampered;    // Whether the license has been tampered
        bool isCracked;     // Whether the license has been cracked
        bool exists;        // Whether the license exists
        uint256 issuedAt;   // Timestamp of issuance
    }

    // Software struct
    struct Software {
        string hash;        // Unique hash of the software
        bool isApproved;    // Approval status
        bool isRejected;    // Rejection status
        address developer;  // Developer address
    }

    // Storage
    mapping(address => string[]) public userLicenses; // User address to list of license keys
    mapping(string => License) public licenses;       // License key to License details
    mapping(string => Software) public softwareRecords; // Software hash to Software details
    string[] private allSoftwareHashes;               // List of all software hashes for enumeration

    // Events
    event LicenseIssued(address indexed user, string licenseKey, string softwareName, string softwareHash);
    event LicenseTampered(string indexed licenseKey, address reporter);
    event LicenseCracked(string indexed licenseKey, address reporter);
    event SoftwareAdded(string indexed hash, address developer);
    event SoftwareApproved(string indexed hash);
    event SoftwareRejected(string indexed hash);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    // Add software to the contract
    function addSoftware(string calldata hash, address developer) external onlyAdmin {
        require(bytes(hash).length > 0, "Hash cannot be empty");
        require(bytes(softwareRecords[hash].hash).length == 0, "Software already exists");
        softwareRecords[hash] = Software(hash, false, false, developer);
        allSoftwareHashes.push(hash);
        emit SoftwareAdded(hash, developer);
    }

    // Approve software
    function approveSoftware(string calldata hash) external onlyAdmin {
        require(bytes(hash).length > 0, "Hash cannot be empty");
        require(bytes(softwareRecords[hash].hash).length != 0, "Software does not exist");
        require(!softwareRecords[hash].isRejected, "Software is rejected");
        require(!softwareRecords[hash].isApproved, "Software already approved");
        softwareRecords[hash].isApproved = true;
        emit SoftwareApproved(hash);
    }

    // Reject software
    function rejectSoftware(string calldata hash) external onlyAdmin {
        require(bytes(hash).length > 0, "Hash cannot be empty");
        require(bytes(softwareRecords[hash].hash).length != 0, "Software does not exist");
        require(!softwareRecords[hash].isApproved, "Software already approved");
        require(!softwareRecords[hash].isRejected, "Software already rejected");
        softwareRecords[hash].isRejected = true;
        emit SoftwareRejected(hash);
    }

    // Issue a license for approved software
    function issueLicense(string calldata licenseKey, string calldata softwareName) external {
        require(bytes(licenseKey).length > 0, "License key cannot be empty");
        require(bytes(softwareName).length > 0, "Software name cannot be empty");
        require(!licenses[licenseKey].exists, "License already exists");
        require(bytes(softwareRecords[licenseKey].hash).length != 0, "Software not registered");
        require(softwareRecords[licenseKey].isApproved, "Software not approved");
        require(!softwareRecords[licenseKey].isRejected, "Software is rejected");

        licenses[licenseKey] = License(softwareName, licenseKey, false, false, true, block.timestamp);
        userLicenses[msg.sender].push(licenseKey);
        emit LicenseIssued(msg.sender, licenseKey, softwareName, licenseKey);
    }

    // Get licenses for a user
    function getUserLicenses(address user) external view returns (string[] memory) {
        return userLicenses[user];
    }

    // Get license details
    function getLicenseDetails(string calldata licenseKey)
        external
        view
        returns (
            string memory softwareName,
            string memory softwareHash,
            bool exists,
            bool isTampered,
            bool isCracked,
            uint256 issuedAt
        )
    {
        License memory license = licenses[licenseKey];
        return (
            license.softwareName,
            license.softwareHash,
            license.exists,
            license.isTampered,
            license.isCracked,
            license.issuedAt
        );
    }

    // Get software details
    function getSoftwareDetails(string calldata hash)
        external
        view
        returns (
            string memory hash_,
            bool isApproved,
            bool isRejected,
            address developer
        )
    {
        Software memory software = softwareRecords[hash];
        return (software.hash, software.isApproved, software.isRejected, software.developer);
    }

    // Get all software records
    function getAllSoftware()
        external
        view
        returns (
            string[] memory hashes,
            bool[] memory isApproved,
            bool[] memory isRejected,
            address[] memory developers
        )
    {
        hashes = new string[](allSoftwareHashes.length);
        isApproved = new bool[](allSoftwareHashes.length);
        isRejected = new bool[](allSoftwareHashes.length);
        developers = new address[](allSoftwareHashes.length);

        for (uint256 i = 0; i < allSoftwareHashes.length; i++) {
            string memory hash = allSoftwareHashes[i];
            Software memory software = softwareRecords[hash];
            hashes[i] = software.hash;
            isApproved[i] = software.isApproved;
            isRejected[i] = software.isRejected;
            developers[i] = software.developer;
        }
        return (hashes, isApproved, isRejected, developers);
    }

    // Check if a license is authentic
    function isAuthentic(string calldata licenseKey) external view returns (bool) {
        License memory license = licenses[licenseKey];
        return license.exists && !license.isTampered && !license.isCracked;
    }

    // Report a tampered license
    function reportTampered(string calldata licenseKey) external {
        require(bytes(licenseKey).length > 0, "License key cannot be empty");
        require(licenses[licenseKey].exists, "License does not exist");
        require(!licenses[licenseKey].isTampered, "License already tampered");
        licenses[licenseKey].isTampered = true;
        emit LicenseTampered(licenseKey, msg.sender);
    }

    // Report a cracked license
    function reportCracked(string calldata licenseKey) external {
        require(bytes(licenseKey).length > 0, "License key cannot be empty");
        require(licenses[licenseKey].exists, "License does not exist");
        require(!licenses[licenseKey].isCracked, "License already cracked");
        licenses[licenseKey].isCracked = true;
        emit LicenseCracked(licenseKey, msg.sender);
    }

    // Transfer admin role (optional enhancement)
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "New admin cannot be zero address");
        admin = newAdmin;
    }
}