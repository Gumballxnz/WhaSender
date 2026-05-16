/**
 * WhaSender — Instância Axios com interceptor de renovação JWT
 */

import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor de request: adicionar token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor de response: renovar token se 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalReq = err.config;

    // Se recebeu 401 e não é retry, tentar renovar o token
    if (err.response?.status === 401 && !originalReq._retry) {
      originalReq._retry = true;

      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setToken(data.accessToken);
        originalReq.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalReq);
      } catch (refreshErr) {
        // Refresh falhou — fazer logout
        useAuthStore.getState().clearToken();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(err);
  }
);

export default api;
