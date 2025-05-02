import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Admin = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingSoftware, setPendingSoftware] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const [usersResponse, softwareResponse] = await Promise.all([
          axios.get('http://localhost:8000/admin/pending-users', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get('http://localhost:8000/admin/pending-software', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setPendingUsers(usersResponse.data.pending_users);
        setPendingSoftware(softwareResponse.data.pending_software);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to fetch data. Ensure you have admin access.');
        if (err.response?.status === 403) {
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  const handleApproveUser = async (email) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:8000/admin/approve-user/${email}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      alert(`User ${email} approved`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to approve user');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectUser = async (email) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:8000/admin/reject-user/${email}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingUsers(pendingUsers.filter((user) => user.email !== email));
      alert(`User ${email} rejected`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject user');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveSoftware = async (hash) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:8000/admin/approve-software/${hash}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingSoftware(pendingSoftware.filter((s) => s.hash !== hash));
      alert(`Software approved`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to approve software');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectSoftware = async (hash) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:8000/admin/reject-software/${hash}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingSoftware(pendingSoftware.filter((s) => s.hash !== hash));
      alert(`Software rejected`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject software');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl transform transition-all hover:scale-105">
        <h2 className="text-3xl font-extrabold text-center text-pink-800 mb-8">Admin Panel</h2>
        {error && <p className="text-red-500 mb-6 text-center">{error}</p>}
        {loading && (
          <div className="flex justify-center mb-8">
            <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}

        <h3 className="text-2xl font-semibold mb-4 text-gray-800">Pending User Approvals</h3>
        {pendingUsers.length === 0 ? (
          <p className="text-gray-700 mb-8">No pending users.</p>
        ) : (
          <ul className="space-y-4 mb-8">
            {pendingUsers.map((user) => (
              <li key={user.email} className="flex justify-between items-center p-4 bg-pink-50 rounded-xl">
                <span className="text-lg text-gray-700">{user.email}</span>
                <div className="space-x-4">
                  <button
                    onClick={() => handleApproveUser(user.email)}
                    className="bg-gradient-to-r from-green-500 to-green-600 text-white text-lg py-2 px-6 rounded-xl hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-4 focus:ring-green-400 disabled:opacity-50"
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectUser(user.email)}
                    className="bg-gradient-to-r from-red-500 to-red-600 text-white text-lg py-2 px-6 rounded-xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-4 focus:ring-red-400 disabled:opacity-50"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-2xl font-semibold mb-4 text-gray-800">Pending Software Approvals</h3>
        {pendingSoftware.length === 0 ? (
          <p className="text-gray-700 mb-8">No pending software.</p>
        ) : (
          <ul className="space-y-4 mb-8">
            {pendingSoftware.map((software) => (
              <li key={software.hash} className="flex justify-between items-center p-4 bg-pink-50 rounded-xl">
                <div>
                  <p className="text-lg text-gray-700"><strong>Name:</strong> {software.name}</p>
                  <p className="text-lg text-gray-700"><strong>Version:</strong> {software.version}</p>
                  <p className="text-lg text-gray-700"><strong>Developer:</strong> {software.developer_email}</p>
                  <p className="text-lg text-gray-700 break-all"><strong>Hash:</strong> {software.hash.slice(0, 20)}...</p>
                </div>
                <div className="space-x-4">
                  <button
                    onClick={() => handleApproveSoftware(software.hash)}
                    className="bg-gradient-to-r from-green-500 to-green-600 text-white text-lg py-2 px-6 rounded-xl hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-4 focus:ring-green-400 disabled:opacity-50"
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectSoftware(software.hash)}
                    className="bg-gradient-to-r from-red-500 to-red-600 text-white text-lg py-2 px-6 rounded-xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-4 focus:ring-red-400 disabled:opacity-50"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white text-xl py-4 px-8 rounded-xl hover:from-gray-600 hover:to-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-400 transition-all duration-300"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Admin;