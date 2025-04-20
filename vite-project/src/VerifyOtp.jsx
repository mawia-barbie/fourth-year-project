import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

function VerifyOtp() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { state } = useLocation();
  const email = state?.email || ''; // Retrieve email from route state
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email) {
      setError('Email is missing. Please register or log in again.');
      setLoading(false);
      return;
    }

    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError('Please enter a valid 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/verify-otp`, {
        email,
        otp,
      });

      // Store the JWT token in localStorage (or use a state management solution)
      localStorage.setItem('token', response.data.access_token);

      setLoading(false);
      navigate('/dashboard'); // Redirect to dashboard or another protected route
    } catch (err) {
      setError(err.response?.data?.detail || 'OTP verification failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Verify OTP</h2>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <p className="text-gray-600 mb-4">
          An OTP has been sent to {email || 'your email'}.
        </p>
        <form onSubmit={handleVerifyOtp}>
          <div className="mb-4">
            <label className="block text-gray-700">Enter OTP</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full p-2 border rounded mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter 6-digit OTP"
              maxLength={6}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>
        <p className="mt-4 text-center">
          Didn't receive an OTP?{' '}
          <button
            onClick={() =>
              axios.post(`${API_URL}/login`, { email }).catch((err) =>
                setError(err.response?.data?.detail || 'Failed to resend OTP')
              )
            }
            className="text-blue-500 hover:underline"
            disabled={loading}
          >
            Resend OTP
          </button>
        </p>
      </div>
    </div>
  );
}

export default VerifyOtp;