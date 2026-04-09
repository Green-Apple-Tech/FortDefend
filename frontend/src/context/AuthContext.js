import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) { fetchUser(); } else { setLoading(false); }
  }, []);

  async function fetchUser() {
    try {
      const res = await api.get('/api/orgs/me/profile');
      setUser(res.data.user);
      const orgRes = await api.get('/api/orgs/me');
      setOrg(orgRes.data);
    } catch {
      localStorage.removeItem('accessToken');
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
    await api.post('/api/auth/logout');
    localStorage.removeItem('accessToken');
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
