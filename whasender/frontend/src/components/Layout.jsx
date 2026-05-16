/**
 * WhaSender — Layout com Sidebar
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Send, Users, Settings, LogOut, Zap, Folder } from 'lucide-react';
import useAuthStore from '../store/authStore';
import api from '../services/api';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/files', icon: Folder, label: 'Arquivos' },
  { to: '/dispatch', icon: Send, label: 'Disparo' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

function Layout() {
  const navigate = useNavigate();
  const clearToken = useAuthStore((s) => s.clearToken);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearToken();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Zap size={22} color="#fff" />
          </div>
          <div>
            <h1>WhaSender</h1>
            <span>Automação WhatsApp</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
