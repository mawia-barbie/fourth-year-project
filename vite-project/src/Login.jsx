import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/users/login`, { email, password });
      setSuccess(response.data.message);
      setShowOtp(true);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError('Please enter a valid 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/users/verify-otp`, { email, otp });
      const { access_token, role } = response.data;
      if (!access_token || !role) {
        throw new Error('Invalid response from server');
      }

      localStorage.setItem('token', access_token);
      setSuccess('Login successful!');

      // Navigate based on role
      if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard'); // Default to dashboard for 'user' or unknown roles
      }
    } catch (err) {
      console.error('OTP verification error:', err);
      setError(err.response?.data?.detail || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/users/login`, { email });
      setSuccess('OTP resent to your email');
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError(err.response?.data?.detail || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-md transform transition-all hover:scale-105">
        <h2 className="text-3xl font-extrabold text-center text-pink-800 mb-8">
          {showOtp ? 'Verify OTP' : 'Login'}
        </h2>
        {error && <p className="text-red-500 mb-6 text-center">{error}</p>}
        {success && <p className="text-green-500 mb-6 text-center">{success}</p>}
        {!showOtp ? (
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2 text-lg font-semibold">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                required
                disabled={loading}
              />
            </div>
            <div className="mb-8">
              <label className="block text-gray-700 mb-2 text-lg font-semibold">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
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
                'Login'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpVerify}>
            <div className="mb-8">
              <label className="block text-gray-700 mb-2 text-lg font-semibold">OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
                placeholder="Enter 6-digit OTP"
                maxLength={6}
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
                'Verify OTP'
              )}
            </button>
            <p className="mt-4 text-center text-gray-700">
              Didn't receive an OTP?{' '}
              <button
                onClick={handleResendOtp}
                className="text-pink-600 hover:underline disabled:opacity-50"
                disabled={loading}
              >
                Resend OTP
              </button>
            </p>
          </form>
        )}
        <p className="mt-6 text-center text-gray-700">
          Don't have an account?{' '}
          <a href="/register" className="text-pink-600 hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  );
};

export default Login;