import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { sha256 } from 'js-sha256';
import axios from 'axios';
import LicenseManagerArtifact from './LicenseManager.json';

const UserDashboard = () => {
  const [file, setFile] = useState(null);
  const [softwareName, setSoftwareName] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [selectedLicenseKey, setSelectedLicenseKey] = useState('');
  const [userLicenses, setUserLicenses] = useState([]);
  const [pendingSoftware, setPendingSoftware] = useState([]);
  const [approvedSoftware, setApprovedSoftware] = useState([]);
  const [rejectedSoftware, setRejectedSoftware] = useState([]);
  const [allApprovedSoftware, setAllApprovedSoftware] = useState([]);
  const [approvedSearchQuery, setApprovedSearchQuery] = useState('');
  const [allApprovedSearchQuery, setAllApprovedSearchQuery] = useState('');
  const [showFaq, setShowFaq] = useState(false);
  const [status, setStatus] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractData, setContractData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const connectionLock = useRef(false);
  const navigate = useNavigate();
  const maxRetries = 3;
  const retryDelay = 5000;

  const contractAddress = '0xc3ec5bd913e1D958e026C1D198E7905b9DecAfB9';
  const contractABI = LicenseManagerArtifact.abi;
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Switch to Ganache network
  async function switchToGanache() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x539' }], // 1337 in hex
      });
      console.log('Switched to Ganache network');
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x539',
                chainName: 'Ganache',
                rpcUrls: ['http://127.0.0.1:7545'],
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              },
            ],
          });
          console.log('Added and switched to Ganache network');
        } catch (addError) {
          console.error('Failed to add Ganache network:', addError);
          setError('Failed to add Ganache network to MetaMask');
          throw addError;
        }
      } else {
        console.error('Failed to switch network:', switchError);
        setError('Failed to switch to Ganache network');
        throw switchError;
      }
    }
  }

  // Connect to MetaMask
  async function connectWallet(retryCount = 0) {
    if (connectionLock.current) {
      console.log('Connection already in progress, waiting...');
      return null;
    }

    if (!window.ethereum) {
      setError('Please install MetaMask!');
      console.error('MetaMask not detected');
      return null;
    }

    connectionLock.current = true;
    try {
      console.log(`Attempting eth_requestAccounts (retry ${retryCount})`);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        setError('No accounts found. Please connect an account in MetaMask.');
        console.warn('No accounts returned by MetaMask');
        return null;
      }
      console.log('Connected accounts:', accounts);
      return accounts;
    } catch (err) {
      console.error('connectWallet error:', { code: err.code, message: err.message });
      if (err.code === -32002 && retryCount < maxRetries) {
        console.warn(`Retrying eth_requestAccounts (attempt ${retryCount + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return connectWallet(retryCount + 1);
      } else if (err.code === 4001) {
        setError('MetaMask connection rejected by user');
      } else {
        setError(`Error connecting to MetaMask: ${err.message}`);
      }
      return null;
    } finally {
      connectionLock.current = false;
    }
  }

  // Initialize contract
  async function initializeContract() {
    console.log('Initializing contract...');
    await switchToGanache();
    const accounts = await connectWallet();
    if (!accounts) {
      console.error('No accounts returned from connectWallet');
      return null;
    }
    console.log('Accounts retrieved:', accounts);

    try {
      if (!ethers.isAddress(contractAddress)) {
        console.error(`Invalid contract address: ${contractAddress}`);
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }
      console.log('Contract address validated:', contractAddress);

      const provider = new ethers.BrowserProvider(window.ethereum, {
        chainId: 1337,
        name: 'ganache',
        ensAddress: null,
      });
      console.log('Provider initialized');

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (!ethers.isAddress(signerAddress)) {
        console.error(`Invalid signer address: ${signerAddress}`);
        throw new Error(`Invalid signer address: ${signerAddress}`);
      }
      console.log('Signer address:', signerAddress);

      const network = await provider.getNetwork();
      console.log('Network retrieved:', network);
      if (Number(network.chainId) !== 1337) {
        console.error('Incorrect network, expected chainId 1337, got:', network.chainId);
        setError('Please connect MetaMask to Ganache (chainId 1337)');
        return null;
      }

      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      console.log('Contract initialized successfully');
      return { contract, signer, address: signerAddress };
    } catch (err) {
      console.error('initializeContract error:', err);
      setError(`Error initializing contract: ${err.message}`);
      return null;
    }
  }

  // Auto-connect to MetaMask and validate user access
  useEffect(() => {
    let isMounted = true;

    async function autoConnect() {
      if (!isMounted) return;
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      if (!window.ethereum) {
        setError('Please install MetaMask!');
        console.error('MetaMask not detected');
        setIsConnecting(false);
        return;
      }

      try {
        console.log('Checking for existing MetaMask connection...');
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        console.log('Existing accounts check:', accounts);
        if (accounts.length > 0) {
          console.log('Existing MetaMask connection found:', accounts);
          const data = await initializeContract();
          if (data && isMounted) {
            setContractData(data);
            setIsConnected(true);
            setSuccess('Connected to MetaMask');
            await axios.patch(
              `${API_URL}/users/update-address`,
              { address: data.address },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const userResponse = await axios.get(`${API_URL}/users/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userResponse.data.role === 'admin') {
              navigate('/admin');
            }
          } else if (isMounted) {
          }
        } else {
          console.log('No existing connection, attempting to connect...');
          const data = await initializeContract();
          if (data && isMounted) {
            setContractData(data);
            setIsConnected(true);
            setSuccess('Connected to MetaMask');
            await axios.patch(
              `${API_URL}/users/update-address`,
              { address: data.address },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const userResponse = await axios.get(`${API_URL}/users/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userResponse.data.role === 'admin') {
              navigate('/admin');
            }
          } else if (isMounted) {
            setError('Failed to connect to MetaMask. Please try again.');
          }
        }
      } catch (err) {
        console.error('Auto-connect error:', err);
        if (isMounted) {
          if (err.response?.status === 401) {
            localStorage.removeItem('token');
            navigate('/login');
          } else if (err.response?.status === 403) {
            navigate('/admin');
          } else {
            setError(`Error connecting to MetaMask: ${err.message}`);
          }
        }
      } finally {
        if (isMounted) {
          setIsConnecting(false);
        }
      }
    }

    autoConnect();

    return () => {
      isMounted = false;
      if (contractData?.contract) {
        console.log('Cleaning up contract event listeners');
        contractData.contract.removeAllListeners();
      }
    };
  }, [navigate]);

  // Fetch data and setup event listeners
  useEffect(() => {
    async function fetchData() {
      if (!contractData || !isConnected) return;
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to continue');
        navigate('/login');
        return;
      }

      try {
        const { contract, signer } = contractData;
        const signerAddress = await signer.getAddress();
        if (!ethers.isAddress(signerAddress)) {
          throw new Error(`Invalid signer address: ${signerAddress}`);
        }
        console.log('Fetching licenses for address:', signerAddress);
        const licenseKeys = await contract.getUserLicenses(signerAddress);
        console.log('Fetched license keys:', licenseKeys);

        const licenses = await Promise.all(
          licenseKeys.map(async (key) => {
            try {
              const details = await contract.getLicenseDetails(key);
              console.log(`Raw license details for ${key}:`, details);
              const softwareName = details.softwareName || 'Untitled License';
              return { licenseKey: key, softwareName };
            } catch (err) {
              console.error(`Error fetching details for license ${key}:`, err);
              return { licenseKey: key, softwareName: 'Error Fetching Name' };
            }
          })
        );
        console.log('Fetched licenses with details:', licenses);
        setUserLicenses(licenses);
        if (licenses.length > 0) {
          setSelectedLicenseKey(licenses[0].licenseKey);
        } else {
          setStatus('No licenses found. Generate a license first.');
        }

        const [pendingRes, approvedRes, rejectedRes, allApprovedRes] = await Promise.all([
          axios.get(`${API_URL}/software/pending`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/software/approved`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/software/rejected`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/software/all-approved`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setPendingSoftware(pendingRes.data.pending_software || []);
        setApprovedSoftware(approvedRes.data.approved_software || []);
        setRejectedSoftware(rejectedRes.data.rejected_software || []);
        setAllApprovedSoftware(allApprovedRes.data.all_approved_software || []);
      } catch (err) {
        if (err.code === 'UNSUPPORTED_OPERATION' && err.operation === 'getEnsAddress') {
          setError('ENS is not supported on this network. Please ensure all addresses are valid.');
        } else if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
        } else {
          setError(
            err.response?.data?.detail
              ? Array.isArray(err.response.data.detail)
                ? err.response.data.detail.map((e) => e.msg).join('; ')
                : err.response.data.detail
              : `Error fetching data: ${err.message}`
          );
        }
        console.error('fetchData error:', err);
      }
    }

    async function setupEventListeners() {
      if (!contractData) return;
      const { contract } = contractData;
      console.log('Setting up event listeners');
      contract.on('SoftwareAdded', (hash, developer) => {
        if (!ethers.isAddress(developer)) {
          console.warn('Invalid developer address in SoftwareAdded event:', developer);
        }
        setSuccess(`Software ${hash} added to blockchain`);
        fetchData();
        console.log('SoftwareAdded event:', { hash, developer });
      });
      contract.on('LicenseIssued', (licenseKey, owner, softwareHash) => {
        if (!ethers.isAddress(owner)) {
          console.warn('Invalid owner address in LicenseIssued event:', owner);
        }
        setSuccess(`License ${licenseKey} issued for software ${softwareHash}`);
        fetchData();
        console.log('LicenseIssued event:', { licenseKey, owner, softwareHash });
      });
      contract.on('LicenseTampered', (licenseKey, reporter) => {
        if (!ethers.isAddress(reporter)) {
          console.warn('Invalid reporter address in LicenseTampered event:', reporter);
        }
        setStatus(`Alert: Document with license ${licenseKey} has been tampered!`);
        console.log('LicenseTampered event:', { licenseKey, reporter });
      });
      contract.on('LicenseCracked', (licenseKey, reporter) => {
        if (!ethers.isAddress(reporter)) {
          console.warn('Invalid reporter address in LicenseCracked event:', reporter);
        }
        setStatus(`Alert: Document with license ${licenseKey} has been cracked!`);
        console.log('LicenseCracked event:', { licenseKey, reporter });
      });
      contract.on('SoftwareApproved', (hash) => {
        setSuccess(`Software ${hash} approved!`);
        fetchData();
        console.log('SoftwareApproved event:', { hash });
      });
      contract.on('SoftwareRejected', (hash) => {
        setSuccess(`Software ${hash} rejected!`);
        fetchData();
        console.log('SoftwareRejected event:', { hash });
      });
    }

    if (contractData) {
      fetchData();
      setupEventListeners();
    }
  }, [contractData, isConnected, navigate]);

  // Upload software and add to blockchain
  async function handleSoftwareUpload() {
    if (!file || !softwareName.trim() || !softwareVersion.trim()) {
      setError('Please provide a valid software name, version, and file');
      console.warn('Validation failed: Missing name, version, or file');
      return;
    }
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      console.warn('No MetaMask connection');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('name', softwareName.trim());
    formData.append('version', softwareVersion.trim());
    formData.append('file', file);

    console.log('Uploading software:', { name: softwareName, version: softwareVersion, fileName: file.name });
    for (let [key, value] of formData.entries()) {
      console.log(`FormData entry: ${key}=${value instanceof File ? value.name : value}`);
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.post(`${API_URL}/software/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      const fileHash = response.data.hash;
      setSuccess('Software uploaded successfully, adding to blockchain...');
      console.log('Software upload successful:', response.data);

      const { contract, address } = contractData;
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid address for addSoftware: ${address}`);
      }
      console.log('Calling addSoftware with:', { fileHash, address });
      const tx = await contract.addSoftware(fileHash, address, { gasLimit: 500000 });
      await tx.wait();
      setSuccess('Software added to blockchain successfully');
      console.log('Blockchain transaction confirmed:', tx);

      // Reset form
      setSoftwareName('');
      setSoftwareVersion('');
      setFile(null);

      // Refresh software lists
      const [pendingRes, approvedRes, rejectedRes, allApprovedRes] = await Promise.all([
        axios.get(`${API_URL}/software/pending`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/software/approved`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/software/rejected`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/software/all-approved`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setPendingSoftware(pendingRes.data.pending_software || []);
      setApprovedSoftware(approvedRes.data.approved_software || []);
      setRejectedSoftware(rejectedRes.data.rejected_software || []);
      setAllApprovedSoftware(allApprovedRes.data.all_approved_software || []);
    } catch (err) {
      let errorMessage = 'Error uploading software';
      if (err.code === 'UNSUPPORTED_OPERATION' && err.operation === 'getEnsAddress') {
        errorMessage = 'ENS is not supported on this network. Please ensure all addresses are valid.';
      } else if (err.response?.data?.detail) {
        console.log('FastAPI error response:', err.response.data.detail);
        if (Array.isArray(err.response.data.detail)) {
          errorMessage = err.response.data.detail.map((e) => e.msg).join('; ');
        } else {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      console.error('uploadSoftware error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Generate and store license
  async function handleGenerateLicense() {
    if (!file) {
      setError('Please upload a file first!');
      return;
    }
    if (!softwareName) {
      setError('Please enter software name for license!');
      return;
    }
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }

    const fileHash = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = new Uint8Array(e.target.result);
        resolve(sha256(fileData));
      };
      reader.readAsArrayBuffer(file);
    });

    if (!approvedSoftware.some((s) => s.hash === fileHash)) {
      setError('Software not approved. Please wait for admin approval.');
      return;
    }

    const { contract, signer } = contractData;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const licenseName = softwareName.trim() || 'Untitled License';
      console.log('Generating license for hash:', fileHash, 'Name:', licenseName);

      const tx = await contract.issueLicense(fileHash, licenseName, { gasLimit: 300000 });
      await tx.wait();
      console.log('License issued transaction:', tx);

      setSuccess(`License issued: ${fileHash} (Name: ${licenseName})`);

      const signerAddress = await signer.getAddress();
      if (!ethers.isAddress(signerAddress)) {
        throw new Error(`Invalid signer address: ${signerAddress}`);
      }
      const licenseKeys = await contract.getUserLicenses(signerAddress);
      const licenses = await Promise.all(
        licenseKeys.map(async (key) => {
          const details = await contract.getLicenseDetails(key);
          const softwareName = details.softwareName || 'Untitled License';
          return { licenseKey: key, softwareName };
        })
      );
      setUserLicenses(licenses);
      setSelectedLicenseKey(fileHash);
      setSoftwareName('');
      setFile(null);
    } catch (err) {
      let errorMessage = err.message;
      if (err.code === 'UNSUPPORTED_OPERATION' && err.operation === 'getEnsAddress') {
        errorMessage = 'ENS is not supported on this network. Please ensure all addresses are valid.';
      } else if (err.data && err.data.message) {
        errorMessage = err.data.message;
      } else if (err.reason) {
        errorMessage = err.reason;
      }
      setError(`Error issuing license: ${errorMessage}`);
      console.error('generateAndStoreLicense error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Check authenticity
  async function handleCheckAuthenticity() {
    if (!file) {
      setError('Please upload a file first!');
      return;
    }
    if (!selectedLicenseKey) {
      setError('Please select a license!');
      return;
    }
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }

    const { contract } = contractData;
    setLoading(true);
    setError('');
    setSuccess('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = new Uint8Array(e.target.result);
        const fileHash = sha256(fileData);
        setLicenseKey(fileHash);
        console.log('checkAuthenticity - fileHash:', fileHash);
        console.log('checkAuthenticity - selectedLicenseKey:', selectedLicenseKey);

        let licenseExists = false;
        let licenseDetails;
        try {
          licenseDetails = await contract.getLicenseDetails(selectedLicenseKey);
          console.log('Raw license details:', licenseDetails);
          licenseExists = licenseDetails.exists;
        } catch (err) {
          setError(`Document is Inauthentic: No license found for key ${selectedLicenseKey}`);
          console.error('getLicenseDetails error:', err);
          return;
        }

        if (fileHash === selectedLicenseKey && licenseExists) {
          const isAuthentic = await contract.isAuthentic(fileHash);
          console.log('isAuthentic result:', isAuthentic);
          setSuccess(
            isAuthentic
              ? 'Document is Authentic'
              : 'Document is Inauthentic: License exists but marked as tampered or cracked'
          );
        } else {
          setError('Document is Inauthentic: Content modified (hash mismatch)');
          if (licenseExists) {
            try {
              const tx = await contract.reportTampered(selectedLicenseKey, { gasLimit: 300000 });
              await tx.wait();
              console.log('Tampering reported for:', selectedLicenseKey);
            } catch (err) {
              console.warn('reportTampered error:', err.message);
            }
          }
        }
      } catch (err) {
        let errorMessage = err.message;
        if (err.code === 'UNSUPPORTED_OPERATION' && err.operation === 'getEnsAddress') {
          errorMessage = 'ENS is not supported on this network. Please ensure all addresses are valid.';
        }
        setError(`Error checking authenticity: ${errorMessage}`);
        console.error('checkAuthenticity error:', err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Report cracked license
  async function handleReportCracked() {
    if (!selectedLicenseKey) {
      setError('Please select a license first!');
      return;
    }
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }

    const { contract } = contractData;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('Checking license details for:', selectedLicenseKey);
      const licenseDetails = await contract.getLicenseDetails(selectedLicenseKey);
      console.log('Raw license details:', licenseDetails);
      const exists = licenseDetails.exists;
      const isCracked = licenseDetails.isCracked;

      if (!exists) {
        setError(`No license found for key ${selectedLicenseKey}`);
        console.error(`No license found for key ${selectedLicenseKey}`);
        return;
      }

      if (isCracked) {
        setError(`License ${selectedLicenseKey} is already marked as cracked`);
        console.warn(`License ${selectedLicenseKey} already cracked`);
        return;
      }

      const tx = await contract.reportCracked(selectedLicenseKey, { gasLimit: 300000 });
      await tx.wait();
      console.log('Cracked license reported for:', selectedLicenseKey);
      setSuccess(`License ${selectedLicenseKey} reported as cracked successfully`);
    } catch (err) {
      let errorMessage = err.message;
      if (err.code === 'UNSUPPORTED_OPERATION' && err.operation === 'getEnsAddress') {
        errorMessage = 'ENS is not supported on this network. Please ensure all addresses are valid.';
      } else if (err.data && err.data.message) {
        errorMessage = err.data.message;
      } else if (err.reason) {
        errorMessage = err.reason;
      }
      setError(`Error reporting cracked license: ${errorMessage}`);
      console.error('reportCracked error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter software based on search query
  const filteredApprovedSoftware = approvedSoftware.filter((item) =>
    [item.name, item.version, item.hash].some((field) =>
      field?.toLowerCase().includes(approvedSearchQuery.toLowerCase())
    )
  );

  const filteredAllApprovedSoftware = allApprovedSoftware.filter((item) =>
    [item.name, item.version, item.developer_email, item.hash].some((field) =>
      field?.toLowerCase().includes(allApprovedSearchQuery.toLowerCase())
    )
  );

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
      <div
        className={`bg-white rounded-3xl shadow-2xl p-12 w-full max-w-6xl transform transition-all hover:scale-105 ${
          isConnecting ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-5xl font-extrabold text-center text-pink-800">User Dashboard</h2>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              navigate('/login');
            }}
            className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 transition-all"
          >
            Logout
          </button>
        </div>

        {!isConnected ? (
          <div className="text-center">
            <p className="text-xl text-gray-700 mb-8">{error || 'Failed to connect to MetaMask. Please try again.'}</p>
            <button
              onClick={async () => {
                setIsConnecting(true); // Fixed syntax error
                const data = await initializeContract();
                if (data) {
                  setContractData(data);
                  setIsConnected(true);
                  setSuccess('Connected to MetaMask');
                } else {
                  setError('Failed to connect to MetaMask. Please try again.');
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
            {error && <p className="text-red-500 mb-4 text-center text-xl">{error}</p>}
            {success && <p className="text-green-500 mb-4 text-center text-xl">{success}</p>}
            {status && <p className="text-yellow-500 mb-4 text-center text-xl">{status}</p>}
            {loading && (
              <div className="flex justify-center mb-8">
                <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-2xl font-semibold text-gray-800 mb-6">Upload Software</h3>
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2 text-lg font-semibold">Software Name</label>
                  <input
                    type="text"
                    value={softwareName}
                    onChange={(e) => setSoftwareName(e.target.value)}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                    placeholder="Enter software name"
                    disabled={loading}
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2 text-lg font-semibold">Software Version</label>
                  <input
                    type="text"
                    value={softwareVersion}
                    onChange={(e) => setSoftwareVersion(e.target.value)}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                    placeholder="Enter software version"
                    disabled={loading}
                  />
                </div>
                <div className="mb-8">
                  <label className="block text-gray-700 mb-2 text-lg font-semibold">Software File</label>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 transition-all"
                    disabled={loading}
                  />
                </div>
                <button
                  onClick={handleSoftwareUpload}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-pink-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
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
                    'Upload Software'
                  )}
                </button>
              </div>

              <div>
                <h3 className="text-2xl font-semibold text-gray-800 mb-6">Manage Licenses</h3>
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2 text-lg font-semibold">Select License</label>
                  <select
                    value={selectedLicenseKey}
                    onChange={(e) => setSelectedLicenseKey(e.target.value)}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                    disabled={loading}
                  >
                    <option value="">Select a license</option>
                    {userLicenses.map((license) => (
                      <option key={license.licenseKey} value={license.licenseKey}>
                        {license.softwareName} ({license.licenseKey.slice(0, 10)}...)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-8">
                  <button
                    onClick={handleGenerateLicense}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white text-xl py-4 px-8 rounded-xl hover:from-green-600 hover:to-teal-600 focus:outline-none focus:ring-4 focus:ring-green-400 transition-all duration-300 disabled:opacity-50 shadow-lg mb-4"
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
                      'Generate License'
                    )}
                  </button>
                  <button
                    onClick={handleCheckAuthenticity}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xl py-4 px-8 rounded-xl hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-4 focus:ring-blue-400 transition-all duration-300 disabled:opacity-50 shadow-lg mb-4"
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
                      'Check Authenticity'
                    )}
                  </button>
                  <button
                    onClick={handleReportCracked}
                    className="w-full bg-gradient-to-r from-red-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-red-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-red-400 transition-all duration-300 disabled:opacity-50 shadow-lg"
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
                      'Report Cracked License'
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Software</h3>
              {pendingSoftware.length === 0 && !loading ? (
                <p className="text-gray-600">No pending software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingSoftware.map((item) => (
                        <tr key={item.hash} className="border-b hover:bg-gray-100">
                          <td className="py-3 px-4 text-gray-800">{item.name}</td>
                          <td className="py-3 px-4 text-gray-800">{item.version}</td>
                          <td className="py-3 px-4 text-gray-800 truncate max-w-xs" title={item.hash}>
                            {item.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-800">Approved Software</h3>
                <div className="w-1/3">
                  <input
                    type="text"
                    value={approvedSearchQuery}
                    onChange={(e) => setApprovedSearchQuery(e.target.value)}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                    placeholder="Search by name, version, or hash"
                    disabled={loading}
                  />
                </div>
              </div>
              {filteredApprovedSoftware.length === 0 && !loading ? (
                <p className="text-gray-600">No approved software matches your search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApprovedSoftware.map((item) => (
                        <tr key={item.hash} className="border-b hover:bg-gray-100">
                          <td className="py-3 px-4 text-gray-800">{item.name}</td>
                          <td className="py-3 px-4 text-gray-800">{item.version}</td>
                          <td className="py-3 px-4 text-gray-800 truncate max-w-xs" title={item.hash}>
                            {item.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-semibold text-gray-800 mb-6">Rejected Software</h3>
              {rejectedSoftware.length === 0 && !loading ? (
                <p className="text-gray-600">No rejected software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedSoftware.map((item) => (
                        <tr key={item.hash} className="border-b hover:bg-gray-100">
                          <td className="py-3 px-4 text-gray-800">{item.name}</td>
                          <td className="py-3 px-4 text-gray-800">{item.version}</td>
                          <td className="py-3 px-4 text-gray-800 truncate max-w-xs" title={item.hash}>
                            {item.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-800">All Approved Software</h3>
                <div className="w-1/3">
                  <input
                    type="text"
                    value={allApprovedSearchQuery}
                    onChange={(e) => setAllApprovedSearchQuery(e.target.value)}
                    className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                    placeholder="Search by name, version, email, or hash"
                    disabled={loading}
                  />
                </div>
              </div>
              {filteredAllApprovedSoftware.length === 0 && !loading ? (
                <p className="text-gray-600">No approved software matches your search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Developer Email</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAllApprovedSoftware.map((item) => (
                        <tr key={item.hash} className="border-b hover:bg-gray-100">
                          <td className="py-3 px-4 text-gray-800">{item.name}</td>
                          <td className="py-3 px-4 text-gray-800">{item.version}</td>
                          <td className="py-3 px-4 text-gray-800">{item.developer_email}</td>
                          <td className="py-3 px-4 text-gray-800 truncate max-w-xs" title={item.hash}>
                            {item.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-12">
              <button
                onClick={() => setShowFaq(!showFaq)}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl py-4 px-8 rounded-xl hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-4 focus:ring-pink-400 transition-all duration-300 shadow-lg"
              >
                {showFaq ? 'Hide FAQ' : 'Show FAQ'}
              </button>
              {showFaq && (
                <div className="mt-6 bg-pink-50 p-6 rounded-xl">
                  <h3 className="text-2xl font-semibold text-gray-800 mb-4">FAQ</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">How do I upload software?</h4>
                      <p className="text-gray-600">
                        Enter the software name and version, select a file, and click "Upload Software." The file will be hashed and sent to the blockchain after admin approval.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">Why is my software pending?</h4>
                      <p className="text-gray-600">
                        All uploaded software requires admin approval. Check the "Pending Software" table for status updates.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">How do I generate a license?</h4>
                      <p className="text-gray-600">
                        Upload an approved software file, enter a name, and click "Generate License." The license will be issued on the blockchain.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">How do I check authenticity?</h4>
                      <p className="text-gray-600">
                        Upload a file, select a license from the dropdown, and click "Check Authenticity." The system will verify if the file matches the license.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">What does "Report Cracked License" do?</h4>
                      <p className="text-gray-600">
                        If you suspect a license has been compromised, select it and click "Report Cracked License" to mark it as cracked on the blockchain.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">How do I search for software?</h4>
                      <p className="text-gray-600">
                        Use the search bar above the "Approved Software" or "All Approved Software" tables to filter by name, version, hash, or developer email.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-700">What if I encounter an error?</h4>
                      <p className="text-gray-600">
                        Ensure MetaMask is connected to Ganache (chainId 1337). Check error messages displayed on the dashboard or contact support.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;