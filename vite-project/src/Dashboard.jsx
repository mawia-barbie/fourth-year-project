import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { sha256 } from "js-sha256";
import LicenseManagerArtifact from "./LicenseManager.json";

function Dashboard() {
  const [file, setFile] = useState(null);
  const [softwareName, setSoftwareName] = useState("");
  const [selectedLicenseKey, setSelectedLicenseKey] = useState("");
  const [userLicenses, setUserLicenses] = useState([]); // Array of { licenseKey, softwareName }
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);

  const contractAddress = "0xe84AC9f961bc601f0C396882BEFdB96987972581"; // Updated contract address
  const contractABI = LicenseManagerArtifact.abi;

  async function getContract() {
    if (!window.ethereum) {
      setStatus("Please install MetaMask!");
      return null;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum, {
        chainId: 1337,
        name: "ganache",
        ensAddress: null,
      });

      await window.ethereum.request({ method: "eth_requestAccounts" });

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log("Signer address:", signerAddress);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 1337) {
        setStatus("Please connect MetaMask to Ganache (chainId 1337)");
        return null;
      }

      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      return { contract, signer };
    } catch (error) {
      setStatus(`Error connecting to blockchain: ${error.message}`);
      console.error("getContract error:", error);
      return null;
    }
  }

  useEffect(() => {
    async function fetchUserLicenses() {
      const contractData = await getContract();
      if (contractData) {
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
                const softwareName =
                  details.softwareName ||
                  details.name ||
                  details.software ||
                  (Array.isArray(details) ? details[0] : null) ||
                  "Untitled License";
                console.log(`Parsed softwareName for ${key}:`, softwareName);
                if (!softwareName || softwareName === "Untitled License") {
                  console.warn(`softwareName is invalid for ${key}:`, details);
                }
                return {
                  licenseKey: key,
                  softwareName,
                };
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
    }
    fetchUserLicenses();

    async function setupEventListeners() {
      const contractData = await getContract();
      if (contractData) {
        const { contract } = contractData;
        contract.on("LicenseTampered", (licenseKey, reporter) => {
          setStatus(`Alert: Document with license ${licenseKey} has been tampered!`);
          console.log("LicenseTampered event:", { licenseKey, reporter });
        });
        contract.on("LicenseCracked", (licenseKey, reporter) => {
          setStatus(`Alert: Document with license ${licenseKey} has been cracked!`);
          console.log("LicenseCracked event:", { licenseKey, reporter });
        });
      }
    }
    setupEventListeners();
  }, []);

  async function generateAndStoreLicense() {
    if (!file) {
      setStatus("Please upload a file first!");
      return;
    }

    const contractData = await getContract();
    if (!contractData) return;

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
        console.log("User-provided softwareName:", softwareName);
        console.log("License name to be used:", licenseName);

        const tx = await contract.issueLicense(fileHash, licenseName, { gasLimit: 300000 });
        await tx.wait();
        console.log("License issued transaction:", tx);

        const license = await contract.getLicenseDetails(fileHash);
        console.log("Raw stored license details:", license);
        const storedName =
          license.softwareName ||
          license.name ||
          license.software ||
          (Array.isArray(license) ? license[0] : null) ||
          "Untitled License";
        console.log("Parsed stored softwareName:", storedName);
        if (storedName !== licenseName) {
          console.warn("Stored softwareName does not match provided name!", {
            provided: licenseName,
            stored: storedName,
            rawDetails: license,
          });
        }

        setStatus(`License issued: ${fileHash} (Name: ${storedName})`);
        console.log("License issued:", license);

        const signerAddress = await signer.getAddress();
        const licenseKeys = await contract.getUserLicenses(signerAddress);
        console.log("Updated license keys:", licenseKeys);
        const licenses = await Promise.all(
          licenseKeys.map(async (key) => {
            const details = await contract.getLicenseDetails(key);
            console.log(`Raw updated details for ${key}:`, details);
            const softwareName =
              details.softwareName ||
              details.name ||
              details.software ||
              (Array.isArray(details) ? details[0] : null) ||
              "Untitled License";
            console.log(`Parsed updated softwareName for ${key}:`, softwareName);
            if (!softwareName || softwareName === "Untitled License") {
              console.warn(`softwareName is invalid for ${key}:`, details);
            }
            return {
              licenseKey: key,
              softwareName,
            };
          })
        );
        console.log("Updated licenses:", licenses);
        setUserLicenses(licenses);
        setSelectedLicenseKey(fileHash);
        setSoftwareName("");
      } catch (error) {
        let errorMessage = error.message;
        if (error.data && error.data.message) {
          errorMessage = error.data.message;
        } else if (error.reason) {
          errorMessage = error.reason;
        }
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

    const contractData = await getContract();
    if (!contractData) return;

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
          licenseExists = licenseDetails.exists || (Array.isArray(licenseDetails) && licenseDetails[1]) || true;
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

    const contractData = await getContract();
    if (!contractData) return;

    const { contract } = contractData;
    setLoading(true);
    try {
      console.log("Checking license details for:", selectedLicenseKey);
      const licenseDetails = await contract.getLicenseDetails(selectedLicenseKey);
      console.log("Raw license details:", licenseDetails);
      const exists = licenseDetails.exists || (Array.isArray(licenseDetails) && licenseDetails[1]) || true;
      const isCracked = licenseDetails.isCracked || (Array.isArray(licenseDetails) && licenseDetails[2]) || false;
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
      if (error.data && error.data.message) {
        errorMessage = error.data.message;
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.code === "CALL_EXCEPTION") {
        errorMessage = "Transaction reverted: Check contract logic or license status";
      }
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
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6">
      {/* Enhanced: Light baby pink gradient background (from-pink-50 to-pink-100) */}
      <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl transform transition-all hover:scale-105">
        {/* Enhanced: Large container (max-w-4xl), rounded-3xl, hover scale animation */}
        <h1 className="text-5xl font-extrabold text-center text-pink-800 mb-10">
          {/* Enhanced: Larger heading, pink-800 for theme consistency */}
          Cracked Software Detector
        </h1>

        {loading && (
          <div className="flex justify-center mb-8">
            <svg
              className="animate-spin h-8 w-8 text-pink-600"
              viewBox="0 0 24 24"
            >
              {/* Enhanced: Pink spinner (text-pink-600) */}
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          </div>
        )}

        <input
          type="text"
          value={softwareName}
          onChange={(e) => setSoftwareName(e.target.value)}
          placeholder="Enter software name for license"
          className="block w-full text-xl text-gray-700 border border-pink-200 rounded-xl p-4 mb-8 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
          disabled={loading}
        />
        {/* Enhanced: Larger text (text-xl), pink-200 border, pink-300 focus ring */}

        <select
          value={selectedLicenseKey}
          onChange={(e) => setSelectedLicenseKey(e.target.value)}
          className="block w-full text-xl text-gray-700 border border-pink-200 rounded-xl p-4 mb-8 h-16 bg-white focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
          disabled={loading}
        >
          <option value="">Select a Software License</option>
          {userLicenses.map(({ licenseKey, softwareName }, index) => {
            const displayName = getDisplayName(softwareName, index, licenseKey);
            console.log("Rendering option:", { licenseKey, softwareName, displayName });
            return (
              <option
                key={licenseKey}
                value={licenseKey}
                title={licenseKey} // Enhanced: Tooltip for full license key
              >
                {displayName.length > 50
                  ? `${displayName.slice(0, 47)}...`
                  : displayName}
                {/* Enhanced: Truncate long display names */}
              </option>
            );
          })}
        </select>
        {/* Enhanced: Larger select (text-xl, h-16), pink-200 border, pink-300 focus ring */}

        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-lg text-gray-500 file:mr-6 file:py-4 file:px-8 file:rounded-full file:border-0 file:text-xl file:font-semibold file:bg-pink-100 file:text-pink-700 hover:file:bg-pink-200 mb-8"
          disabled={loading}
        />
        {/* Enhanced: Larger file input button (text-xl, py-4, px-8), pink-100/pink-200 colors */}

        <div className="flex space-x-6 mb-10">
          <button
            onClick={generateAndStoreLicense}
            className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-pink-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-6 w-6 mr-3 text-white"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
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
                <svg
                  className="animate-spin h-6 w-6 mr-3 text-white"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              "Check Authenticity"
            )}
          </button>
        </div>
        {/* Enhanced: Pink-based gradient buttons (pink-500/rose-500, fuchsia-500/pink-600), larger text, hover animations, shadows */}

        <button
          onClick={reportCracked}
          className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xl py-4 px-8 rounded-xl hover:from-red-600 hover:to-pink-600 focus:outline-none focus:ring-4 focus:ring-red-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
          disabled={loading || !selectedLicenseKey}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin h-6 w-6 mr-3 text-white"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              "Report Cracked"
            )}
          </button>
          {/* Enhanced: Full-width pink/red gradient button, larger text, hover animation, shadow */}
  
          <div className="mt-10 space-y-4">
            <p className="text-xl text-gray-700 break-words">
              <span className="font-semibold">Status:</span> {status}
            </p>
            <p
              className="text-xl text-gray-700 break-all"
              title={licenseKey} // Enhanced: Tooltip for full license key
            >
              <span className="font-semibold">License Key:</span>{" "}
              {licenseKey ? `${licenseKey.slice(0, 20)}...` : ""}
              {/* Enhanced: Truncate license key, wrap text */}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  export default Dashboard;