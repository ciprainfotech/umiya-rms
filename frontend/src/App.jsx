import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Import Pages
import Login from './pages/Login';
import WaiterDashboard from './pages/WaiterDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import OwnerDashboard from './pages/OwnerDashboard';

// --- HELPER: Normalize Role ---
// This ensures 'admin' in DB maps to 'owner' in URL
const getRole = () => {
  const role = localStorage.getItem('role');
  if (role === 'admin') return 'owner'; // DB says 'admin', URL needs 'owner'
  return role;
};

const getToken = () => localStorage.getItem('token');

/**
 * PROTECTED ROUTE COMPONENT
 */
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = getToken();
  const role = getRole();

  // 1. Not logged in -> Login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 2. Logged in but wrong role -> Go to THEIR dashboard
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={`/${role}`} replace />;
  }

  return children;
};

/**
 * PUBLIC ROUTE COMPONENT
 */
const PublicRoute = ({ children }) => {
  const token = getToken();
  const role = getRole();

  // If already logged in, force them to their dashboard
  if (token && role) {
    return <Navigate to={`/${role}`} replace />;
  }

  return children;
};

/**
 * HOME REDIRECT
 */
const HomeRedirect = () => {
  const token = getToken();
  const role = getRole();

  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={`/${role}`} replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* LOGIN */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />

        {/* WAITER */}
        <Route 
          path="/waiter" 
          element={
            <ProtectedRoute allowedRole="waiter">
              <WaiterDashboard />
            </ProtectedRoute>
          } 
        />

        {/* MANAGER */}
        <Route 
          path="/manager" 
          element={
            <ProtectedRoute allowedRole="manager">
              <ManagerDashboard />
            </ProtectedRoute>
          } 
        />

        {/* OWNER (Maps to 'admin' role in DB) */}
        <Route 
          path="/owner" 
          element={
            <ProtectedRoute allowedRole="owner">
              <OwnerDashboard />
            </ProtectedRoute>
          } 
        />

        {/* ROOT REDIRECT */}
        <Route path="/" element={<HomeRedirect />} />
        
        {/* CATCH ALL */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;