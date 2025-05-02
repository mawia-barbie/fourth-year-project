import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingSoftware, setPendingSoftware] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Check if token exists and attempt to fetch data to validate admin access
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  // Fetch pending users
  const fetchPendingUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      console.log('Token:', token); // Debug: Log the token
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Pending users response:', response.data); // Debug: Log response
      setPendingUsers(response.data.pending_users || []);
    } catch (err) {
      console.error('Fetch error:', err); // Debug: Log full error
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard'); // Redirect non-admins to dashboard
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
      console.log('Token:', token); // Debug: Log token
      if (!token) {
        throw new Error('No token found');
      }
      const response = await axios.get(`${API_URL}/admin/pending-software`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Pending software response:', response.data); // Debug: Log response
      setPendingSoftware(response.data.pending_software || []);
    } catch (err) {
      console.error('Fetch error:', err); // Debug: Log full error
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else if (err.response?.status === 403) {
        navigate('/dashboard'); // Redirect non-admins to dashboard
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch pending software');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle user approval
  const handleApproveUser = async (email) => {
    if (!window.confirm(`Are you sure you want to approve ${email}?`)) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/admin/approve-user/${email}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/admin/reject-user/${email}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    if (!window.confirm(`Are you sure you want to approve this software?`)) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/admin/approve-software/${hash}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess('Software approved successfully');
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to approve software with hash ${hash}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle software rejection
  const handleRejectSoftware = async (hash) => {
    if (!window.confirm(`Are you sure you want to reject this software?`)) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/admin/reject-software/${hash}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingSoftware(pendingSoftware.filter((item) => item.hash !== hash));
      setSuccess('Software rejected successfully');
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to reject software with hash ${hash}`);
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
    if (activeTab === 'users') {
      fetchPendingUsers();
    } else if (activeTab === 'software') {
      fetchPendingSoftware();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 p-6">
      <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-extrabold text-pink-800">Admin Dashboard</h2>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              navigate('/login');
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-xl hover:bg-red-600 transition-all"
          >
            Logout
          </button>
        </div>
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
          {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
          {success && <p className="text-green-500 mb-4 text-center">{success}</p>}
          {activeTab === 'users' && (
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-6">Pending Users</h3>
              {loading ? (
                <div className="flex justify-center">
                  <svg className="animate-spin h-8 w-8 text-pink-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
              ) : pendingUsers.length === 0 ? (
                <p className="text-gray-600">No pending users.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-pink-100">
                        <th className="p-4 text-gray-700">Email</th>
                        <th className="p-4 text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingUsers.map((user) => (
                        <tr key={user.email} className="border-b hover:bg-gray-100">
                          <td className="p-4 text-gray-800">{user.email}</td>
                          <td className="p-4">
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
              {loading ? (
                <div className="flex justify-center">
                  <svg className="animate-spin h-8 w-8 text-pink-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
              ) : pendingSoftware.length === 0 ? (
                <p className="text-gray-600">No pending software.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-pink-100">
                        <th className="p-4 text-gray-700">Name</th>
                        <th className="p-4 text-gray-700">Version</th>
                        <th className="p-4 text-gray-700">Developer Email</th>
                        <th className="p-4 text-gray-700">Hash</th>
                        <th className="p-4 text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingSoftware.map((item) => (
                        <tr key={item.hash} className="border-b hover:bg-gray-100">
                          <td className="p-4 text-gray-800">{item.name}</td>
                          <td className="p-4 text-gray-800">{item.version}</td>
                          <td className="p-4 text-gray-800">{item.developer_email}</td>
                          <td className="p-4 text-gray-800 truncate max-w-xs">{item.hash}</td>
                          <td className="p-4">
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
      </div>
    </div>
  );
};

export default AdminDashboard;