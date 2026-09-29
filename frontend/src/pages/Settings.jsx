import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Clock, Zap, Shield, Save, Loader2,
  RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, QrCode, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

function formatDelay(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function Settings() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState({
    delay_ms: '30000',
    schedule_time: '15:00',
    schedule_enabled: 'false',
    max_per_dispatch: '0',
    batch_size: '0',
    batch_pause_minutes: '10',
    max_pauses: '0',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingBot, setRefreshingBot] = useState(false);
  const [totalContacts, setTotalContacts] = useState(0);
  const [botStatus, setBotStatus] = useState('disconnected');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [sRes, cRes, bRes] = await Promise.all([
        api.get('/settings'),
        api.get('/contacts').catch(() => ({ data: [] })),
        api.get('/bot/status').catch(() => ({ data: { status: 'disconnected' } })),
      ]);
      setSettings((prev) => ({ ...prev, ...sRes.data }));
      setTotalContacts(Array.isArray(cRes.data) ? cRes.data.filter((c) => c.active).length : 0);
      setBotStatus(bRes.data?.status || 'disconnected');
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast.success('Configurações salvas com sucesso!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const checkBotStatus = async () => {
    setRefreshingBot(true);
    try {
      const { data } = await api.get('/bot/status');
      setBotStatus(data.status || 'disconnected');
      toast.success('Status do bot atualizado');
    } catch {
      toast.error('Erro ao consultar status');
    } finally {
      setRefreshingBot(false);
    }
  };

  const delaySeconds = Math.round(parseInt(settings.delay_ms || 30000, 10) / 1000);
  const scheduleEnabled = settings.schedule_enabled === 'true';

  if (loading) {
    return (
      <div className="page-container" style={{ padding: '28px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <div className="skeleton" style={{ width: '260px', height: '32px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ width: '380px', height: '16px' }} />
          </div>
          <div className="skeleton" style={{ width: '180px', height: '44px' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card" style={{ padding: '24px' }}>
              <div className="skeleton" style={{ width: '180px', height: '22px', marginBottom: '20px' }} />
              <div className="skeleton" style={{ width: '100%', height: '40px', marginBottom: '14px' }} />
              <div className="skeleton" style={{ width: '100%', height: '40px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: '28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid var(--border-default)',
        paddingBottom: '20px',
      }}>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <SettingsIcon size={26} color="var(--accent)" />
            Configurações do Sistema
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Gerencie os parâmetros de envio, pausas anti-ban, agendamento diário e status de conexão
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '14px' }}
        >
          {saving ? (
            <><Loader2 size={16} className="spin" /> Salvando...</>
          ) : (
            <><Save size={16} /> Salvar Configurações</>
          )}
        </button>
      </div>

      {/* Grid de Cards Organizado */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
        gap: '24px',
        alignItems: 'stretch',
      }}>
        {/* Card 1: Parâmetros de Disparo */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="card-title">Parâmetros de Envio</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Intervalo entre mensagens e lote máximo
                </span>
              </div>
              <div className="card-icon green">
                <Zap size={20} />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ margin: 0 }}>Delay entre cada mensagem</label>
                <span style={{
                  padding: '2px 10px',
                  background: 'rgba(37, 211, 102, 0.15)',
                  border: '1px solid rgba(37, 211, 102, 0.3)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {formatDelay(parseInt(settings.delay_ms || 30000, 10))} ({delaySeconds}s)
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={300}
                step={5}
                value={delaySeconds}
                onChange={(e) => setSettings({ ...settings, delay_ms: String(Number(e.target.value) * 1000) })}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>5s (Rápido)</span>
                <span>30s (Recomendado)</span>
                <span>5m (Muito Seguro)</span>
              </div>
            </div>

            <div className="input-group">
              <label>Contatos ativos na fila</label>
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {totalContacts.toLocaleString('pt-BR')} contatos habilitados
                </span>
                <span style={{ fontSize: '12px', color: 'var(--accent)', background: 'rgba(37, 211, 102, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                  Automático
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                A quantidade do próximo disparo sincroniza automaticamente com as planilhas ativas.
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Agendamento Diário */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="card-title">Agendamento Automático</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Disparo diário recorrente agendado
                </span>
              </div>
              <div className="card-icon yellow">
                <Clock size={20} />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              marginBottom: '16px'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  Ativação do Cron Diário
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {scheduleEnabled ? 'O sistema disparará todos os dias no horário configurado' : 'Disparos automáticos estão pausados'}
                </div>
              </div>
              <div
                className={`toggle ${scheduleEnabled ? 'active' : ''}`}
                onClick={() => setSettings({ ...settings, schedule_enabled: scheduleEnabled ? 'false' : 'true' })}
                style={{ cursor: 'pointer' }}
              />
            </div>

            {scheduleEnabled && (
              <div className="input-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                <label>Horário Diário de Envio</label>
                <input
                  type="time"
                  className="input input-mono"
                  value={settings.schedule_time || '15:00'}
                  onChange={(e) => setSettings({ ...settings, schedule_time: e.target.value })}
                  style={{ fontSize: '15px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                  O envio diário começará pontualmente às <strong>{settings.schedule_time || '15:00'}</strong>.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Status do Bot WhatsApp */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="card-title">Motor WhatsApp (Baileys)</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Status da sessão e conexão ativa
                </span>
              </div>
              <div className={`card-icon ${botStatus === 'connected' ? 'green' : 'red'}`}>
                <QrCode size={20} />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`status-dot ${botStatus}`} style={{ width: '10px', height: '10px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {botStatus === 'connected' ? 'WhatsApp Conectado' : botStatus === 'disconnected' ? 'Desconectado' : botStatus}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {botStatus === 'connected' ? 'Pronto para disparar e validar contatos' : 'Requer pareamento no Dashboard'}
                  </div>
                </div>
              </div>
              <span className={`badge ${botStatus === 'connected' ? 'badge-success' : 'badge-error'}`}>
                {botStatus === 'connected' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={checkBotStatus}
              disabled={refreshingBot}
              style={{ flex: 1, justifyContent: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={refreshingBot ? 'spin' : ''} />
              {refreshingBot ? 'Verificando...' : 'Atualizar Status'}
            </button>
            {botStatus !== 'connected' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/dashboard')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Conectar WhatsApp
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Segurança & Autenticação */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="card-title">Segurança & Multi-Tenant</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Arquitetura de chaves e dados
                </span>
              </div>
              <div className="card-icon green">
                <ShieldCheck size={20} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                padding: '12px 14px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Chaves Criptográficas JWT</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Automático no SQLite</span>
              </div>

              <div style={{
                padding: '12px 14px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Sessão Web Segura</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>HttpOnly Cookie</span>
              </div>

              <div style={{
                padding: '12px 14px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Controle de Acesso</span>
                <span style={{ fontSize: '11px', color: 'var(--info)', fontWeight: 600 }}>Owner / Admin / Member</span>
              </div>
            </div>
          </div>

          <div style={{
            padding: '10px 14px',
            background: 'rgba(37, 211, 102, 0.08)',
            border: '1px solid rgba(37, 211, 102, 0.2)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}>
            <Sparkles size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
            Zero credenciais hardcoded. O banco e a sessão estão isolados e persistidos no volume.
          </div>
        </div>
      </div>

      {/* Barra de Ação no Rodapé */}
      <div style={{
        marginTop: '32px',
        padding: '16px 20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          As alterações entram em vigor imediatamente após salvar.
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '14px' }}
        >
          {saving ? (
            <><Loader2 size={16} className="spin" /> Salvando...</>
          ) : (
            <><Save size={16} /> Salvar Configurações</>
          )}
        </button>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default Settings;
