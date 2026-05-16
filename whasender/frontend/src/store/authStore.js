/**
 * WhaSender — Auth Store (Zustand)
 * Token APENAS em memória — nunca em localStorage/sessionStorage
 */

import { create } from 'zustand';

const useAuthStore = create((set) => ({
  accessToken: null,
  isAuthenticated: false,
  setToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),
  clearToken: () => set({ accessToken: null, isAuthenticated: false }),
}));

export default useAuthStore;
