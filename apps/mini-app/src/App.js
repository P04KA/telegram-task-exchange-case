import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import WebApp from '@twa-dev/sdk';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getToken } from './api/client';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
function ProtectedRoute() {
    return getToken() ? _jsx(DashboardPage, {}) : _jsx(Navigate, { to: "/login", replace: true });
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
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/*", element: _jsx(ProtectedRoute, {}) })] }));
}
