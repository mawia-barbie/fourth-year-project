import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App


// import { useState } from "react";
// import { ethers } from "ethers";
// import { sha256 } from "js-sha256";
// import LicenseManagerArtifact from "./LicenseManager.json";

// function Dashboard() {
//   const [file, setFile] = useState(null);
//   const [status, setStatus] = useState("");
//   const [licenseKey, setLicenseKey] = useState("");
//   const [loading, setLoading] = useState(false);

//   const contractAddress = "0x918dC49c6EB3203a550d264B95e9bFa81542DCc5"; // Replace with the new deployed address
//   const contractABI = LicenseManagerArtifact.abi;

//   async function getContract() {
//     if (!window.ethereum) {
//       setStatus("Please install MetaMask!");
//       return null;
//     }
//     try {
//       const provider = new ethers.BrowserProvider(window.ethereum);
//       await provider.send("eth_requestAccounts", []);
//       const signer = await provider.getSigner();
//       const contract = new ethers.Contract(contractAddress, contractABI, signer);
//       return contract;
//     } catch (error) {
//       setStatus(`Error connecting to blockchain: ${error.message}`);
//       return null;
//     }
//   }

//   async function generateAndStoreLicense() {
//     if (!file) {
//       setStatus("Please upload a file first!");
//       return;
//     }

//     const contract = await getContract();
//     if (!contract) return;

//     setLoading(true);
//     const reader = new FileReader();
//     reader.onload = async (e) => {
//       try {
//         const fileData = new Uint8Array(e.target.result);
//         const fileHash = sha256(fileData);
//         setLicenseKey(fileHash);

//         const tx = await contract.issueLicense(fileHash, "Software1"); // Added softwareId
//         await tx.wait();
//         setStatus(`License issued: ${fileHash}`);
//       } catch (error) {
//         setStatus(`Error: ${error.message}`);
//       } finally {
//         setLoading(false);
//       }
//     };
//     reader.readAsArrayBuffer(file);
//   }

//   async function checkAuthenticity() {
//     if (!file) {
//       setStatus("Please upload a file first!");
//       return;
//     }

//     const contract = await getContract();
//     if (!contract) return;

//     setLoading(true);
//     const reader = new FileReader();
//     reader.onload = async (e) => {
//       try {
//         const fileData = new Uint8Array(e.target.result);
//         const fileHash = sha256(fileData);
//         setLicenseKey(fileHash);

//         const isAuthentic = await contract.isAuthentic(fileHash);
//         setStatus(isAuthentic ? "Authentic" : "Not Authentic");
//       } catch (error) {
//         setStatus(`Error: ${error.message}`);
//       } finally {
//         setLoading(false);
//       }
//     };
//     reader.readAsArrayBuffer(file);
//   }

//   return (
//     <div className="min-h-screen bg-gray-100 flex items-center justify-center">
//       <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
//         <h1 className="text-2xl font-bold text-center mb-4">
//           Cracked Software Detector
//         </h1>

//         <input
//           type="file"
//           onChange={(e) => setFile(e.target.files[0])}
//           className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
//           disabled={loading}
//         />

//         <div className="flex space-x-4 mb-4">
//           <button
//             onClick={generateAndStoreLicense}
//             className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition"
//             disabled={loading}
//           >
//             {loading ? "Processing..." : "Generate & Store License"}
//           </button>
//           <button
//             onClick={checkAuthenticity}
//             className="flex-1 bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition"
//             disabled={loading}
//           >
//             {loading ? "Processing..." : "Check Authenticity"}
//           </button>
//         </div>

//         <p className="text-gray-700">
//           <span className="font-semibold">Status:</span> {status}
//         </p>
//         <p className="text-gray-700 break-all">
//           <span className="font-semibold">License Key:</span> {licenseKey}
//         </p>
//       </div>
//     </div>
//   );
// }

// export default Dashboard;
