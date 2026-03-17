// lib/auth.js

/* ─────────────────────────────────────────
   Config
───────────────────────────────────────── */
// NEXT_PUBLIC_ prefix is required for any env var used client-side in Next.js
const API_BASE = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL;
if (!API_BASE) {
  throw new Error('NEXT_PUBLIC_AUTH_SERVICE_URL is not defined. Check your .env file.');
}

/* ─────────────────────────────────────────
   Storage keys
───────────────────────────────────────── */
const KEYS = {
  TOKEN: 'auth_token',
  USER:  'auth_user',
};

/* ─────────────────────────────────────────
   Internal helpers
───────────────────────────────────────── */
async function fetchAPI(path, { body, auth = false, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = getToken();
    if (!token) throw new Error('No auth token available');
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    const message = data?.error ?? data?.message ?? `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return data;
}

function persistSession(token, user) {
  if (!token || !user) {
    console.warn('[auth] persistSession called with incomplete data — session not saved');
    return;
  }
  try {
    localStorage.setItem(KEYS.TOKEN, token);
    localStorage.setItem(KEYS.USER, JSON.stringify(user));
  } catch (err) {
    console.error('[auth] Failed to persist session:', err);
  }
}

function decodeTokenPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────
   Public API
───────────────────────────────────────── */
export async function signIn(email, password) {
  if (!email || !password) throw new Error('Email and password are required');
  const data = await fetchAPI('/api/auth/login', { method: 'POST', body: { email, password } });
  persistSession(data.token, data.user);
  return data;
}

export async function signUp(name, email, password) {
  if (!name || !email || !password) throw new Error('All fields are required');
  return fetchAPI('/api/auth/register', { method: 'POST', body: { name, email, password } });
}

export async function signInWithGoogle(idToken) {
  if (!idToken) throw new Error('Google ID token is required');
  const data = await fetchAPI('/api/auth/google', { method: 'POST', body: { idToken } });
  persistSession(data.token, data.user);
  return data;
}

export function signOut() {
  try {
    localStorage.removeItem(KEYS.TOKEN);
    localStorage.removeItem(KEYS.USER);
  } catch (err) {
    console.error('[auth] Failed to clear session:', err);
  }
}

export function getToken() {
  try {
    return localStorage.getItem(KEYS.TOKEN);
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    console.warn('[auth] Corrupted user data in localStorage — clearing session');
    signOut();
    return null;
  }
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return true;
  const isExpired = Date.now() >= payload.exp * 1000;
  if (isExpired) {
    signOut();
    return false;
  }
  return true;
}

export async function getCurrentUser() {
  if (!isAuthenticated()) return null;
  try {
    const data = await fetchAPI('/api/auth/profile', { auth: true });
    return data.user ?? null;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      signOut();
      return null;
    }
    throw err;
  }
}