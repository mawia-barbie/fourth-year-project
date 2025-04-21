
// pragma solidity ^0.8.0;

// contract LicenseManager {
//     // Structure to store license details
//     struct License {
//         string licenseKey;     // Unique license key (file hash)
//         address owner;        // Address of the license issuer
//         bool isValid;         // License validity status
//         uint256 issuanceDate; // Timestamp when license was issued
//         string softwareId;    // Identifier for the software
//     }

//     // Mappings for storage
//     mapping(string => License) public licenses; // Maps license key to License struct
//     mapping(address => string[]) public userLicenses; // Maps user address to their license keys

//     // Events for frontend integration
//     event LicenseIssued(string indexed licenseKey, address indexed owner, string softwareId);
//     event LicenseVerified(string indexed licenseKey, bool isValid);
//     event LicenseCracked(string indexed licenseKey, address indexed reporter);

//     // Issue a new license
//     function issueLicense(string memory _licenseKey, string memory _softwareId) public {
//         require(bytes(_licenseKey).length > 0, "License key cannot be empty");
//         require(bytes(licenses[_licenseKey].licenseKey).length == 0, "License key already exists");

//         licenses[_licenseKey] = License({
//             licenseKey: _licenseKey,
//             owner: msg.sender,
//             isValid: true,
//             issuanceDate: block.timestamp,
//             softwareId: _softwareId
//         });

//         userLicenses[msg.sender].push(_licenseKey);
//         emit LicenseIssued(_licenseKey, msg.sender, _softwareId);
//     }

//     // Verify if a license is authentic
//     function isAuthentic(string memory _licenseKey) public returns (bool) {
//         License memory license = licenses[_licenseKey];
//         bool isValid = bytes(license.licenseKey).length != 0 && license.isValid;
//         emit LicenseVerified(_licenseKey, isValid);
//         return isValid;
//     }

//     // Report a cracked license
//     function reportCracked(string memory _licenseKey) public {
//         require(bytes(licenses[_licenseKey].licenseKey).length != 0, "License does not exist");
//         require(licenses[_licenseKey].isValid, "License is already invalid");

//         licenses[_licenseKey].isValid = false;
//         emit LicenseCracked(_licenseKey, msg.sender);
//     }

//     // Get all licenses for a user
//     function getUserLicenses(address _user) public view returns (string[] memory) {
//         return userLicenses[_user];
//     }
// }


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
contract LicenseManager {
    struct License {
        string licenseKey;
        address owner;
        bool isValid;
        uint256 issuanceDate;
        string softwareId;
        uint256 version;
    }

    mapping(string => License) public licenses;
    mapping(address => string[]) public userLicenses;

    event LicenseIssued(string indexed licenseKey, address indexed owner, string softwareId, uint256 version);
    event LicenseVerified(string indexed licenseKey, bool isValid);
    event LicenseTampered(string indexed licenseKey, address indexed reporter);
    event LicenseCracked(string indexed licenseKey, address indexed reporter);

    function issueLicense(string memory _licenseKey, string memory _softwareId) public {
        require(bytes(_licenseKey).length > 0, "License key cannot be empty");
        License storage license = licenses[_licenseKey];
        if (bytes(license.licenseKey).length == 0) {
            licenses[_licenseKey] = License({
                licenseKey: _licenseKey,
                owner: msg.sender,
                isValid: true,
                issuanceDate: block.timestamp,
                softwareId: _softwareId,
                version: 1
            });
            userLicenses[msg.sender].push(_licenseKey);
        } else {
            require(license.owner == msg.sender, "Only the original owner can update this license");
            require(license.isValid, "Cannot update an invalid license");
            license.version += 1;
            license.issuanceDate = block.timestamp;
        }
        emit LicenseIssued(_licenseKey, msg.sender, _softwareId, license.version);
    }

    function isAuthentic(string memory _licenseKey) public returns (bool) {
        License memory license = licenses[_licenseKey];
        bool isValid = bytes(license.licenseKey).length != 0 && license.isValid;
        emit LicenseVerified(_licenseKey, isValid);
        return isValid;
    }

    function reportTampered(string memory _licenseKey) public {
        require(bytes(licenses[_licenseKey].licenseKey).length != 0, "License does not exist");
        require(licenses[_licenseKey].isValid, "License is already invalid");
        licenses[_licenseKey].isValid = false;
        emit LicenseTampered(_licenseKey, msg.sender);
    }

    function reportCracked(string memory _licenseKey) public {
        require(bytes(licenses[_licenseKey].licenseKey).length != 0, "License does not exist");
        require(licenses[_licenseKey].isValid, "License is already invalid");
        licenses[_licenseKey].isValid = false;
        emit LicenseCracked(_licenseKey, msg.sender);
    }

    function getUserLicenses(address _user) public view returns (string[] memory) {
        return userLicenses[_user];
    }

    function getLicenseDetails(string memory _licenseKey) public view returns (
        address owner,
        bool isValid,
        uint256 issuanceDate,
        string memory softwareId,
        uint256 version
    ) {
        License memory license = licenses[_licenseKey];
        require(bytes(license.licenseKey).length != 0, "License does not exist");
        return (
            license.owner,
            license.isValid,
            license.issuanceDate,
            license.softwareId,
            license.version
        );
    }
}

