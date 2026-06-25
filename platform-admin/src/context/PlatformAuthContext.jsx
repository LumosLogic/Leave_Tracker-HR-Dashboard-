import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const PlatformAuthContext = createContext(null);

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function loadStoredPAAuth() {
  const token = localStorage.getItem('pa_token');
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('pa_token');
    localStorage.removeItem('pa_admin');
    return { token: null, admin: null };
  }
  try {
    return { token, admin: JSON.parse(localStorage.getItem('pa_admin')) };
  } catch { return { token, admin: null }; }
}

export function PlatformAuthProvider({ children }) {
  const initial = loadStoredPAAuth();
  const [admin, setAdmin] = useState(initial.admin);
  const [token, setToken] = useState(initial.token);

  const saveAuth = useCallback((newToken, newAdmin) => {
    setToken(newToken);
    setAdmin(newAdmin);
    localStorage.setItem('pa_token', newToken);
    localStorage.setItem('pa_admin', JSON.stringify(newAdmin));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('pa_token');
    localStorage.removeItem('pa_admin');
  }, []);

  // Auto-logout when any API call returns 401 (token expired mid-session)
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('pa-auth:expired', handler);
    return () => window.removeEventListener('pa-auth:expired', handler);
  }, [logout]);

  return (
    <PlatformAuthContext.Provider value={{ admin, token, saveAuth, logout }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth must be used inside PlatformAuthProvider');
  return ctx;
}
