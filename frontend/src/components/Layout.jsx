import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  BarChart3, Send, Users, Settings, LogOut, Folder,
  Cpu, CheckCircle2, Contact, Building2, UserCircle, AlertTriangle, X,
  ChevronDown, Plus, Check, Loader2, Menu
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useSocket } from '../services/useSocket';
import api from '../services/api';

const navGroups = [
  {
    title: 'Campanhas',
    items: [
      { to: '/dashboard', icon: BarChart3, label: 'Métricas' },
      { to: '/dispatch', icon: Send, label: 'Disparos' },
      { to: '/contacts', icon: Contact, label: 'Contatos' },
    ]
  },
  {
    title: 'Ferramentas',
    items: [
      { to: '/files', icon: Folder, label: 'Arquivos & Lotes' },
      { to: '/generator', icon: Cpu, label: 'Gerador de Leads' },
      { to: '/validator', icon: CheckCircle2, label: 'Validador' },
    ]
  },
  {
    title: 'Administração',
    items: [
      { to: '/team', icon: Users, label: 'Equipe & Acessos' },
      { to: '/settings', icon: Settings, label: 'Configurações' },
      { to: '/profile', icon: UserCircle, label: 'Meu Perfil' },
    ]
  }
];

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, currentOrganization, organizations, setAuth, setCurrentOrganization, clearToken } = useAuthStore();
  const resetSocketStore = useSocketStore((s) => s.reset);
  const botStatus = useSocketStore((s) => s.botStatus);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [switchingOrgId, setSwitchingOrgId] = useState(null);
  const orgDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target)) {
        setShowOrgDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        toast.error('Bot desconectou — disparo pausado automaticamente');
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

  const handleSwitchOrg = async (orgId) => {
    if (orgId === currentOrganization?.id) {
      setShowOrgDropdown(false);
      return;
    }
    setSwitchingOrgId(orgId);
    try {
      const { data } = await api.post('/auth/switch-org', { organizationId: orgId });
      setCurrentOrganization(data.organization);
      setShowOrgDropdown(false);
      toast.success(`Organização ativa: ${data.organization.name}`);
      setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alternar organização');
    } finally {
      setSwitchingOrgId(null);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) {
      toast.error('Informe o nome da organização');
      return;
    }
    setCreatingOrg(true);
    try {
      const { data } = await api.post('/organizations', { name: newOrgName });
      toast.success(`Organização "${data.organization.name}" criada com sucesso!`);
      setShowCreateOrgModal(false);
      setNewOrgName('');
      setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar organização');
    } finally {
      setCreatingOrg(false);
    }
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await api.post('/auth/logout');
    } catch {}
    clearToken();
    resetSocketStore();
    setShowLogoutConfirm(false);
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Barra de Topo no Mobile */}
      <header className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
          <div className="sidebar-org-avatar" style={{ width: '28px', height: '28px', fontSize: '13px' }}>
            {(currentOrganization?.name || 'W').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentOrganization?.name || 'WhaSender'}
            </div>
            <div style={{ fontSize: '10px', color: botStatus === 'connected' ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className={`status-dot ${botStatus || 'disconnected'}`} style={{ width: '6px', height: '6px' }} />
              <span>{botStatus === 'connected' ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Backdrop no Mobile */}
      {isMobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '14px 12px 6px', position: 'relative' }} ref={orgDropdownRef}>
          <button
            type="button"
            className={`sidebar-org-btn ${showOrgDropdown ? 'active' : ''}`}
            onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
              <div className="sidebar-org-avatar">
                {(currentOrganization?.name || 'W').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentOrganization?.name || 'WhaSender'}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {currentOrganization?.role === 'owner' ? 'Proprietário' : currentOrganization?.role === 'admin' ? 'Administrador' : 'Membro'}
                </div>
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0, transform: showOrgDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {showOrgDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: '12px',
                right: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '6px',
                zIndex: 100,
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              <div style={{ padding: '4px 8px 6px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Organizações
              </div>

              {(organizations || []).map((org) => {
                const isActive = org.id === currentOrganization?.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => handleSwitchOrg(org.id)}
                    disabled={switchingOrgId === org.id}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      marginBottom: '2px',
                    }}
                  >
                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {org.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {org.role === 'owner' ? 'Proprietário' : org.role === 'admin' ? 'Admin' : 'Membro'}
                      </div>
                    </div>
                    {isActive ? (
                      <Check size={14} color="var(--accent)" />
                    ) : switchingOrgId === org.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : null}
                  </button>
                );
              })}

              <div style={{ borderTop: '1px solid var(--border-default)', marginTop: '4px', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowOrgDropdown(false);
                    setShowCreateOrgModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} />
                  <span>Nova Organização</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: '8px' }}>
              <div className="sidebar-group-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status-pill">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
              <div className={`status-dot ${botStatus || 'disconnected'}`} />
              <span style={{ fontSize: '11.5px', color: botStatus === 'connected' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {botStatus === 'connected' ? 'WhatsApp Online' : botStatus === 'connecting' ? 'Conectando...' : botStatus === 'qr' ? 'Aguardando QR' : 'WhatsApp Offline'}
              </span>
            </div>
            {botStatus === 'connected' ? (
              <Check size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
            ) : (
              <Link to="/dashboard" style={{ color: 'var(--accent)', fontSize: '11px', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>
                Conectar
              </Link>
            )}
          </div>

          {user && (
            <Link
              to="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 8px',
                textDecoration: 'none',
                borderRadius: 'var(--radius-sm)',
                transition: 'var(--transition-fast)',
                marginTop: '2px',
              }}
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '11px',
                color: '#ffffff',
                flexShrink: 0
              }}>
                {user.name ? user.name.charAt(0).toUpperCase() : (user.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name || user.username}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
              </div>
            </Link>
          )}

          <button
            type="button"
            className="sidebar-link"
            onClick={() => setShowLogoutConfirm(true)}
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}
          >
            <LogOut size={16} />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {showCreateOrgModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="var(--accent)" /> Nova Organização
              </h3>
              <button className="modal-close" onClick={() => setShowCreateOrgModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateOrg}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                Crie um novo ambiente isolado para equipes, campanhas ou clientes separados.
              </p>
              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label>Nome da Organização</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex: Agência Alfa ou Empresa B"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateOrgModal(false)}
                  disabled={creatingOrg}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingOrg || !newOrgName.trim()}
                >
                  {creatingOrg ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  <span>Criar Organização</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}>
                <AlertTriangle size={20} /> Encerrar Sessão
              </h3>
              <button className="modal-close" onClick={() => setShowLogoutConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Deseja realmente sair da sua conta no WhaSender? Você precisará fazer login novamente para acessar o painel.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loggingOut}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmLogout}
                disabled={loggingOut}
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
              >
                {loggingOut ? 'Saindo...' : 'Sim, Sair'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;
