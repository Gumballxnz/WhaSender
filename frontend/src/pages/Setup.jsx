import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, Loader2, Sparkles, Building2 } from 'lucide-react';
import useAuthStore from '../store/authStore';
import api from '../services/api';

function Setup() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.get('/auth/setup-status')
      .then(({ data }) => {
        if (!isMounted) return;
        if (!data.needsSetup) {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setChecking(false);
      });

    return () => { isMounted = false; };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('A senha deve possuir pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/auth/setup', {
        name,
        username,
        email,
        password,
        organizationName: orgName,
      });

      setAuth({
        token: data.accessToken,
        user: data.user,
        organization: data.organization,
        organizations: [data.organization],
      });

      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao inicializar o sistema');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <div className="skeleton" style={{ width: '60px', height: '60px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ width: '220px', height: '24px' }} />
          <div className="skeleton" style={{ width: '280px', height: '14px' }} />
          <div className="skeleton" style={{ width: '100%', height: '44px', marginTop: '16px' }} />
          <div className="skeleton" style={{ width: '100%', height: '44px' }} />
          <div className="skeleton" style={{ width: '100%', height: '44px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '480px', width: '92%' }}>
        <div className="login-logo">
          <div className="login-logo-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Sparkles size={26} color="#fff" />
          </div>
          <h1>WhaSender Setup</h1>
        </div>

        <p className="login-subtitle">
          Configure a conta do Proprietário e crie a primeira organização
        </p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="setup-name">Seu Nome Completo</label>
            <input
              id="setup-name"
              type="text"
              className="input"
              placeholder="Ex: Alexander Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group">
              <label htmlFor="setup-username">Nome de Usuário</label>
              <input
                id="setup-username"
                type="text"
                className="input"
                placeholder="Ex: alexander"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="setup-email">E-mail</label>
              <input
                id="setup-email"
                type="email"
                className="input"
                placeholder="Ex: alex@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="setup-org">Nome da Organização / Time</label>
            <div style={{ position: 'relative' }}>
              <input
                id="setup-org"
                type="text"
                className="input"
                placeholder="Ex: BridgePay Digital"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={loading}
                required
                style={{ paddingLeft: '38px' }}
              />
              <Building2
                size={18}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="setup-password">Senha de Acesso</label>
            <div style={{ position: 'relative' }}>
              <input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
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
            disabled={loading || !name || !username || !email || !password || !orgName}
            style={{ marginTop: '12px' }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                Inicializando Sistema...
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                Concluir Instalação
              </>
            )}
          </button>
        </form>

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

export default Setup;
