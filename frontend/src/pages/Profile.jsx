import { useState, useEffect } from 'react';
import {
  User, Mail, Lock, Shield, KeyRound, Building2,
  CheckCircle2, AlertTriangle, Save, Loader2, Calendar, Crown
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function Profile() {
  const { user, currentOrganization, organizations, setUser, setAuth, setCurrentOrganization } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [createdAt, setCreatedAt] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [userOrgs, setUserOrgs] = useState([]);
  const [switchingOrgId, setSwitchingOrgId] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const [{ data: meData }, { data: orgsData }] = await Promise.all([
        api.get('/auth/me'),
        api.get('/organizations/my').catch(() => ({ data: { organizations: [] } })),
      ]);

      if (meData.user) {
        setName(meData.user.name || '');
        setEmail(meData.user.email || '');
        setUsername(meData.user.username || '');
        setCreatedAt(meData.user.created_at || '');
        setUser(meData.user);
      }

      setUserOrgs(orgsData.organizations || meData.organizations || []);
    } catch {
      toast.error('Erro ao carregar dados do perfil');
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Nome e e-mail são obrigatórios');
      return;
    }

    setSavingProfile(true);
    try {
      const { data } = await api.put('/auth/profile', { name, email });
      setUser(data.user);
      if (data.accessToken) {
        setAuth({
          token: data.accessToken,
          user: data.user,
          organization: currentOrganization,
          organizations: organizations,
        });
      }
      toast.success('Perfil atualizado com sucesso!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Informe a senha atual');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('A confirmação da nova senha não confere');
      return;
    }

    setSavingPassword(true);
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      toast.success('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSwitchOrg = async (orgId) => {
    if (orgId === currentOrganization?.id) return;
    setSwitchingOrgId(orgId);
    try {
      const { data } = await api.post('/auth/switch-org', { organizationId: orgId });
      setCurrentOrganization(data.organization);
      toast.success(`Organização ativa alterada para: ${data.organization.name}`);
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alternar organização');
      setSwitchingOrgId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="skeleton" style={{ width: '180px', height: '28px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: '280px', height: '16px' }} />
        </div>
        <div className="card-grid">
          <div className="card">
            <div className="skeleton" style={{ width: '100%', height: '240px' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ width: '100%', height: '240px' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Meu Perfil</h2>
        <p>Gerencie seus dados pessoais, credenciais de acesso e organizações</p>
      </div>

      <div className="card-grid" style={{ marginBottom: '24px' }}>
        {/* Dados Cadastrais */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Dados Pessoais</span>
            <div className="card-icon green">
              <User size={20} />
            </div>
          </div>

          <form onSubmit={handleUpdateProfile}>
            <div className="input-group">
              <label>Nome Completo</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>E-mail</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>Nome de Usuário</label>
              <input
                type="text"
                className="input input-mono"
                value={username}
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                O nome de usuário é único e permanente.
              </span>
            </div>

            {createdAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                <Calendar size={14} />
                <span>Conta criada em: {new Date(createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ width: '100%' }}>
              {savingProfile ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              <span>Salvar Alterações</span>
            </button>
          </form>
        </div>

        {/* Segurança e Senha */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Segurança & Senha</span>
            <div className="card-icon yellow">
              <KeyRound size={20} />
            </div>
          </div>

          <form onSubmit={handleUpdatePassword}>
            <div className="input-group">
              <label>Senha Atual</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                required
              />
            </div>

            <div className="input-group">
              <label>Nova Senha</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                required
              />
            </div>

            <div className="input-group">
              <label>Confirmar Nova Senha</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
              />
            </div>

            <button type="submit" className="btn btn-secondary" disabled={savingPassword} style={{ width: '100%', marginTop: '8px' }}>
              {savingPassword ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
              <span>Atualizar Senha</span>
            </button>
          </form>
        </div>
      </div>

      {/* Minhas Organizações */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Minhas Organizações</span>
          <div className="card-icon blue">
            <Building2 size={20} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {userOrgs.map((org) => {
            const isActive = org.id === currentOrganization?.id;
            return (
              <div
                key={org.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: isActive ? 'var(--bg-card-hover)' : 'var(--bg-input)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--accent-glow)' : 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{org.name}</span>
                      <span className={`badge-${org.role || 'member'}`}>
                        {org.role === 'owner' ? 'Proprietário' : org.role === 'admin' ? 'Administrador' : 'Membro'}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> Ativa
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      slug: {org.slug} • {org.membersCount || 1} membro(s)
                    </span>
                  </div>
                </div>

                {!isActive && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleSwitchOrg(org.id)}
                    disabled={switchingOrgId === org.id}
                    style={{ fontSize: '13px', padding: '6px 14px' }}
                  >
                    {switchingOrgId === org.id ? <Loader2 size={14} className="spin" /> : null}
                    <span>Alternar</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
