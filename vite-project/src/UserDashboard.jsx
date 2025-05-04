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
  const [status, setStatus] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractData, setContractData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [role, setRole] = useState('');
  const connectionLock = useRef(false);
  const navigate = useNavigate();
  const maxRetries = 3;
  const retryDelay = 5000;

  const contractAddress = ' 0x235D5aA50CC82f2eA8BaAd7CcABc5d0979ad863C'; // Update with actual deployed address
  const contractABI = LicenseManagerArtifact.abi;
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      if (err.code === -32002 && retryCount < maxRetries) {
        console.warn(`Retrying eth_requestAccounts (attempt ${retryCount + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return connectWallet(retryCount + 1);
      }
      setError(`Error connecting to MetaMask: ${err.message}`);
      console.error('connectWallet error:', err);
      return null;
    } finally {
      connectionLock.current = false;
    }
  }

  // Initialize contract
  async function initializeContract() {
    console.log('Initializing contract...');
    const accounts = await connectWallet();
    if (!accounts) {
      return null;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum, {
        chainId: 1337,
        name: 'ganache',
        ensAddress: null,
      });

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log('Signer address:', signerAddress);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 1337) {
        setError('Please connect MetaMask to Ganache (chainId 1337)');
        console.warn('Incorrect network, expected chainId 1337, got:', network.chainId);
        return null;
      }

      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      console.log('Contract initialized successfully');
      return { contract, signer, address: signerAddress };
    } catch (err) {
      setError(`Error initializing contract: ${err.message}`);
      console.error('initializeContract error:', err);
      return null;
    }
  }

  // Auto-connect to MetaMask and validate user access
  useEffect(() => {
    async function autoConnect() {
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
          if (data) {
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
            setRole(userResponse.data.role);
            if (userResponse.data.role === 'admin') {
              navigate('/admin');
            }
          } else {
            setError('Failed to initialize contract. Please try again.');
          }
        } else {
          console.log('No existing connection, attempting to connect...');
          const data = await initializeContract();
          if (data) {
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
            setRole(userResponse.data.role);
            if (userResponse.data.role === 'admin') {
              navigate('/admin');
            }
          } else {
            setError('Failed to connect to MetaMask. Please try again.');
          }
        }
      } catch (err) {
        console.error('Auto-connect error:', err);
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
        } else if (err.response?.status === 403) {
          navigate('/admin');
        } else {
          setError(`Error connecting to MetaMask: ${err.message}`);
        }
      } finally {
        setIsConnecting(false);
      }
    }

    autoConnect();

    return () => {
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
        if (err.response?.status === 401) {
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
        setSuccess(`Software ${hash} added to blockchain`);
        fetchData();
        console.log('SoftwareAdded event:', { hash, developer });
      });
      contract.on('LicenseIssued', (licenseKey, owner, softwareHash) => {
        setSuccess(`License ${licenseKey} issued for software ${softwareHash}`);
        fetchData();
        console.log('LicenseIssued event:', { licenseKey, owner, softwareHash });
      });
      contract.on('LicenseTampered', (licenseKey, reporter) => {
        setStatus(`Alert: Document with license ${licenseKey} has been tampered!`);
        console.log('LicenseTampered event:', { licenseKey, reporter });
      });
      contract.on('LicenseCracked', (licenseKey, reporter) => {
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
    // Validate inputs
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

    // Construct FormData
    const formData = new FormData();
    formData.append('name', softwareName.trim());
    formData.append('version', softwareVersion.trim());
    formData.append('file', file);

    // Log FormData entries for debugging
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
      if (err.response?.data?.detail) {
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
      if (err.data && err.data.message) errorMessage = err.data.message;
      else if (err.reason) errorMessage = err.reason;
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
        setError(`Error checking authenticity: ${err.message}`);
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
        setError(`Error: License ${selectedLicenseKey} does not exist`);
        return;
      }
      if (isCracked) {
        setError(`Error: License ${selectedLicenseKey} is already reported as cracked`);
        return;
      }

      const tx = await contract.reportCracked(selectedLicenseKey, { gasLimit: 500000 });
      await tx.wait();
      setSuccess(`License ${selectedLicenseKey} reported as cracked`);
      console.log('License cracked reported:', selectedLicenseKey);
    } catch (err) {
      let errorMessage = err.message;
      if (err.data && err.data.message) errorMessage = err.data.message;
      else if (err.reason) errorMessage = err.reason;
      else if (err.code === 'CALL_EXCEPTION') errorMessage = 'Transaction reverted: Check contract logic or license status';
      setError(`Error reporting cracked: ${errorMessage}`);
      console.error('reportCracked error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Approve software (for admins)
  async function handleApproveSoftware(hash) {
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }
    if (!window.confirm(`Are you sure you want to approve software with hash ${hash}?`)) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const { contract } = contractData;
      await axios.post(
        `${API_URL}/admin/approve-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tx = await contract.approveSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setSuccess(`Software ${hash} approved successfully`);

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
      let errorMessage = 'Error approving software';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMessage = err.response.data.detail.map((e) => e.msg).join('; ');
        } else {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      console.error('approveSoftware error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Reject software (for admins)
  async function handleRejectSoftware(hash) {
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }
    if (!window.confirm(`Are you sure you want to reject software with hash ${hash}?`)) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const { contract } = contractData;
      await axios.post(
        `${API_URL}/admin/reject-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tx = await contract.rejectSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setSuccess(`Software ${hash} rejected successfully`);

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
      let errorMessage = 'Error rejecting software';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMessage = err.response.data.detail.map((e) => e.msg).join('; ');
        } else {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      console.error('rejectSoftware error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Get display name for licenses
  const getDisplayName = (softwareName, index, licenseKey) => {
    console.log('getDisplayName called:', { softwareName, index, licenseKey });
    if (!softwareName || softwareName === 'Untitled License' || softwareName === 'Error Fetching Name') {
      console.warn('Invalid softwareName, using fallback:', softwareName);
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
      <div
        className={`bg-white rounded-3xl shadow-2xl p-12 w-full max-w-5xl transform transition-all hover:scale-105 ${
          isConnecting ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-5xl font-extrabold text-center text-pink-800">Cracked Software Detector</h1>
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
                setIsConnecting(true);
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
            {error ? (
              typeof error === 'string' ? (
                <p className="text-red-500 mb-4 text-center text-xl">{error}</p>
              ) : (
                <p className="text-red-500 mb-4 text-center text-xl">An unexpected error occurred</p>
              )
            ) : null}
            {success && <p className="text-green-500 mb-4 text-center text-xl">{success}</p>}
            {loading && (
              <div className="flex justify-center mb-8">
                <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <input
                type="text"
                value={softwareName}
                onChange={(e) => setSoftwareName(e.target.value)}
                placeholder="Enter software name"
                className="text-xl text-gray-700 border border-pink-200 rounded-xl p-4 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                disabled={loading}
              />
              <input
                type="text"
                value={softwareVersion}
                onChange={(e) => setSoftwareVersion(e.target.value)}
                placeholder="Enter software version"
                className="text-xl text-gray-700 border border-pink-200 rounded-xl p-4 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                disabled={loading}
              />
            </div>

            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full text-lg text-gray-700 file:mr-6 file:py-4 file:px-8 file:rounded-full file:border-0 file:text-xl file:font-semibold file:bg-pink-100 file:text-pink-700 hover:file:bg-pink-200 mb-8 disabled:opacity-50"
              disabled={loading}
            />

            <div className="flex flex-col sm:flex-row sm:space-x-6 mb-10">
              <button
                onClick={handleSoftwareUpload}
                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xl py-4 px-8 rounded-xl hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-4 focus:ring-blue-400 transition-all duration-300 disabled:opacity-50 shadow-lg mb-4 sm:mb-0"
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
              <button
                onClick={handleGenerateLicense}
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
                  'Generate License'
                )}
              </button>
              <button
                onClick={handleCheckAuthenticity}
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
                  'Check Authenticity'
                )}
              </button>
            </div>

            <select
              value={selectedLicenseKey}
              onChange={(e) => setSelectedLicenseKey(e.target.value)}
              className="block w-full text-xl text-gray-700 border border-pink-200 rounded-xl p-4 mb-8 h-16 bg-white focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
              disabled={loading}
            >
              <option value="">Select a Software License</option>
              {userLicenses.map(({ licenseKey, softwareName }, index) => {
                const displayName = getDisplayName(softwareName, index, licenseKey);
                console.log('Rendering option:', { licenseKey, softwareName, displayName });
                return (
                  <option key={licenseKey} value={licenseKey} title={licenseKey}>
                    {displayName.length > 50 ? `${displayName.slice(0, 47)}...` : displayName}
                  </option>
                );
              })}
            </select>

            <button
              onClick={handleReportCracked}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xl py-4 px-8 rounded-xl hover:from-red-600 hover:to-pink-600 focus:outline-none focus:ring-4 focus:ring-red-400 transition-all duration-300 disabled:opacity-50 shadow-lg mb-10"
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
                'Report Cracked'
              )}
            </button>

            {/* Pending Software Table */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Pending Software</h2>
              {pendingSoftware.length === 0 ? (
                <p className="text-gray-600">No pending software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                        {role === 'admin' && <th className="py-3 px-4 text-left">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingSoftware.map((software) => (
                        <tr key={software.hash} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{software.name}</td>
                          <td className="py-3 px-4">{software.version}</td>
                          <td className="py-3 px-4 truncate max-w-xs" title={software.hash}>
                            {software.hash.slice(0, 10)}...
                          </td>
                          {role === 'admin' && (
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleApproveSoftware(software.hash)}
                                className="bg-green-500 text-white py-1 px-3 rounded hover:bg-green-600 mr-2"
                                disabled={loading}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectSoftware(software.hash)}
                                className="bg-red-500 text-white py-1 px-3 rounded hover:bg-red-600"
                                disabled={loading}
                              >
                                Reject
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Approved Software Table */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Approved Software</h2>
              {approvedSoftware.length === 0 ? (
                <p className="text-gray-600">No approved software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedSoftware.map((software) => (
                        <tr key={software.hash} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{software.name}</td>
                          <td className="py-3 px-4">{software.version}</td>
                          <td className="py-3 px-4 truncate max-w-xs" title={software.hash}>
                            {software.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Rejected Software Table */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Rejected Software</h2>
              {rejectedSoftware.length === 0 ? (
                <p className="text-gray-600">No rejected software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedSoftware.map((software) => (
                        <tr key={software.hash} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{software.name}</td>
                          <td className="py-3 px-4">{software.version}</td>
                          <td className="py-3 px-4 truncate max-w-xs" title={software.hash}>
                            {software.hash.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* All Approved Software Table */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">All Approved Software</h2>
              {allApprovedSoftware.length === 0 ? (
                <p className="text-gray-600">No approved software available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-lg shadow">
                    <thead>
                      <tr className="bg-pink-100 text-gray-700">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Version</th>
                        <th className="py-3 px-4 text-left">Hash</th>
                        <th className="py-3 px-4 text-left">Developer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allApprovedSoftware.map((software) => (
                        <tr key={software.hash} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{software.name}</td>
                          <td className="py-3 px-4">{software.version}</td>
                          <td className="py-3 px-4 truncate max-w-xs" title={software.hash}>
                            {software.hash.slice(0, 10)}...
                          </td>
                          <td className="py-3 px-4">{software.developer_email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-10 space-y-4">
              <p className="text-xl text-gray-700 break-words">
                <span className="font-semibold">Status:</span> {status}
              </p>
              <p className="text-xl text-gray-700 break-all" title={licenseKey}>
                <span className="font-semibold">License Key:</span>{' '}
                {licenseKey ? `${licenseKey.slice(0, 20)}...` : ''}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;