// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract LicenseManager {
    address public admin;
    mapping(address => User) public users;
    mapping(address => string[]) public userLicenses;

    struct User {
        bool isRegistered;
        bool isApproved;
        bool isRejected;
        string rejectionReason;
    }

    event UserRegistered(address indexed user);
    event UserApproved(address indexed user);
    event UserRejected(address indexed user, string reason);
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

    constructor() {
        admin = msg.sender;
        users[admin] = User(true, true, false, ""); // Admin is auto-approved
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyApprovedUser() {
        require(users[msg.sender].isApproved, "User not approved");
        _;
    }

    function registerUser() external {
        require(!users[msg.sender].isRegistered, "User already registered");
        users[msg.sender] = User(true, false, false, "");
        emit UserRegistered(msg.sender);
    }

    function approveUser(address user) external onlyAdmin {
        require(users[user].isRegistered, "User not registered");
        require(!users[user].isApproved, "User already approved");
        users[user].isApproved = true;
        users[user].isRejected = false;
        users[user].rejectionReason = "";
        emit UserApproved(user);
    }

    function rejectUser(address user, string calldata reason) external onlyAdmin {
        require(users[user].isRegistered, "User not registered");
        require(!users[user].isRejected, "User already rejected");
        require(bytes(reason).length > 0, "Rejection reason required");
        users[user].isApproved = false;
        users[user].isRejected = true;
        users[user].rejectionReason = reason;
        emit UserRejected(user, reason);
    }

    function getUserStatus(address user) external view returns (bool isRegistered, bool isApproved, bool isRejected, string memory rejectionReason) {
        User memory u = users[user];
        return (u.isRegistered, u.isApproved, u.isRejected, u.rejectionReason);
    }

    function issueLicense(string calldata licenseKey, string calldata softwareName) external onlyApprovedUser {
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

    function reportTampered(string calldata licenseKey) external onlyApprovedUser {
        require(licenses[licenseKey].exists, "License does not exist");
        licenses[licenseKey].isTampered = true;
        emit LicenseTampered(licenseKey, msg.sender);
    }

    function reportCracked(string calldata licenseKey) external onlyApprovedUser {
        require(licenses[licenseKey].exists, "License does not exist");
        require(!licenses[licenseKey].isCracked, "License already cracked");
        licenses[licenseKey].isCracked = true;
        emit LicenseCracked(licenseKey, msg.sender);
    }
}