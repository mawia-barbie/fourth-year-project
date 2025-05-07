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

  // Auto-connect to MetaMask and validate admin access
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
            // Update user address in backend
            await axios.patch(
              `${API_URL}/users/update-address`,
              { address: data.address },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            // Verify admin role
            const userResponse = await axios.get(`${API_URL}/users/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userResponse.data.role !== 'admin') {
              navigate('/dashboard');
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
            if (userResponse.data.role !== 'admin') {
              navigate('/dashboard');
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
          navigate('/dashboard');
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

  // Fetch pending users
  const fetchPendingUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Pending users response:', response.data);
      const users = response.data.pending_users || [];
      setPendingUsers(users);
      console.log('Pending users set:', users);
    } catch (err) {
      console.error('fetchPendingUsers error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch pending users');
        setPendingUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch accepted users
  const fetchAcceptedUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/accepted-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Accepted users response:', response.data);
      const users = response.data.accepted_users || [];
      setAcceptedUsers(users);
      console.log('Accepted users set:', users);
    } catch (err) {
      console.error('fetchAcceptedUsers error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch accepted users');
        setAcceptedUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch rejected users
  const fetchRejectedUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/rejected-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Rejected users response:', response.data);
      const users = response.data.rejected_users || [];
      setRejectedUsers(users);
      console.log('Rejected users set:', users);
    } catch (err) {
      console.error('fetchRejectedUsers error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch rejected users');
        setRejectedUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch pending software
  const fetchPendingSoftware = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/pending-software`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Pending software response:', response.data);
      const software = response.data.pending_software || [];
      setPendingSoftware(software);
      console.log('Pending software set:', software);
    } catch (err) {
      console.error('fetchPendingSoftware error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch pending software');
        setPendingSoftware([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch accepted software
  const fetchAcceptedSoftware = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/accepted-software`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Accepted software response:', response.data);
      const software = response.data.accepted_software || [];
      setAcceptedSoftware(software);
      console.log('Accepted software set:', software);
    } catch (err) {
      console.error('fetchAcceptedSoftware error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch accepted software');
        setAcceptedSoftware([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch rejected software
  const fetchRejectedSoftware = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/rejected-software`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Rejected software response:', response.data);
      const software = response.data.rejected_software || [];
      setRejectedSoftware(software);
      console.log('Rejected software set:', software);
    } catch (err) {
      console.error('fetchRejectedSoftware error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch rejected software');
        setRejectedSoftware([]);
      }
    } finally {
      setLoading(false);
    }
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
      await axios.post(
        `${API_URL}/admin/approve-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      setSuccess(`User ${email} approved successfully`);
      fetchAcceptedUsers(); // Refresh accepted users
    } catch (err) {
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
      await axios.post(
        `${API_URL}/admin/reject-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      setSuccess(`User ${email} rejected successfully`);
      fetchRejectedUsers(); // Refresh rejected users
    } catch (err) {
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
      await axios.post(
        `${API_URL}/admin/archive-user/${email}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to archive ${email}`);
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
      await axios.post(
        `${API_URL}/admin/feedback`,
        { email: feedbackEmail, feedback: feedbackText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Feedback submitted successfully');
      setFeedbackEmail('');
      setFeedbackText('');
    } catch (err) {
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
      await axios.post(
        `${API_URL}/admin/approve-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tx = await contract.approveSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} approved successfully`);
      fetchAcceptedSoftware(); // Refresh accepted software
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to approve software: ${err.message}`);
      console.error('approveSoftware error:', err);
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
      await axios.post(
        `${API_URL}/admin/reject-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tx = await contract.rejectSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} rejected successfully`);
      fetchRejectedSoftware(); // Refresh rejected software
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to reject software: ${err.message}`);
      console.error('rejectSoftware error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when tab changes
  useEffect(() => {
    if (!isConnected) return;
    if (activeTab === 'pending-users') {
      fetchPendingUsers();
    } else if (activeTab === 'accepted-users') {
      fetchAcceptedUsers();
    } else if (activeTab === 'rejected-users') {
      fetchRejectedUsers();
    } else if (activeTab === 'pending-software') {
      fetchPendingSoftware();
    } else if (activeTab === 'accepted-software') {
      fetchAcceptedSoftware();
    } else if (activeTab === 'rejected-software') {
      fetchRejectedSoftware();
    }
  }, [activeTab, isConnected]);

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

              {activeTab === 'pending-users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Users</h3>
                  {pendingUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No pending users available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
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
                    <p className="text-gray-600">No accepted users available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {acceptedUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
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
                    <p className="text-gray-600">No rejected users available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white rounded-lg shadow">
                        <thead>
                          <tr className="bg-pink-100 text-gray-700">
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rejectedUsers.map((user) => (
                            <tr key={user.email} className="border-b hover:bg-gray-100">
                              <td className="py-3 px-4 text-gray-800">{user.email}</td>
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
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
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