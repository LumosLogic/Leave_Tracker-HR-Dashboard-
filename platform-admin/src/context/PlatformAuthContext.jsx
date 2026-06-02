import React, { createContext, useContext, useState, useCallback } from 'react';

const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pa_admin')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('pa_token'));

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
