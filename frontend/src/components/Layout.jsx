import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Send, Users, Settings, LogOut, Zap, Folder,
  Cpu, CheckCircle2, Contact, Building2, UserCircle
} from 'lucide-react';
import { useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useSocket } from '../services/useSocket';
import api from '../services/api';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/validator', icon: CheckCircle2, label: 'Validador' },
  { to: '/files', icon: Folder, label: 'Arquivos' },
  { to: '/generator', icon: Cpu, label: 'Gerador' },
  { to: '/dispatch', icon: Send, label: 'Disparo' },
  { to: '/contacts', icon: Contact, label: 'Contatos' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

function Layout() {
  const navigate = useNavigate();
  const { user, currentOrganization, setAuth, clearToken } = useAuthStore();
  const resetSocketStore = useSocketStore((s) => s.reset);

  const setBotStatus = useSocketStore((s) => s.setBotStatus);
  const setQrCode = useSocketStore((s) => s.setQrCode);
  const setPairingCode = useSocketStore((s) => s.setPairingCode);
  const setProgress = useSocketStore((s) => s.setProgress);
  const setValidationProgress = useSocketStore((s) => s.setValidationProgress);

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => {
        setAuth({
          user: data.user,
          organization: data.organization,
          organizations: data.organizations,
        });
      })
      .catch(() => {});
  }, [setAuth]);

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
      case 'VALIDATION_STARTED':
        setValidationProgress({ ...msg.data, status: 'RUNNING', checked: 0, validCount: 0, invalidCount: 0 });
        toast.success('Validação iniciada em segundo plano');
        break;
      case 'VALIDATION_PROGRESS':
        setValidationProgress(msg.data);
        if (msg.data.status === 'COMPLETED') {
          toast.success('Validação concluída com sucesso!');
        }
        break;
      case 'VALIDATION_STOPPED':
        setValidationProgress((prev) => (prev ? { ...prev, status: 'STOPPED' } : null));
        toast('Validação interrompida');
        break;
    }
  }, [setBotStatus, setQrCode, setPairingCode, setProgress, setValidationProgress]);

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

        {currentOrganization && (
          <div style={{
            margin: '12px 14px',
            padding: '10px 12px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <Building2 size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentOrganization.name}
              </span>
            </div>
            <span className={`badge-${currentOrganization.role}`} style={{ flexShrink: 0 }}>
              {currentOrganization.role === 'owner' ? 'Owner' : currentOrganization.role === 'admin' ? 'Admin' : 'Membro'}
            </span>
          </div>
        )}

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

        <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-default)', padding: '12px 14px' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', padding: '0 4px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px',
                color: 'var(--text-primary)'
              }}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name || user.username}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
              </div>
            </div>
          )}

          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 10px' }}
          >
            <LogOut size={18} />
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
