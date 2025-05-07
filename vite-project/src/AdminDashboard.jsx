import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import axios from 'axios';
import LicenseManagerArtifact from './LicenseManager.json';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('pending-users');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [acceptedUsers, setAcceptedUsers] = useState([]);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [pendingSoftware, setPendingSoftware] = useState([]);
  const [acceptedSoftware, setAcceptedSoftware] = useState([]);
  const [rejectedSoftware, setRejectedSoftware] = useState([]);
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [contractData, setContractData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const connectionLock = useRef(false);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const contractAddress = '0xc3ec5bd913e1D958e026C1D198E7905b9DecAfB9';
  const contractABI = LicenseManagerArtifact.abi;
  const maxRetries = 3;
  const retryDelay = 5000;

  // Connect to MetaMask with retry logic
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
      console.error('connectWallet error:', { message: err.message, code: err.code });
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
      console.error('initializeContract error:', { message: err.message, reason: err.reason });
      return null;
    }
  }

  // Auto-connect to MetaMask and validate admin access
  useEffect(() => {
    async function autoConnect() {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token found, redirecting to login');
        navigate('/login');
        return;
      }

      console.log('Token:', token);
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
        let data;
        if (accounts.length > 0) {
          console.log('Existing MetaMask connection found:', accounts);
          data = await initializeContract();
        } else {
          console.log('No existing connection, attempting to connect...');
          data = await initializeContract();
        }

        if (data) {
          setContractData(data);
          setIsConnected(true);
          setSuccess('Connected to MetaMask');
          const addressResponse = await axios.patch(
            `${API_URL}/users/update-address`,
            { address: data.address },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          console.log('Address update response:', addressResponse.data);
          const userResponse = await axios.get(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log('User data:', userResponse.data);
          if (userResponse.data.role !== 'admin') {
            console.warn('User is not admin, redirecting to dashboard');
            navigate('/dashboard');
          }
        } else {
          setError('Failed to initialize contract. Please try again.');
        }
      } catch (err) {
        console.error('Auto-connect error:', {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
          headers: err.response?.headers,
        });
        if (err.response?.status === 401) {
          console.warn('Unauthorized, clearing token and redirecting to login');
          localStorage.removeItem('token');
          navigate('/login');
        } else if (err.response?.status === 403) {
          console.warn('Forbidden, redirecting to dashboard');
          navigate('/dashboard');
        } else {
          setError(`Error connecting to MetaMask or backend: ${err.message}`);
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

  // Fetch data with retry logic
  const fetchWithRetry = async (url, setData, dataKey, maxRetries = 3, retryDelay = 5000) => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No token found, redirecting to login');
      navigate('/login');
      return;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching ${url} (attempt ${attempt}) with token: ${token.slice(0, 10)}...`);
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log(`${dataKey} raw response:`, JSON.stringify(response.data, null, 2));
        if (!response.data || typeof response.data !== 'object' || !Array.isArray(response.data[dataKey])) {
          console.warn(`Invalid response format for ${dataKey}:`, response.data);
          throw new Error(`Invalid response format for ${dataKey}`);
        }
        const data = response.data[dataKey];
        setData(data);
        console.log(`${dataKey} set:`, data);
        if (data.length === 0) {
          console.log(`No ${dataKey} found`);
          setError(`No ${dataKey.replace('_', ' ')} available.`);
        }
        return;
      } catch (err) {
        console.error(`fetch ${dataKey} error (attempt ${attempt}):`, {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
          headers: err.response?.headers,
        });
        if (err.response?.status === 401) {
          console.warn('Unauthorized, clearing token and redirecting to login');
          localStorage.removeItem('token');
          navigate('/login');
          return;
        } else if (err.response?.status === 403) {
          console.warn('Forbidden, redirecting to dashboard');
          navigate('/dashboard');
          return;
        } else if (attempt < maxRetries) {
          console.warn(`Retrying ${url} in ${retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          setError(err.response?.data?.detail || `Failed to fetch ${dataKey.replace('_', ' ')}: ${err.message}`);
          setData([]);
        }
      } finally {
        if (attempt === maxRetries || !error) {
          setLoading(false);
        }
      }
    }
  };

  // Fetch pending users
  const fetchPendingUsers = () => {
    fetchWithRetry(`${API_URL}/admin/pending-users`, setPendingUsers, 'pending_users');
  };

  // Fetch accepted users
  const fetchAcceptedUsers = () => {
    fetchWithRetry(`${API_URL}/admin/accepted-users`, setAcceptedUsers, 'accepted_users');
  };

  // Fetch rejected users
  const fetchRejectedUsers = () => {
    fetchWithRetry(`${API_URL}/admin/rejected-users`, setRejectedUsers, 'rejected_users');
  };

  // Fetch archived users
  const fetchArchivedUsers = () => {
    fetchWithRetry(`${API_URL}/admin/archived-users`, setArchivedUsers, 'archived_users');
  };

  // Fetch pending software
  const fetchPendingSoftware = () => {
    fetchWithRetry(`${API_URL}/admin/pending-software`, setPendingSoftware, 'pending_software');
  };

  // Fetch accepted software
  const fetchAcceptedSoftware = () => {
    fetchWithRetry(`${API_URL}/admin/accepted-software`, setAcceptedSoftware, 'accepted_software');
  };

  // Fetch rejected software
  const fetchRejectedSoftware = () => {
    fetchWithRetry(`${API_URL}/admin/rejected-software`, setRejectedSoftware, 'rejected_software');
  };

  // Setup event listeners
  useEffect(() => {
    async function setupEventListeners() {
      if (!contractData) return;
      const { contract } = contractData;
      console.log('Setting up event listeners');
      contract.on('SoftwareApproved', (hash, event) => {
        console.log('SoftwareApproved event received:', { hash, event });
        const hashString = hash.toString();
        setSuccess(`Software ${hashString} approved on blockchain`);
        fetchPendingSoftware();
        fetchAcceptedSoftware();
        console.log('SoftwareApproved processed:', { hash: hashString });
      });
      contract.on('SoftwareRejected', (hash, event) => {
        console.log('SoftwareRejected event received:', { hash, event });
        const hashString = hash.toString();
        setSuccess(`Software ${hashString} rejected on blockchain`);
        fetchPendingSoftware();
        fetchRejectedSoftware();
        console.log('SoftwareRejected processed:', { hash: hashString });
      });
    }

    if (contractData) {
      setupEventListeners();
    }

    return () => {
      if (contractData?.contract) {
        console.log('Removing event listeners');
        contractData.contract.removeAllListeners('SoftwareApproved');
        contractData.contract.removeAllListeners('SoftwareRejected');
      }
    };
  }, [contractData]);

  // Handle user approval
  const handleApproveUser = async (email) => {
    if (!window.confirm(`Are you sure you want to approve ${email}?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/approve-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Approve user response:', response.data);
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      setSuccess(`User ${email} approved successfully`);
      fetchAcceptedUsers();
    } catch (err) {
      console.error('handleApproveUser error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      });
      setError(err.response?.data?.detail || `Failed to approve ${email}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle user rejection
  const handleRejectUser = async (email) => {
    if (!window.confirm(`Are you sure you want to reject ${email}?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/reject-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Reject user response:', response.data);
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      setSuccess(`User ${email} rejected successfully`);
      fetchRejectedUsers();
    } catch (err) {
      console.error('handleRejectUser error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      });
      setError(err.response?.data?.detail || `Failed to reject ${email}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle user archiving
  const handleArchiveUser = async (email, status) => {
    if (!window.confirm(`Are you sure you want to archive ${email}?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/archive-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Archive user response:', response.data);
      if (status === 'pending') {
        setPendingUsers(pendingUsers.filter((user) => user.email !== email));
        fetchPendingUsers();
      } else if (status === 'accepted') {
        setAcceptedUsers(acceptedUsers.filter((user) => user.email !== email));
        fetchAcceptedUsers();
      } else if (status === 'rejected') {
        setRejectedUsers(rejectedUsers.filter((user) => user.email !== email));
        fetchRejectedUsers();
      }
      setSuccess(`User ${email} archived successfully`);
      fetchArchivedUsers();
    } catch (err) {
      console.error('handleArchiveUser error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      });
      setError(err.response?.data?.detail || `Failed to archive ${email}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle user unarchiving
  const handleUnarchiveUser = async (email) => {
    if (!window.confirm(`Are you sure you want to unarchive ${email}?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/unarchive-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Unarchive user response:', response.data);
      setArchivedUsers(archivedUsers.filter((user) => user.email !== email));
      setSuccess(`User ${email} unarchived successfully`);
      fetchPendingUsers();
      fetchAcceptedUsers();
      fetchRejectedUsers();
    } catch (err) {
      console.error('handleUnarchiveUser error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      });
      setError(err.response?.data?.detail || `Failed to unarchive ${email}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle feedback submission
  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/feedback`,
        { email: feedbackEmail, feedback: feedbackText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Feedback response:', response.data);
      setSuccess('Feedback submitted successfully');
      setFeedbackEmail('');
      setFeedbackText('');
    } catch (err) {
      console.error('handleSubmitFeedback error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      });
      setError(err.response?.data?.detail || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  // Handle software approval
  const handleApproveSoftware = async (hash) => {
    if (!window.confirm(`Are you sure you want to approve software with hash ${hash}?`)) return;
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const { contract } = contractData;
      const apiResponse = await axios.post(
        `${API_URL}/admin/approve-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Approve software API response:', apiResponse.data);
      const tx = await contract.approveSoftware(hash, { gasLimit: 300000 });
      const receipt = await tx.wait();
      console.log('Blockchain transaction receipt:', receipt);
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} approved successfully`);
      fetchAcceptedSoftware();
    } catch (err) {
      console.error('handleApproveSoftware error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
        reason: err.reason,
      });
      setError(err.response?.data?.detail || `Failed to approve software: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle software rejection
  const handleRejectSoftware = async (hash) => {
    if (!window.confirm(`Are you sure you want to reject software with hash ${hash}?`)) return;
    if (!contractData) {
      setError('Not connected to MetaMask. Please try again.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const { contract } = contractData;
      const apiResponse = await axios.post(
        `${API_URL}/admin/reject-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Reject software API response:', apiResponse.data);
      const tx = await contract.rejectSoftware(hash, { gasLimit: 300000 });
      const receipt = await tx.wait();
      console.log('Blockchain transaction receipt:', receipt);
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} rejected successfully`);
      fetchRejectedSoftware();
    } catch (err) {
      console.error('handleRejectSoftware error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
        reason: err.reason,
      });
      setError(err.response?.data?.detail || `Failed to reject software: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when tab changes or connection is established
  useEffect(() => {
    if (!isConnected) return;
    console.log(`Active tab changed to: ${activeTab}`);
    if (activeTab === 'pending-users') {
      fetchPendingUsers();
    } else if (activeTab === 'accepted-users') {
      fetchAcceptedUsers();
    } else if (activeTab === 'rejected-users') {
      fetchRejectedUsers();
    } else if (activeTab === 'archived-users') {
      fetchArchivedUsers();
    } else if (activeTab === 'pending-software') {
      fetchPendingSoftware();
    } else if (activeTab === 'accepted-software') {
      fetchAcceptedSoftware();
    } else if (activeTab === 'rejected-software') {
      fetchRejectedSoftware();
    }
  }, [activeTab, isConnected]);

  // Refresh user data manually
  const handleRefreshUsers = () => {
    console.log('Manually refreshing user data...');
    setError('');
    setSuccess('');
    if (activeTab === 'pending-users') {
      fetchPendingUsers();
    } else if (activeTab === 'accepted-users') {
      fetchAcceptedUsers();
    } else if (activeTab === 'rejected-users') {
      fetchRejectedUsers();
    } else if (activeTab === 'archived-users') {
      fetchArchivedUsers();
    }
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
        className={`bg-white rounded-3xl shadow-2xl p-12 w-full max-w-6xl transform transition-all hover:scale-105 ${
          isConnecting ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-5xl font-extrabold text-center text-pink-800">Admin Dashboard</h2>
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
            <div className="flex mb-6 flex-wrap">
              <button
                onClick={() => setActiveTab('pending-users')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'pending-users'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pending Users
              </button>
              <button
                onClick={() => setActiveTab('accepted-users')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'accepted-users'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Accepted Users
              </button>
              <button
                onClick={() => setActiveTab('rejected-users')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'rejected-users'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Rejected Users
              </button>
              <button
                onClick={() => setActiveTab('archived-users')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'archived-users'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Archived Users
              </button>
              <button
                onClick={() => setActiveTab('pending-software')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'pending-software'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pending Software
              </button>
              <button
                onClick={() => setActiveTab('accepted-software')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'accepted-software'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Accepted Software
              </button>
              <button
                onClick={() => setActiveTab('rejected-software')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'rejected-software'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Rejected Software
              </button>
              <button
                onClick={() => setActiveTab('feedback')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'feedback'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Feedback
              </button>
            </div>

            <div className="p-6 bg-gray-50 rounded-b-xl">
              {error && <p className="text-red-500 mb-4 text-center text-xl">{error}</p>}
              {success && <p className="text-green-500 mb-4 text-center text-xl">{success}</p>}
              {loading && (
                <div className="flex justify-center mb-8">
                  <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
              )}

              {(activeTab === 'pending-users' ||
                activeTab === 'accepted-users' ||
                activeTab === 'rejected-users' ||
                activeTab === 'archived-users') && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleRefreshUsers}
                    className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
                    disabled={loading}
                  >
                    Refresh Users
                  </button>
                </div>
              )}

              {activeTab === 'pending-users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Users</h3>
                  {pendingUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No pending users available. Try refreshing or check the backend logs.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Role</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
                              <td className="py-3 px-4 text-gray-800">{user.role}</td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleApproveUser(user.email)}
                                  className="bg-green-500 text-white px-4 py-2 rounded-xl mr-2 hover:bg-green-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectUser(user.email)}
                                  className="bg-red-500 text-white px-4 py-2 rounded-xl mr-2 hover:bg-red-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleArchiveUser(user.email, 'pending')}
                                  className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Archive
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'accepted-users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Accepted Users</h3>
                  {acceptedUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No accepted users available. Try refreshing or check the backend logs.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Role</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {acceptedUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
                              <td className="py-3 px-4 text-gray-800">{user.role}</td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleArchiveUser(user.email, 'accepted')}
                                  className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Archive
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'rejected-users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Rejected Users</h3>
                  {rejectedUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No rejected users available. Try refreshing or check the backend logs.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Role</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rejectedUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
                              <td className="py-3 px-4 text-gray-800">{user.role}</td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleArchiveUser(user.email, 'rejected')}
                                  className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Archive
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'archived-users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Archived Users</h3>
                  {archivedUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No archived users available. Try refreshing or check the backend logs.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Role</th>
                            <th className="py-3 px-4 text-left">Status</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {archivedUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
                              <td className="py-3 px-4 text-gray-800">{user.role}</td>
                              <td className="py-3 px-4 text-gray-800">
                                {user.is_approved ? 'Accepted' : user.is_rejected ? 'Rejected' : 'Pending'}
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleUnarchiveUser(user.email)}
                                  className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Unarchive
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pending-software' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Software</h3>
                  {pendingSoftware.length === 0 && !loading ? (
                    <p className="text-gray-600">No pending software available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Name</th>
                            <th className="py-3 px-4 text-left">Version</th>
                            <th className="py-3 px-4 text-left">Developer Email</th>
                            <th className="py-3 px-4 text-left">Hash</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingSoftware.map((item) => (
                            <tr key={item.hash} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{item.name}</td>
                              <td className="py-3 px-4 text-gray-800">{item.version}</td>
                              <td className="py-3 px-4 text-gray-800">{item.developer_email}</td>
                              <td className="py-3 px-4 text-gray-800 truncate max-w-xs" title={item.hash}>
                                {item.hash.slice(0, 10)}...
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleApproveSoftware(item.hash)}
                                  className="bg-green-500 text-white px-4 py-2 rounded-xl mr-2 hover:bg-green-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectSoftware(item.hash)}
                                  className="bg-red-500 text-white px-4 py-2 rounded-xl hover:bg-red-600 disabled:opacity-50"
                                  disabled={loading}
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'accepted-software' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Accepted Software</h3>
                  {acceptedSoftware.length === 0 && !loading ? (
                    <p className="text-gray-600">No accepted software available.</p>
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
                          {acceptedSoftware.map((item) => (
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
              )}

              {activeTab === 'rejected-software' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Rejected Software</h3>
                  {rejectedSoftware.length === 0 && !loading ? (
                    <p className="text-gray-600">No rejected software available.</p>
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
                          {rejectedSoftware.map((item) => (
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
              )}

              {activeTab === 'feedback' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Submit Feedback</h3>
                  <form onSubmit={handleSubmitFeedback} className="max-w-md mx-auto">
                    <div className="mb-6">
                      <label className="block text-gray-700 mb-2 text-lg font-semibold">User Email</label>
                      <input
                        type="email"
                        value={feedbackEmail}
                        onChange={(e) => setFeedbackEmail(e.target.value)}
                        className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="mb-8">
                      <label className="block text-gray-700 mb-2 text-lg font-semibold">Feedback</label>
                      <textarea
                        value={feedbackEmail}
                        onChange={(e) => setFeedbackEmail(e.target.value)}
                        className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                        rows="5"
                        required
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="submit"
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
                        'Submit Feedback'
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;