import { useState } from 'react';
import axios from 'axios';

const SoftwareUpload = () => {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    console.log('Selected file:', selectedFile); // Debug file selection
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!name || !version || !file) {
      setError('Please provide software name, version, and file.');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('version', version);
    formData.append('file', file);

    // Debug FormData contents
    for (let [key, value] of formData.entries()) {
      console.log(`FormData: ${key}=${value}`);
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to upload software.');
        setLoading(false);
        return;
      }

      const response = await axios.post(`${API_URL}/software/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess(response.data.message);
      setName('');
      setVersion('');
      setFile(null);
      document.getElementById('file-input').value = ''; // Reset file input
    } catch (err) {
      console.error('Software upload error:', err);
      if (err.response?.data?.detail) {
        const details = Array.isArray(err.response.data.detail)
          ? err.response.data.detail.map((d) => d.msg).join(', ')
          : err.response.data.detail;
        setError(details);
      } else {
        setError('Failed to upload software');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 p-6">
      <div className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-8">
        <h2 className="text-3xl font-extrabold text-center text-pink-800 mb-8">Upload Software</h2>
        {error && <p className="text-red-500 mb-6 text-center">{error}</p>}
        {success && <p className="text-green-500 mb-6 text-center">{success}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2 text-lg font-semibold">Software Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
              placeholder="Enter software name"
              required
              disabled={loading}
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2 text-lg font-semibold">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full text-lg text-gray-700 border border-pink-200 rounded-xl p-3 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all disabled:opacity-50"
              placeholder="Enter version (e.g., 1.0.0)"
              required
              disabled={loading}
            />
          </div>
          <div className="mb-8">
            <label className="block text-gray-700 mb-2 text-lg font-semibold">Software File</label>
            <input
              type="file"
              id="file-input"
              onChange={handleFileChange}
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
                Uploading...
              </span>
            ) : (
              'Upload Software'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SoftwareUpload;