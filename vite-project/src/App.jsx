import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Component } from 'react';
import Login from './Login';
import Register from './Register';
import SoftwareUpload from './SoftwareUpload';
import VerifyOtp from './VerifyOtp';
import AdminDashboard from './AdminDashboard';
import Dashboard from './UserDashboard';

// Error Boundary
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something Went Wrong</h2>
            <p className="text-gray-700">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/upload" element={<SoftwareUpload />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/" element={<Login />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

export default App;