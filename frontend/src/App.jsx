import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Import Pages
import Login from './pages/Login';
import WaiterDashboard from './pages/WaiterDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import OwnerDashboard from './pages/OwnerDashboard';

/**
 * PROTECTED ROUTE COMPONENT
 */
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  // 1. If not logged in, send to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 2. If logged in but trying to access the wrong role's page
  if (allowedRole && role !== allowedRole) {
    // Redirect to their own dashboard based on their role
    return <Navigate to={`/${role}`} replace />;
  }

  return children;
};

/**
 * PUBLIC ROUTE COMPONENT
 */
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (token && role) {
    return <Navigate to={`/${role}`} replace />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* LOGIN: Publicly accessible but redirects if already logged in */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />

        {/* WAITER: Tablet-optimized interface */}
        <Route 
          path="/waiter" 
          element={
            <ProtectedRoute allowedRole="waiter">
              <WaiterDashboard />
            </ProtectedRoute>
          } 
        />

        {/* MANAGER: PC-optimized interface with history and keyboard flow */}
        <Route 
          path="/manager" 
          element={
            <ProtectedRoute allowedRole="manager">
              <ManagerDashboard />
            </ProtectedRoute>
          } 
        />

        {/* OWNER: Master statistics and sales data */}
        <Route 
          path="/owner" 
          element={
            <ProtectedRoute allowedRole="owner">
              <OwnerDashboard />
            </ProtectedRoute>
          } 
        />

        {/* DEFAULT ROUTE: Logic to send user to correct dashboard if they visit '/' */}
        <Route path="/" element={<HomeRedirect />} />
        
        {/* CATCH-ALL: Redirect broken links to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

/**
 * Helper component to handle the root (/) path redirection
 */
const HomeRedirect = () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={`/${role}`} replace />;
};

export default App;