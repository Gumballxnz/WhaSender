import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Clock, Zap, Save, Loader2,
  RefreshCw, CheckCircle2, QrCode, Mail, Send, Shield
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

export default function Settings() {
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

  const [emailConfig, setEmailConfig] = useState({
    email_provider: 'disabled',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    has_smtp_pass: false,
    resend_api_key: '',
    has_resend_key: false,
    resend_api_key_masked: '',
    mail_from_name: 'WhaSender',
    mail_from_address: 'noreply@whasender.site',
  });

  const [loading, setLoading] = useState(true);
  const [initialSettings, setInitialSettings] = useState(null);
  const [initialEmailConfig, setInitialEmailConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [refreshingBot, setRefreshingBot] = useState(false);
  const [totalContacts, setTotalContacts] = useState(0);
  const [botStatus, setBotStatus] = useState('disconnected');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [sRes, emailRes, cRes, bRes] = await Promise.all([
        api.get('/settings').catch(() => ({ data: {} })),
        api.get('/settings/email').catch(() => ({ data: {} })),
        api.get('/contacts').catch(() => ({ data: [] })),
        api.get('/bot/status').catch(() => ({ data: { status: 'disconnected' } })),
      ]);

      const loadedSettings = { ...settings, ...sRes.data };
      setSettings(loadedSettings);
      setInitialSettings(loadedSettings);

      const loadedEmail = { ...emailConfig, ...emailRes.data };
      setEmailConfig(loadedEmail);
      setInitialEmailConfig(loadedEmail);

      setTotalContacts(Array.isArray(cRes.data) ? cRes.data.filter((c) => c.active).length : 0);
      setBotStatus(bRes.data?.status || 'disconnected');
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        api.put('/settings', settings),
        api.put('/settings/email', emailConfig),
      ]);
      setInitialSettings(settings);
      setInitialEmailConfig(emailConfig);
      toast.success('Configurações salvas com sucesso');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmailAddress.trim()) {
      toast.error('Informe um e-mail de destino');
      return;
    }
    setTestingEmail(true);
    try {
      await api.post('/settings/email/test', { email: testEmailAddress.trim() });
      toast.success(`E-mail de teste enviado com sucesso para ${testEmailAddress}`);
      setShowTestModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Falha ao enviar e-mail de teste');
    } finally {
      setTestingEmail(false);
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

  const isSettingsDirty = initialSettings !== null && Object.keys(settings).some(
    (key) => String(settings[key] ?? '') !== String(initialSettings[key] ?? '')
  );

  const isEmailDirty = initialEmailConfig !== null && Object.keys(emailConfig).some(
    (key) => String(emailConfig[key] ?? '') !== String(initialEmailConfig[key] ?? '')
  );

  const isDirty = isSettingsDirty || isEmailDirty;

  if (loading) {
    return (
      <div className="main-container">
        <div className="resend-header">
          <div>
            <div className="skeleton" style={{ width: '220px', height: '28px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ width: '340px', height: '16px' }} />
          </div>
          <div className="skeleton" style={{ width: '160px', height: '36px' }} />
        </div>
        <div className="resend-grid-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="resend-card" style={{ minHeight: '200px' }}>
              <div className="skeleton" style={{ width: '160px', height: '20px', marginBottom: '18px' }} />
              <div className="skeleton" style={{ width: '100%', height: '38px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ width: '100%', height: '38px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="main-container">
      {/* Resend Header */}
      <div className="resend-header">
        <div>
          <h1 className="resend-title">Configurações</h1>
          <p className="resend-subtitle">
            Gerenciamento de disparos, agendamento diário e envio transacional de e-mails
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSaveAll}
          disabled={saving || !isDirty}
          style={{ padding: '8px 18px', fontWeight: 600 }}
        >
          {saving ? (
            <><Loader2 size={14} className="spin" /> Salvando...</>
          ) : (
            <><Save size={14} /> Salvar Alterações</>
          )}
        </button>
      </div>

      <div className="resend-grid-2">
        {/* Card 1: Parâmetros de Disparo */}
        <div className="resend-card">
          <div className="resend-card-header">
            <span className="resend-card-title">Parâmetros de Envio</span>
            <Zap size={16} color="var(--accent)" />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>Intervalo entre Mensagens</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--accent)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(37, 211, 102, 0.12)'
              }}>
                {formatDelay(parseInt(settings.delay_ms || 30000, 10))}
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
              <span>30s (Padrão Recomendado)</span>
              <span>5m (Anti-bloqueio)</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Contatos Prontos na Fila</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sincronização com planilhas ativas</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                {totalContacts.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Agendamento Diário */}
        <div className="resend-card">
          <div className="resend-card-header">
            <span className="resend-card-title">Agendamento Diário (Cron)</span>
            <Clock size={16} color="var(--warning)" />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Envio Recorrente Automático
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {scheduleEnabled ? 'Disparos ativos diariamente' : 'Disparos automáticos pausados'}
              </div>
            </div>
            <div
              className={`toggle ${scheduleEnabled ? 'active' : ''}`}
              onClick={() => setSettings({ ...settings, schedule_enabled: scheduleEnabled ? 'false' : 'true' })}
              style={{ cursor: 'pointer' }}
            />
          </div>

          {scheduleEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Horário Diário de Disparo
              </label>
              <input
                type="time"
                className="input"
                value={settings.schedule_time || '15:00'}
                onChange={(e) => setSettings({ ...settings, schedule_time: e.target.value })}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '14px' }}
              />
            </div>
          )}
        </div>

        {/* Card 3: Provedor de E-mail (Coolify Architecture) */}
        <div className="resend-card" style={{ gridColumn: 'span 2' }}>
          <div className="resend-card-header">
            <div>
              <span className="resend-card-title">Provedor de E-mail & Convites</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                Configuração para disparo transacional de convites da equipe e alertas (Resend ou SMTP)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {emailConfig.email_provider !== 'disabled' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowTestModal(true)}
                >
                  <Send size={13} /> Testar E-mail
                </button>
              )}
              <Mail size={16} color="var(--accent)" />
            </div>
          </div>

          {/* Seletor de Modo */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn btn-sm ${emailConfig.email_provider === 'disabled' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmailConfig({ ...emailConfig, email_provider: 'disabled' })}
            >
              Desativado
            </button>
            <button
              type="button"
              className={`btn btn-sm ${emailConfig.email_provider === 'resend' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmailConfig({ ...emailConfig, email_provider: 'resend' })}
            >
              Resend API
            </button>
            <button
              type="button"
              className={`btn btn-sm ${emailConfig.email_provider === 'smtp' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmailConfig({ ...emailConfig, email_provider: 'smtp' })}
            >
              SMTP Próprio
            </button>
          </div>

          {emailConfig.email_provider === 'resend' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div className="input-group">
                <label>Resend API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder={emailConfig.resend_api_key_masked || 're_123456789...'}
                  value={emailConfig.resend_api_key || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, resend_api_key: e.target.value })}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {emailConfig.has_resend_key ? 'Chave configurada. Deixe em branco para manter.' : 'Obtenha em resend.com/api-keys'}
                </span>
              </div>

              <div className="input-group">
                <label>Nome do Remetente</label>
                <input
                  type="text"
                  className="input"
                  placeholder="WhaSender"
                  value={emailConfig.mail_from_name || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, mail_from_name: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>E-mail do Remetente</label>
                <input
                  type="email"
                  className="input"
                  placeholder="onboarding@resend.dev ou equipe@seudominio.com"
                  value={emailConfig.mail_from_address || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, mail_from_address: e.target.value })}
                />
              </div>
            </div>
          )}

          {emailConfig.email_provider === 'smtp' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="input-group">
                <label>Host SMTP</label>
                <input
                  type="text"
                  className="input"
                  placeholder="smtp.exemplo.com"
                  value={emailConfig.smtp_host || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Porta</label>
                <input
                  type="text"
                  className="input"
                  placeholder="587"
                  value={emailConfig.smtp_port || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, smtp_port: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Usuário / Login</label>
                <input
                  type="text"
                  className="input"
                  placeholder="usuario@exemplo.com"
                  value={emailConfig.smtp_user || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Senha</label>
                <input
                  type="password"
                  className="input"
                  placeholder={emailConfig.has_smtp_pass ? '••••••••' : 'Sua senha SMTP'}
                  value={emailConfig.smtp_pass || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, smtp_pass: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Nome do Remetente</label>
                <input
                  type="text"
                  className="input"
                  placeholder="WhaSender"
                  value={emailConfig.mail_from_name || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, mail_from_name: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>E-mail do Remetente</label>
                <input
                  type="email"
                  className="input"
                  placeholder="noreply@seudominio.com"
                  value={emailConfig.mail_from_address || ''}
                  onChange={(e) => setEmailConfig({ ...emailConfig, mail_from_address: e.target.value })}
                />
              </div>
            </div>
          )}

          {emailConfig.email_provider === 'disabled' && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              O envio de convites por e-mail está desativado. Os convites da equipe ainda podem ser compartilhados manualmente via link direto.
            </p>
          )}
        </div>

        {/* Card 4: Conexão do Motor WhatsApp */}
        <div className="resend-card" style={{ gridColumn: 'span 2' }}>
          <div className="resend-card-header">
            <div>
              <span className="resend-card-title">Motor WhatsApp (Baileys)</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                Status da conexão e sincronização com os servidores do WhatsApp
              </span>
            </div>
            <div className={`status-dot ${botStatus || 'disconnected'}`} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`badge ${botStatus === 'connected' ? 'badge-success' : 'badge-error'}`}>
                {botStatus === 'connected' ? 'Online' : 'Offline'}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {botStatus === 'connected' ? 'Dispositivo conectado e autenticado' : 'Nenhum aparelho conectado'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={checkBotStatus}
                disabled={refreshingBot}
              >
                <RefreshCw size={13} className={refreshingBot ? 'spin' : ''} />
                <span>Atualizar Status</span>
              </button>
              {botStatus !== 'connected' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/dashboard')}
                >
                  Conectar Aparelho
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Teste de E-mail */}
      {showTestModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="var(--accent)" /> Enviar E-mail de Teste
              </h3>
            </div>
            <form onSubmit={handleSendTestEmail}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                Digite um endereço de e-mail para verificar se a entrega através do provedor selecionado está operando.
              </p>
              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label>E-mail de Destino</label>
                <input
                  type="email"
                  className="input"
                  placeholder="seuemail@exemplo.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowTestModal(false)}
                  disabled={testingEmail}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={testingEmail || !testEmailAddress.trim()}
                >
                  {testingEmail ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                  <span>Disparar Teste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
