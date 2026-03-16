import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import WebApp from '@twa-dev/sdk';
import { useState } from 'react';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';
export function LoginPage() {
    const [initData, setInitData] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const authTriggeredRef = useRef(false);
    async function authorize(currentInitData) {
        setLoading(true);
        setError(null);
        try {
            const session = await api('/auth/telegram/init', 'POST', {
                initData: currentInitData,
            });
            setToken(session.accessToken);
            navigate('/', { replace: true });
        }
        catch (authError) {
            setError(authError.message);
        }
        finally {
            setLoading(false);
        }
    }
    async function handleSubmit(event) {
        event.preventDefault();
        await authorize(initData);
    }
    useEffect(() => {
        if (authTriggeredRef.current) {
            return;
        }
        if (WebApp?.initData) {
            authTriggeredRef.current = true;
            setInitData(WebApp.initData);
            void authorize(WebApp.initData);
            return;
        }
        const searchParams = new URLSearchParams(window.location.search);
        const devInitData = searchParams.get('devInitData');
        if (devInitData) {
            setInitData(devInitData);
        }
    }, []);
    return (_jsxs("main", { className: "shell", children: [_jsxs("section", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "Telegram Mini App" }), _jsx("h1", { children: "\u0411\u0438\u0440\u0436\u0430 \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u0434\u043B\u044F \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0438 \u0437\u0430\u043A\u0430\u0437\u0447\u0438\u043A\u043E\u0432" }), _jsx("p", { className: "lede", children: "\u0415\u0441\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u043E \u0438\u0437 Telegram, \u0432\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u0412 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u043C\u043E\u0436\u043D\u043E \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u044C `initData`." })] }), _jsxs("form", { className: "panel auth-panel", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Telegram init data", _jsx("textarea", { value: initData, onChange: (event) => setInitData(event.target.value), rows: 4 })] }), _jsx("button", { type: "submit", className: "primary", disabled: loading, children: loading ? 'Входим...' : 'Открыть приложение' }), error ? _jsx("p", { className: "error", children: error }) : null] })] }));
}
