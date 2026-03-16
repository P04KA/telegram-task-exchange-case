const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'task-exchange-token';
export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
    if (!token) {
        localStorage.removeItem(TOKEN_KEY);
        return;
    }
    localStorage.setItem(TOKEN_KEY, token);
}
export async function api(path, method = 'GET', body) {
    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? 'Request failed');
    }
    return response.json();
}
