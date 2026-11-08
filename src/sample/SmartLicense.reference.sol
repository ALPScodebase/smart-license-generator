// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SmartLicense is Ownable, ReentrancyGuard {
    struct LicenseInfo {
        string title;
        address licensor;
        address licensee;
        string intellectualProperty;
        uint256 duration;
        string territory;
        uint256 royaltyRate;
        bool isActive;
        uint256 createdAt;
    }
    
    LicenseInfo public licenseInfo;
    
    event LicenseCreated(
        string indexed title,
        address indexed licensor,
        address indexed licensee,
        uint256 royaltyRate
    );
    
    event RoyaltyPaid(
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );
    
    constructor(
        string memory _title,
        address _licensor,
        string memory _intellectualProperty,
        uint256 _duration,
        string memory _territory,
        uint256 _royaltyRate
    ) {
        licenseInfo = LicenseInfo({
            title: _title,
            licensor: _licensor,
            licensee: address(0),
            intellectualProperty: _intellectualProperty,
            duration: _duration,
            territory: _territory,
            royaltyRate: _royaltyRate,
            isActive: false,
            createdAt: block.timestamp
        });
        
        emit LicenseCreated(_title, _licensor, address(0), _royaltyRate);
    }
    
    function activateLicense(address _licensee) external onlyOwner {
        require(_licensee != address(0), "Invalid licensee address");
        licenseInfo.licensee = _licensee;
        licenseInfo.isActive = true;
    }
    
    function payRoyalty() external payable nonReentrant {
        require(licenseInfo.isActive, "License not active");
        require(msg.value > 0, "Payment amount must be greater than 0");
        
        // Transfer royalty to licensor
        payable(licenseInfo.licensor).transfer(msg.value);
        
        emit RoyaltyPaid(msg.sender, msg.value, block.timestamp);
    }
    
    function getLicenseInfo() external view returns (LicenseInfo memory) {
        return licenseInfo;
    }
    
    function isLicenseValid() external view returns (bool) {
        return licenseInfo.isActive && 
               block.timestamp < licenseInfo.createdAt + licenseInfo.duration;
    }
    
    // Emergency functions
    function pauseLicense() external onlyOwner {
        licenseInfo.isActive = false;
    }
    
    function resumeLicense() external onlyOwner {
        licenseInfo.isActive = true;
    }
    
    function updateRoyaltyRate(uint256 _newRate) external onlyOwner {
        licenseInfo.royaltyRate = _newRate;
    }
}