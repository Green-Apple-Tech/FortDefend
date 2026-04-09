import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://fortdefend-production.up.railway.app';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || '';
    const isAuthEndpoint = url.includes('/api/auth/') || url.includes('/api/orgs/me');
    if (error.response?.status === 401 && isAuthEndpoint) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('org');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
