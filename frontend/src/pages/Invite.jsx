import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, Loader2, Building2, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../services/api';

function Invite() {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();

  const code = params.code || searchParams.get('code');
  const { isAuthenticated, user, setAuth } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('Código de convite não informado');
      setLoading(false);
      return;
    }

    let isMounted = true;
    api.get(`/organizations/invites/${code}`)
      .then(({ data }) => {
        if (!isMounted) return;
        setInviteData(data);
        if (data.targetEmail) {
          setEmail(data.targetEmail);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.response?.data?.error || 'Convite inválido ou expirado');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [code]);

  const handleJoinLogged = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/organizations/invites/${code}/accept`, {});
      toast.success(`Você entrou na organização ${inviteData?.organizationName}!`);
      const { data: meData } = await api.get('/auth/me');
      setAuth({
        user: meData.user,
        organization: meData.organization,
        organizations: meData.organizations,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao aceitar convite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterAndJoin = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const finalEmail = inviteData?.targetEmail || email;
      const { data } = await api.post(`/organizations/invites/${code}/accept`, {
        name,
        username,
        email: finalEmail,
        password,
      });

      setAuth({
        token: data.accessToken,
        user: data.user,
        organization: data.organization,
        organizations: [data.organization],
      });

      toast.success(`Bem-vindo à equipe ${inviteData?.organizationName}!`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar conta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <div className="skeleton" style={{ width: '60px', height: '60px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ width: '200px', height: '24px' }} />
          <div className="skeleton" style={{ width: '260px', height: '14px' }} />
          <div className="skeleton" style={{ width: '100%', height: '44px', marginTop: '16px' }} />
          <div className="skeleton" style={{ width: '100%', height: '44px' }} />
        </div>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-logo-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', margin: '0 auto 16px' }}>
            <AlertCircle size={28} color="var(--error)" />
          </div>
          <h2>Convite Inválido</h2>
          <p className="login-subtitle" style={{ marginTop: '8px' }}>
            {error}
          </p>
          <Link to="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}>
            Ir para Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '460px', width: '92%' }}>
        <div className="login-logo">
          <div className="login-logo-icon" style={{ background: 'var(--accent-gradient)' }}>
            <UserPlus size={26} color="#fff" />
          </div>
          <h1>Convite de Equipe</h1>
        </div>

        <div style={{
          textAlign: 'center',
          padding: '16px',
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          border: '1px solid var(--border-default)',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Você foi convidado para participar de</p>
          <h2 style={{ fontSize: '20px', color: 'var(--text-primary)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Building2 size={20} color="var(--accent)" />
            {inviteData?.organizationName}
          </h2>
          <div style={{ marginTop: '8px' }}>
            <span className={`badge-${inviteData?.role === 'admin' ? 'admin' : 'member'}`}>
              Função: {inviteData?.role === 'admin' ? 'Administrador' : 'Membro'}
            </span>
          </div>
        </div>

        {inviteData?.targetEmail && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}>
            <Mail size={16} color="var(--info)" style={{ flexShrink: 0 }} />
            <span>
              Convite exclusivo para: <strong>{inviteData.targetEmail}</strong>
            </span>
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        {isAuthenticated ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Conectado como <strong>{user?.name || user?.username}</strong> ({user?.email})
            </p>
            {inviteData?.targetEmail && user?.email && inviteData.targetEmail.toLowerCase() !== user.email.toLowerCase() ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  ⚠️ Você está conectado como <strong>{user?.email}</strong>, mas este convite foi enviado exclusivamente para <strong>{inviteData.targetEmail}</strong>.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    useAuthStore.getState().clearToken();
                    navigate(`/login?redirect=/invite/${code}`);
                  }}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Sair e Entrar com o E-mail Convidado
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleJoinLogged}
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting ? (
                  <><Loader2 size={18} className="spin" /> Ingressando...</>
                ) : (
                  <><CheckCircle2 size={18} /> Aceitar e Ingressar</>
                )}
              </button>
            )}
          </div>
        ) : (
          <form className="login-form" onSubmit={handleRegisterAndJoin}>
            <div className="input-group">
              <label htmlFor="inv-name">Seu Nome Completo</label>
              <input
                id="inv-name"
                type="text"
                className="input"
                placeholder="Ex: Carlos Oliveira"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="input-group">
                <label htmlFor="inv-username">Usuário</label>
                <input
                  id="inv-username"
                  type="text"
                  className="input"
                  placeholder="Ex: carlos"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="inv-email">E-mail {inviteData?.targetEmail ? '(Bloqueado)' : ''}</label>
                <input
                  id="inv-email"
                  type="email"
                  className="input"
                  placeholder="carlos@empresa.com"
                  value={inviteData?.targetEmail || email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={Boolean(inviteData?.targetEmail) || submitting}
                  readOnly={Boolean(inviteData?.targetEmail)}
                  style={inviteData?.targetEmail ? { opacity: 0.8, cursor: 'not-allowed' } : {}}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="inv-password">Criar Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="inv-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  autoComplete="new-password"
                  required
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={submitting || !name || !username || !email || !password}
              style={{ marginTop: '8px' }}
            >
              {submitting ? (
                <><Loader2 size={18} className="spin" /> Criando conta...</>
              ) : (
                'Criar Conta e Ingressar'
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Já tem conta? <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Entrar</Link>
            </div>
          </form>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default Invite;
