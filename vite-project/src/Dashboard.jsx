import { useState } from "react";
import { ethers } from "ethers";
import { sha256 } from "js-sha256";

function Dashboard() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");

  // Blockchain setup (replace with your contract details)
  // const contractAddress = "YOUR_CONTRACT_ADDRESS";
  // const contractABI = YOUR_ABI;

  // Connect to blockchain
  async function getContract() {
    if (!window.ethereum) {
      setStatus("Please install MetaMask!");
      return null;
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, contractABI, signer);
  }

  // Generate and store license
  async function generateAndStoreLicense() {
    if (!file) {
      setStatus("Please upload a file first!");
      return;
    }

    const contract = await getContract();
    if (!contract) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = new Uint8Array(e.target.result);
      const fileHash = sha256(fileData);
      setLicenseKey(fileHash);

      try {
        const tx = await contract.issueLicense(fileHash);
        await tx.wait();
        setStatus(`License issued: ${fileHash}`);
      } catch (error) {
        setStatus(`Error: ${error.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Check authenticity
  async function checkAuthenticity() {
    if (!file) {
      setStatus("Please upload a file first!");
      return;
    }

    const contract = await getContract();
    if (!contract) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = new Uint8Array(e.target.result);
      const fileHash = sha256(fileData);

      try {
        const isAuthentic = await contract.isAuthentic(fileHash);
        setStatus(isAuthentic ? "Authentic" : "Not Authentic");
        setLicenseKey(fileHash);
      } catch (error) {
        setStatus(`Error: ${error.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-4">
          Cracked Software Detector
        </h1>
        
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
        />
        
        <div className="flex space-x-4 mb-4">
          <button
            onClick={generateAndStoreLicense}
            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition"
          >
            Generate & Store License
          </button>
          <button
            onClick={checkAuthenticity}
            className="flex-1 bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition"
          >
            Check Authenticity
          </button>
        </div>
        
        <p className="text-gray-700">
          <span className="font-semibold">Status:</span> {status}
        </p>
        <p className="text-gray-700 break-all">
          <span className="font-semibold">License Key:</span> {licenseKey}
        </p>
      </div>
    </div>
  );
}

export default Dashboard;