import { create } from 'zustand';

const savedUser = localStorage.getItem('whasender_user');
const savedOrg = localStorage.getItem('whasender_org');

const useAuthStore = create((set) => ({
  accessToken: localStorage.getItem('whasender_token') || null,
  isAuthenticated: !!localStorage.getItem('whasender_token'),
  user: savedUser ? JSON.parse(savedUser) : null,
  currentOrganization: savedOrg ? JSON.parse(savedOrg) : null,
  organizations: [],
  needsSetup: null,

  setAuth: ({ token, user, organization, organizations }) => {
    if (token) localStorage.setItem('whasender_token', token);
    if (user) localStorage.setItem('whasender_user', JSON.stringify(user));
    if (organization) localStorage.setItem('whasender_org', JSON.stringify(organization));

    set({
      accessToken: token || localStorage.getItem('whasender_token'),
      isAuthenticated: !!(token || localStorage.getItem('whasender_token')),
      user: user || null,
      currentOrganization: organization || null,
      organizations: organizations || (organization ? [organization] : []),
      needsSetup: false,
    });
  },

  setToken: (token) => {
    if (token) {
      localStorage.setItem('whasender_token', token);
    } else {
      localStorage.removeItem('whasender_token');
    }
    set({ accessToken: token, isAuthenticated: !!token });
  },

  setCurrentOrganization: (organization) => {
    if (organization) {
      localStorage.setItem('whasender_org', JSON.stringify(organization));
    }
    set({ currentOrganization: organization });
  },

  setNeedsSetup: (needs) => set({ needsSetup: needs }),

  clearToken: () => {
    localStorage.removeItem('whasender_token');
    localStorage.removeItem('whasender_user');
    localStorage.removeItem('whasender_org');
    set({
      accessToken: null,
      isAuthenticated: false,
      user: null,
      currentOrganization: null,
      organizations: [],
    });
  },
}));

export default useAuthStore;
