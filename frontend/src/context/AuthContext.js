import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('user');
    const savedOrg = localStorage.getItem('org');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      if (savedOrg) setOrg(JSON.parse(savedOrg));
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchUser() {
    try {
      const [userRes, orgRes] = await Promise.all([
        api.get('/api/orgs/me/profile'),
        api.get('/api/orgs/me'),
      ]);
      setUser(userRes.data.user);
      setOrg(orgRes.data);
      localStorage.setItem('user', JSON.stringify(userRes.data.user));
      localStorage.setItem('org', JSON.stringify(orgRes.data));
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('org');
      setUser(null);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.data.accessToken) {
      localStorage.setItem('accessToken', res.data.accessToken);
      await fetchUser();
    }
    return res.data;
  }

  async function logout() {
    try { await api.post('/api/auth/logout'); } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('org');
    setUser(null);
    setOrg(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
