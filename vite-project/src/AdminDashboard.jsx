import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import axios from 'axios';
import LicenseManagerArtifact from './LicenseManager.json';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingSoftware, setPendingSoftware] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [contractData, setContractData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const connectionLock = useRef(false);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const contractAddress = '0xc3ec5bd913e1D958e026C1D198E7905b9DecAfB9'; // Update with actual deployed address
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
      setPendingUsers(response.data.pending_users || []);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch pending users');
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
      setPendingSoftware(response.data.pending_software || []);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard');
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch pending software');
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
      contract.on('SoftwareApproved', (hash) => {
        setSuccess(`Software ${hash} approved on blockchain`);
        fetchPendingSoftware();
        console.log('SoftwareApproved event:', { hash });
      });
      contract.on('SoftwareRejected', (hash) => {
        setSuccess(`Software ${hash} rejected on blockchain`);
        fetchPendingSoftware();
        console.log('SoftwareRejected event:', { hash });
      });
    }

    if (contractData) {
      setupEventListeners();
    }
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
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to reject ${email}`);
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
      // Call backend API
      await axios.post(
        `${API_URL}/admin/approve-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Call smart contract
      const tx = await contract.approveSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} approved successfully`);
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
      // Call backend API
      await axios.post(
        `${API_URL}/admin/reject-software/${hash}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Call smart contract
      const tx = await contract.rejectSoftware(hash, { gasLimit: 300000 });
      await tx.wait();
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess(`Software ${hash} rejected successfully`);
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to reject software: ${err.message}`);
      console.error('rejectSoftware error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle create admin
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/admin/create-admin`,
        { email: newAdminEmail, password: newAdminPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(response.data.message);
      setNewAdminEmail('');
      setNewAdminPassword('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when tab changes
  useEffect(() => {
    if (!isConnected) return;
    if (activeTab === 'users') {
      fetchPendingUsers();
    } else if (activeTab === 'software') {
      fetchPendingSoftware();
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
            <div className="flex mb-6">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'users'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pending Users
              </button>
              <button
                onClick={() => setActiveTab('software')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'software'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pending Software
              </button>
              <button
                onClick={() => setActiveTab('create-admin')}
                className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-all ${
                  activeTab === 'create-admin'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Create Admin
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

              {activeTab === 'users' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Users</h3>
                  {pendingUsers.length === 0 && !loading ? (
                    <p className="text-gray-600">No pending users.</p>
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

              {activeTab === 'software' && (
                <div>
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

              {activeTab === 'create-admin' && (
                <div>
                  <h3 className="text-2xl font-semibold text-gray-800 mb-6">Create New Admin</h3>
                  <form onSubmit={handleCreateAdmin} className="max-w-md mx-auto">
                    <div className="mb-6">
                      <label className="block text-gray-700 mb-2 text-lg font-semibold">Email</label>
                      <input
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="mb-8">
                      <label className="block text-gray-700 mb-2 text-lg font-semibold">Password</label>
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                        required
                        disabled={loading}
                      />
                      <p className="text-sm text-gray-600 mt-2">
                        Password must be 8+ characters with 1 uppercase, 1 number, 1 special character.
                      </p>
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
                        'Create Admin'
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