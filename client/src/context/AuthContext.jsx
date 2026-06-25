// @refresh reset
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export const AuthContext = createContext(null);

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function loadStoredAuth() {
  const token = localStorage.getItem('lt_token');
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('lt_token');
    localStorage.removeItem('lt_user');
    return { token: null, user: null };
  }
  try {
    return { token, user: JSON.parse(localStorage.getItem('lt_user')) };
  } catch { return { token, user: null }; }
}

export function AuthProvider({ children }) {
  const initial = loadStoredAuth();
  const [user,  setUser]  = useState(initial.user);
  const [token, setToken] = useState(initial.token);

  const saveAuth = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('lt_token', newToken);
    localStorage.setItem('lt_user',  JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('lt_token');
    localStorage.removeItem('lt_user');
  }, []);

  // Auto-logout when any API call returns 401 (token expired mid-session)
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [logout]);

  const isRootAdmin = user?.role === 'root_admin';
  const isHR        = user?.role === 'admin';
  const isEmployee  = user?.role === 'employee';
  // isAdmin = true for both HR admin and root admin (both can manage HR operations)
  const isAdmin = isHR || isRootAdmin;

  // Organization context
  const organization = user ? {
    id:   user.organization_id   || 1,
    name: user.organization_name || 'LumosLogic',
    slug: user.organization_slug || 'lumoslogic',
    logo: user.organization_logo || '',
  } : null;

  return (
    <AuthContext.Provider value={{ user, token, saveAuth, logout, isAdmin, isHR, isRootAdmin, isEmployee, organization }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
