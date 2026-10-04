import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../ui';

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spinner fullscreen />;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" />;
  }

  return children;
}

export default AdminRoute;
