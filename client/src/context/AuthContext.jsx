// @refresh reset
import React, { createContext, useContext, useState, useCallback } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('lt_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('lt_token'));

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
