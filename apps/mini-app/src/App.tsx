import WebApp from '@twa-dev/sdk';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getToken } from './api/client';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

function ProtectedRoute() {
  return getToken() ? <DashboardPage /> : <Navigate to="/login" replace />;
}

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    if (WebApp?.ready) {
      WebApp.ready();
      WebApp.expand();
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedRoute />} />
    </Routes>
  );
}
