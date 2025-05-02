import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { sha256 } from "js-sha256";
import LicenseManagerArtifact from "./LicenseManager.json";

function Dashboard() {
  const [file, setFile] = useState(null);
  const [softwareName, setSoftwareName] = useState("");
  const [selectedLicenseKey, setSelectedLicenseKey] = useState("");
  const [userLicenses, setUserLicenses] = useState([]);
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [contractData, setContractData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true); // Start with loading state
  const connectionLock = useRef(false);
  const maxRetries = 3;
  const retryDelay = 5000; // Increased to 5s for MetaMask reliability

  const contractAddress = "0x695130B36cbc7BFD9C5B8D3E32125564e0381F94"; // TODO: Replace with new deployed address
  const contractABI = LicenseManagerArtifact.abi;

  async function connectWallet(retryCount = 0) {
    if (connectionLock.current) {
      console.log("Connection already in progress, waiting...");
      return null;
    }

    if (!window.ethereum) {
      setStatus("Please install MetaMask!");
      console.error("MetaMask not detected");
      return null;
    }

    connectionLock.current = true;
    try {
      console.log(`Attempting eth_requestAccounts (retry ${retryCount})`);
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length === 0) {
        setStatus("No accounts found. Please connect an account in MetaMask.");
        console.warn("No accounts returned by MetaMask");
        return null;
      }
      console.log("Connected accounts:", accounts);
      return accounts;
    } catch (error) {
      if (error.code === -32002 && retryCount < maxRetries) {
        console.warn(`Retrying eth_requestAccounts (attempt ${retryCount + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return connectWallet(retryCount + 1);
      }
      setStatus(`Error connecting to MetaMask: ${error.message}`);
      console.error("connectWallet error:", error);
      return null;
    } finally {
      connectionLock.current = false;
    }
  }

  async function initializeContract() {
    console.log("Initializing contract...");
    const accounts = await connectWallet();
    if (!accounts) {
      return null;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum, {
        chainId: 1337,
        name: "ganache",
        ensAddress: null,
      });

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log("Signer address:", signerAddress);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 1337) {
        setStatus("Please connect MetaMask to Ganache (chainId 1337)");
        console.warn("Incorrect network, expected chainId 1337, got:", network.chainId);
        return null;
      }

      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      console.log("Contract initialized successfully");
      return { contract, signer };
    } catch (error) {
      setStatus(`Error initializing contract: ${error.message}`);
      console.error("initializeContract error:", error);
      return null;
    }
  }

  useEffect(() => {
    async function autoConnect() {
      if (!window.ethereum) {
        setStatus("Please install MetaMask!");
        console.error("MetaMask not detected");
        setIsConnecting(false);
        return;
      }

      try {
        console.log("Checking for existing MetaMask connection...");
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        console.log("Existing accounts check:", accounts);
        if (accounts.length > 0) {
          console.log("Existing MetaMask connection found:", accounts);
          const data = await initializeContract();
          if (data) {
            setContractData(data);
            setIsConnected(true);
            setStatus("Connected to MetaMask");
          } else {
            setStatus("Failed to initialize contract. Please try again.");
          }
        } else {
          console.log("No existing connection, attempting to connect...");
          const data = await initializeContract();
          if (data) {
            setContractData(data);
            setIsConnected(true);
            setStatus("Connected to MetaMask");
          } else {
            setStatus("Failed to connect to MetaMask. Please try again.");
          }
        }
      } catch (error) {
        console.error("Auto-connect error:", error);
        setStatus(`Error connecting to MetaMask: ${error.message}`);
      } finally {
        setIsConnecting(false);
      }
    }

    autoConnect();

    return () => {
      if (contractData?.contract) {
        console.log("Cleaning up contract event listeners");
        contractData.contract.removeAllListeners();
      }
    };
  }, []);

  useEffect(() => {
    async function fetchUserLicenses() {
      if (!contractData) return;

      const { contract, signer } = contractData;
      try {
        const signerAddress = await signer.getAddress();
        console.log("Fetching licenses for address:", signerAddress);
        const licenseKeys = await contract.getUserLicenses(signerAddress);
        console.log("Fetched license keys:", licenseKeys);

        const licenses = await Promise.all(
          licenseKeys.map(async (key) => {
            try {
              const details = await contract.getLicenseDetails(key);
              console.log(`Raw license details for ${key}:`, details);
              const softwareName = details.softwareName || "Untitled License";
              return { licenseKey: key, softwareName };
            } catch (error) {
              console.error(`Error fetching details for license ${key}:`, error);
              return { licenseKey: key, softwareName: "Error Fetching Name" };
            }
          })
        );

        console.log("Fetched licenses with details:", licenses);
        setUserLicenses(licenses);
        if (licenses.length > 0) {
          setSelectedLicenseKey(licenses[0].licenseKey);
        } else {
          setStatus("No licenses found. Generate a license first.");
        }
      } catch (error) {
        setStatus(`Error fetching licenses: ${error.message}`);
        console.error("fetchUserLicenses error:", error);
      }
    }

    async function setupEventListeners() {
      if (!contractData) return;

      const { contract } = contractData;
      console.log("Setting up event listeners");
      contract.on("LicenseTampered", (licenseKey, reporter) => {
        setStatus(`Alert: Document with license ${licenseKey} has been tampered!`);
        console.log("LicenseTampered event:", { licenseKey, reporter });
      });
      contract.on("LicenseCracked", (licenseKey, reporter) => {
        setStatus(`Alert: Document with license ${licenseKey} has been cracked!`);
        console.log("LicenseCracked event:", { licenseKey, reporter });
      });
    }

    if (contractData) {
      fetchUserLicenses();
      setupEventListeners();
    }
  }, [contractData]);

  async function generateAndStoreLicense() {
    if (!file) {
      setStatus("Please upload a file first!");
      return;
    }

    if (!contractData) {
      setStatus("Not connected to MetaMask. Please try again.");
      return;
    }

    const { contract, signer } = contractData;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = new Uint8Array(e.target.result);
        const fileHash = sha256(fileData);
        setLicenseKey(fileHash);
        console.log("Generated fileHash:", fileHash);

        const licenseName = softwareName.trim() || "Untitled License";
        console.log("License name to be used:", licenseName);

        const tx = await contract.issueLicense(fileHash, licenseName, { gasLimit: 300000 });
        await tx.wait();
        console.log("License issued transaction:", tx);

        setStatus(`License issued: ${fileHash} (Name: ${licenseName})`);

        const signerAddress = await signer.getAddress();
        const licenseKeys = await contract.getUserLicenses(signerAddress);
        console.log("Updated license keys:", licenseKeys);
        const licenses = await Promise.all(
          licenseKeys.map(async (key) => {
            const details = await contract.getLicenseDetails(key);
            const softwareName = details.softwareName || "Untitled License";
            return { licenseKey: key, softwareName };
          })
        );
        console.log("Updated licenses:", licenses);
        setUserLicenses(licenses);
        setSelectedLicenseKey(fileHash);
        setSoftwareName("");
      } catch (error) {
        let errorMessage = error.message;
        if (error.data && error.data.message) errorMessage = error.data.message;
        else if (error.reason) errorMessage = error.reason;
        setStatus(`Error issuing license: ${errorMessage}`);
        console.error("generateAndStoreLicense error:", error);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function checkAuthenticity() {
    if (!file) {
      setStatus("Please upload a file first!");
      return;
    }
    if (!selectedLicenseKey) {
      setStatus("Please select a license!");
      return;
    }

    if (!contractData) {
      setStatus("Not connected to MetaMask. Please try again.");
      return;
    }

    const { contract } = contractData;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = new Uint8Array(e.target.result);
        const fileHash = sha256(fileData);
        setLicenseKey(fileHash);
        console.log("checkAuthenticity - fileHash:", fileHash);
        console.log("checkAuthenticity - selectedLicenseKey:", selectedLicenseKey);

        let licenseExists = false;
        let licenseDetails;
        try {
          licenseDetails = await contract.getLicenseDetails(selectedLicenseKey);
          console.log("Raw license details:", licenseDetails);
          licenseExists = licenseDetails.exists;
        } catch (error) {
          setStatus(`Document is Inauthentic: No license found for key ${selectedLicenseKey}`);
          console.error("getLicenseDetails error:", error);
          return;
        }

        if (fileHash === selectedLicenseKey && licenseExists) {
          const isAuthentic = await contract.isAuthentic(fileHash);
          console.log("isAuthentic result:", isAuthentic);
          setStatus(isAuthentic ? "Document is Authentic" : "Document is Inauthentic: License exists but marked as tampered or cracked");
        } else {
          setStatus("Document is Inauthentic: Content modified (hash mismatch)");
          if (licenseExists) {
            try {
              const tx = await contract.reportTampered(selectedLicenseKey, { gasLimit: 300000 });
              await tx.wait();
              console.log("Tampering reported for:", selectedLicenseKey);
            } catch (error) {
              console.warn("reportTampered error:", error.message);
            }
          }
        }
      } catch (error) {
        setStatus(`Error checking authenticity: ${error.message}`);
        console.error("checkAuthenticity error:", error);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function reportCracked() {
    if (!selectedLicenseKey) {
      setStatus("Please select a license first!");
      return;
    }

    if (!contractData) {
      setStatus("Not connected to MetaMask. Please try again.");
      return;
    }

    const { contract } = contractData;
    setLoading(true);
    try {
      console.log("Checking license details for:", selectedLicenseKey);
      const licenseDetails = await contract.getLicenseDetails(selectedLicenseKey);
      console.log("Raw license details:", licenseDetails);
      const exists = licenseDetails.exists;
      const isCracked = licenseDetails.isCracked;
      if (!exists) {
        setStatus(`Error: License ${selectedLicenseKey} does not exist`);
        return;
      }
      if (isCracked) {
        setStatus(`Error: License ${selectedLicenseKey} is already reported as cracked`);
        return;
      }

      const tx = await contract.reportCracked(selectedLicenseKey, { gasLimit: 500000 });
      await tx.wait();
      setStatus(`License ${selectedLicenseKey} reported as cracked`);
      console.log("License cracked reported:", selectedLicenseKey);
    } catch (error) {
      let errorMessage = error.message;
      if (error.data && error.data.message) errorMessage = error.data.message;
      else if (error.reason) errorMessage = error.reason;
      else if (error.code === "CALL_EXCEPTION") errorMessage = "Transaction reverted: Check contract logic or license status";
      setStatus(`Error reporting cracked: ${errorMessage}`);
      console.error("reportCracked error:", error);
    } finally {
      setLoading(false);
    }
  }

  const getDisplayName = (softwareName, index, licenseKey) => {
    console.log("getDisplayName called:", { softwareName, index, licenseKey });
    if (!softwareName || softwareName === "Untitled License" || softwareName === "Error Fetching Name") {
      console.warn("Invalid softwareName, using fallback:", softwareName);
      return `License (${licenseKey.slice(0, 6)}...)`;
    }
    const sameNameCount = userLicenses.filter(
      (license, i) => license.softwareName === softwareName && i <= index
    ).length;
    if (sameNameCount === 1) {
      return softwareName;
    }
    return `${softwareName} #${sameNameCount} (${licenseKey.slice(0, 6)}...)`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6 relative">
      {isConnecting && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <svg className="animate-spin h-12 w-12 text-pink-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
            <p className="text-2xl text-white">Connecting to MetaMask...</p>
          </div>
        </div>
      )}
      <div className={`bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl transform transition-all hover:scale-105 ${isConnecting ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="text-5xl font-extrabold text-center text-pink-800 mb-10">
          Cracked Software Detector
        </h1>

        {!isConnected ? (
          <div className="text-center">
            <p className="text-xl text-gray-700 mb-8">{status || "Failed to connect to MetaMask. Please try again."}</p>
            <button
              onClick={async () => {
                setIsConnecting(true);
                const data = await initializeContract();
                if (data) {
                  setContractData(data);
                  setIsConnected(true);
                  setStatus("Connected to MetaMask");
                } else {
                  setStatus("Failed to connect to MetaMask. Please try again.");
                }
                setIsConnecting(false);
              }}
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-pink-400 transition-all duration-300"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="flex justify-center mb-8">
                <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            <input
              type="text"
              value={softwareName}
              onChange={(e) => setSoftwareName(e.target.value)}
              placeholder="Enter software name for license"
              className="block w-full text-xl text-gray-700 border border-pink-200 rounded-xl p-4 mb-8 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
              disabled={loading}
            />

            <select
              value={selectedLicenseKey}
              onChange={(e) => setSelectedLicenseKey(e.target.value)}
              className="block w-full text-xl text-gray-700 border border-pink-200 rounded-xl p-4 mb-8 h-16 bg-white focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
              disabled={loading}
            >
              <option value="">Select a Software License</option>
              {userLicenses.map(({ licenseKey, softwareName }, index) => {
                const displayName = getDisplayName(softwareName, index, licenseKey);
                console.log("Rendering option:", { licenseKey, softwareName, displayName });
                return (
                  <option key={licenseKey} value={licenseKey} title={licenseKey}>
                    {displayName.length > 50 ? `${displayName.slice(0, 47)}...` : displayName}
                  </option>
                );
              })}
            </select>

            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full text-lg text-gray-700 file:mr-6 file:py-4 file:px-8 file:rounded-full file:border-0 file:text-xl file:font-semibold file:bg-pink-100 file:text-pink-700 hover:file:bg-pink-200 mb-8 disabled:opacity-50"
              disabled={loading}
            />

            <div className="flex flex-col sm:flex-row sm:space-x-6 mb-10">
              <button
                onClick={generateAndStoreLicense}
                className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-pink-400 transition-all duration-300 disabled:opacity-50 shadow-lg mb-4 sm:mb-0"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  "Generate & Store License"
                )}
              </button>
              <button
                onClick={checkAuthenticity}
                className="flex-1 bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-xl py-4 px-8 rounded-xl hover:from-fuchsia-600 hover:to-pink-700 focus:outline-none focus:ring-4 focus:ring-fuchsia-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  "Check Authenticity"
                )}
              </button>
            </div>

            <button
              onClick={reportCracked}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xl py-4 px-8 rounded-xl hover:from-red-600 hover:to-pink-600 focus:outline-none focus:ring-4 focus:ring-red-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
              disabled={loading || !selectedLicenseKey}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Report Cracked"
              )}
            </button>

            <div className="mt-10 space-y-4">
              <p className="text-xl text-gray-700 break-words">
                <span className="font-semibold">Status:</span> {status}
              </p>
              <p className="text-xl text-gray-700 break-all" title={licenseKey}>
                <span className="font-semibold">License Key:</span>{" "}
                {licenseKey ? `${licenseKey.slice(0, 20)}...` : ""}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;