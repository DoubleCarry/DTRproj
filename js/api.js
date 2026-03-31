const API_BASE_KEY = 'dtr_api_base';
const TOKEN_KEY = 'dtr_api_token';

function getApiBase() {
  return localStorage.getItem(API_BASE_KEY) || 'https://dtrproj.onrender.com/api';
}

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function setApiToken(token) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export function hasApiToken() {
  return !!localStorage.getItem(TOKEN_KEY);
}

export async function apiHealth() {
  return request('/health', { method: 'GET' });
}

export async function apiLogin(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function apiSignup(name, username, password) {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, username, password }),
  });
}

export async function apiMe() {
  return request('/auth/me', { method: 'GET' });
}

export async function apiUpdateSettings(payload) {
  return request('/users/me/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function apiAdminResetUserPassword(username, newPassword, confirmPassword) {
  return request('/users/admin/reset-password', {
    method: 'PUT',
    body: JSON.stringify({ username, newPassword, confirmPassword }),
  });
}

export async function apiListSessions() {
  return request('/sessions/me', { method: 'GET' });
}

export async function apiCreateSession(session) {
  return request('/sessions/me', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

export async function apiUpdateSession(id, patch) {
  return request(`/sessions/me/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteSession(id) {
  return request(`/sessions/me/${id}`, {
    method: 'DELETE',
  });
}

export async function apiClearSessions() {
  return request('/sessions/me', { method: 'DELETE' });
}


