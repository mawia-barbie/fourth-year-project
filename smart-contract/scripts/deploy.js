const hre = require("hardhat");

async function main() {
  // Get the contract factory
  const LicenseManager = await hre.ethers.getContractFactory("LicenseManager");
  
  // Deploy the contract
  const licenseManager = await LicenseManager.deploy();
  
  // Wait for the deployment to be mined
  await licenseManager.waitForDeployment();
  
  // Get the deployed contract address
  const contractAddress = await licenseManager.getAddress();
  console.log("LicenseManager deployed to:", contractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });