import { create } from 'zustand';

const useAuthStore = create((set) => ({
  accessToken: localStorage.getItem('whasender_token') || null,
  isAuthenticated: !!localStorage.getItem('whasender_token'),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('whasender_token', token);
    } else {
      localStorage.removeItem('whasender_token');
    }
    set({ accessToken: token, isAuthenticated: !!token });
  },
  clearToken: () => {
    localStorage.removeItem('whasender_token');
    set({ accessToken: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
