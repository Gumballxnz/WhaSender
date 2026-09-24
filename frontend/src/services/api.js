import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalReq = err.config;

    if ((err.response?.status === 401 || err.response?.status === 403) && !originalReq._retry) {
      originalReq._retry = true;

      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setToken(data.accessToken);
        originalReq.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalReq);
      } catch (refreshErr) {

        useAuthStore.getState().clearToken();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(err);
  }
);

export default api;
