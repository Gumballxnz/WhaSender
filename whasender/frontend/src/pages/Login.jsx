/**
 * WhaSender — Página de Login
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import useAuthStore from '../store/authStore';
import api from '../services/api';

function Login() {
  const navigate = useNavigate();
  const setToken = useAuthStore((s) => s.setToken);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (blocked) return;

    if (attempts >= 5) {
      setBlocked(true);
      setError('Muitas tentativas. Aguarde 1 minuto.');
      setTimeout(() => {
        setBlocked(false);
        setAttempts(0);
      }, 60000);
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { username, password });
      setToken(data.accessToken);
      navigate('/dashboard');
    } catch (err) {
      setAttempts((a) => a + 1);
      setError(err.response?.data?.error || 'Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Zap size={28} color="#fff" />
          </div>
          <h1>WhaSender</h1>
        </div>

        <p className="login-subtitle">
          Painel de automação de envio de arquivos via WhatsApp
        </p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="login-username">Usuário</label>
            <input
              id="login-username"
              type="text"
              className="input"
              placeholder="Digite seu usuário"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading || blocked}
              autoComplete="username"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="login-password">Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || blocked}
                autoComplete="current-password"
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
            disabled={loading || blocked || !username || !password}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                Entrando...
              </>
            ) : (
              'Entrar'
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

export default Login;
