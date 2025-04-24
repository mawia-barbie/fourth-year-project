import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./Login";
import Register from "./register"; // Note: File names are case-sensitive; ensure consistency
import VerifyOtp from "./verifyotp"; // Note: File names are case-sensitive
import Dashboard from "./dashboard";
import AdminPage from "./admin"; // Note: File names are case-sensitive

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<AdminPage />} />
        
      </Routes>
    </Router>
  );
}

export default App;