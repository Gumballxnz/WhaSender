import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Send, Users, Settings, LogOut, Zap, Folder, Cpu } from 'lucide-react';
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useSocket } from '../services/useSocket';
import api from '../services/api';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/files', icon: Folder, label: 'Arquivos' },
  { to: '/generator', icon: Cpu, label: 'Gerador' },
  { to: '/dispatch', icon: Send, label: 'Disparo' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

function Layout() {
  const navigate = useNavigate();
  const clearToken = useAuthStore((s) => s.clearToken);
  const resetSocketStore = useSocketStore((s) => s.reset);

  const setBotStatus = useSocketStore((s) => s.setBotStatus);
  const setQrCode = useSocketStore((s) => s.setQrCode);
  const setPairingCode = useSocketStore((s) => s.setPairingCode);
  const setProgress = useSocketStore((s) => s.setProgress);

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'BOT_STATUS':
        setBotStatus(msg.status);
        if (msg.status === 'connected') {
          setQrCode(null);
          setPairingCode(null);
        }
        break;
      case 'QR':
        setQrCode(msg.payload);
        setBotStatus('qr');
        break;
      case 'PAIRING_CODE':
        setPairingCode(msg.payload);
        setBotStatus('pairing');
        break;
      case 'PAIRING_CODE_ERROR':
        toast.error(`Erro ao parear: ${msg.message}`);
        setPairingCode(null);
        break;
      case 'PAIRING_CODE_EXPIRED':
        toast.error('O código de pareamento expirou. Gere um novo código.');
        setPairingCode(null);
        setBotStatus('disconnected');
        break;
      case 'PROGRESS':
        setProgress(msg.data);
        break;
      case 'DISPATCH_STARTED':
        setProgress({ sent: 0, total: msg.data.total, status: 'SENDING', delayMs: msg.data.delayMs });
        break;
      case 'DISPATCH_RESUMED':
        setProgress({ sent: msg.data.sentCount, total: msg.data.total, status: 'SENDING', delayMs: msg.data.delayMs });
        break;
      case 'DISPATCH_AUTO_STOPPED':
        toast.error('⚠️ Bot desconectou — disparo pausado automaticamente');
        break;
    }
  }, [setBotStatus, setQrCode, setPairingCode, setProgress]);

  useSocket(handleWsMessage);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearToken();
    resetSocketStore();
    navigate('/login');
  };

  return (
    <div className="app-layout">
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
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
