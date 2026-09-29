import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Wifi, WifiOff, Activity, Users, Clock, AlertTriangle,
  Send, FileSpreadsheet, CheckCircle2, XCircle, Phone, QrCode,
  Pause, Square, Play, Timer, LayoutDashboard, Folder, Cpu, ArrowRight,
  ShieldCheck, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import useSocketStore from '../store/socketStore';
import api from '../services/api';

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function Dashboard() {
  const navigate = useNavigate();

  const botStatus = useSocketStore((s) => s.botStatus);
  const setBotStatus = useSocketStore((s) => s.setBotStatus);
  const qrCode = useSocketStore((s) => s.qrCode);
  const setQrCode = useSocketStore((s) => s.setQrCode);
  const progress = useSocketStore((s) => s.progress);
  const setProgress = useSocketStore((s) => s.setProgress);
  const pairingCode = useSocketStore((s) => s.pairingCode);
  const setPairingCode = useSocketStore((s) => s.setPairingCode);

  const [stats, setStats] = useState({ totalContacts: 0, lastSession: null });
  const [settings, setSettings] = useState({});
  const [phoneInput, setPhoneInput] = useState('');
  const [authMode, setAuthMode] = useState('phone');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [stoppedSession, setStoppedSession] = useState(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const prevStatusRef = useRef(progress?.status);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const isActive = progress && ['SENDING'].includes(progress.status);

    if (isActive && !timerRef.current) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }

    if (!isActive && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (prevStatusRef.current === 'SENDING' && !isActive) {
      loadData();
    }
    prevStatusRef.current = progress?.status;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [progress?.status]);

  async function loadData() {
    try {
      const [contactsRes, sessionRes, settingsRes, botRes] = await Promise.all([
        api.get('/contacts'),
        api.get('/dispatch/last-session'),
        api.get('/settings'),
        api.get('/bot/status'),
      ]);

      const activeContacts = contactsRes.data.filter((c) => c.active).length;
      setStats({
        totalContacts: activeContacts,
        lastSession: sessionRes.data.session,
      });
      setSettings(settingsRes.data);
      setBotStatus(botRes.data.status);

      if (botRes.data.pairingCode) {
        setPairingCode(botRes.data.pairingCode);
      }
    } catch {}

    try {
      const statusRes = await api.get('/dispatch/status');
      if (statusRes.data.status === 'STOPPED') {
        setStoppedSession({
          id: statusRes.data.sessionId,
          sent: statusRes.data.sent,
          total: statusRes.data.total,
        });
      } else {
        setStoppedSession(null);
      }
    } catch {}
  }

  const statusConfig = {
    connected: { color: 'connected', icon: Wifi, label: 'Conectado', badge: 'badge-success' },
    disconnected: { color: 'disconnected', icon: WifiOff, label: 'Desconectado', badge: 'badge-error' },
    connecting: { color: 'connecting', icon: Activity, label: 'Conectando...', badge: 'badge-warning' },
    qr: { color: 'qr', icon: Activity, label: 'Aguardando QR', badge: 'badge-info' },
    pairing: { color: 'qr', icon: Phone, label: 'Código Gerado', badge: 'badge-info' },
  };

  const status = statusConfig[botStatus] || statusConfig.disconnected;
  const StatusIcon = status.icon;

  const progressPercent = progress ? Math.round((progress.sent / progress.total) * 100) || 0 : 0;
  const isDispatching = progress && ['SENDING', 'PAUSED_BATCH'].includes(progress.status);
  const isStopped = progress && progress.status === 'STOPPED';
  const isDone = progress && ['DONE', 'CANCELLED'].includes(progress.status);

  const delayMs = progress?.delayMs || parseInt(settings.delay_ms, 10) || 30000;
  const delaySec = Math.round(delayMs / 1000);
  const remaining = progress ? progress.total - (progress.sent || 0) : 0;

  let estimatedSeconds = remaining * delaySec;
  const batchSize = parseInt(settings.batch_size, 10) || 0;
  const batchPauseMins = parseInt(settings.batch_pause_minutes, 10) || 10;
  const maxPauses = parseInt(settings.max_pauses, 10) || 0;

  if (batchSize > 0 && remaining > batchSize) {
    let remainingPauses = Math.floor((remaining - 1) / batchSize);
    if (maxPauses > 0) {
      const pausesTaken = Math.floor((progress?.sent || 0) / batchSize);
      let pausesAllowedRemaining = maxPauses - pausesTaken;
      if (pausesAllowedRemaining < 0) pausesAllowedRemaining = 0;
      if (remainingPauses > pausesAllowedRemaining) remainingPauses = pausesAllowedRemaining;
    }
    estimatedSeconds += remainingPauses * batchPauseMins * 60;
  }

  const requestPairingCode = async (e) => {
    e.preventDefault();
    if (!phoneInput || phoneInput.length < 10) {
      toast.error('Digite um número válido com código do país (ex: 258...)');
      return;
    }
    try {
      setPairingCode(null);
      setBotStatus('connecting');
      await api.post('/bot/pair', { phone: phoneInput });
      toast.success('Solicitando código de pareamento...');
    } catch (err) {
      setBotStatus('disconnected');
      toast.error(err.response?.data?.error || 'Erro ao solicitar código');
    }
  };

  const switchToQR = () => {
    setAuthMode('qr');
  };

  const generateQR = async () => {
    try {
      setQrCode(null);
      setBotStatus('connecting');
      await api.post('/bot/qr');
      toast.success('Gerando QR Code...');
    } catch {
      toast.error('Erro ao gerar QR Code');
    }
  };

  const switchToPhone = () => {
    setAuthMode('phone');
  };

  const stopConnection = async () => {
    try {
      await api.post('/bot/stop');
      setPairingCode(null);
      setQrCode(null);
      setBotStatus('disconnected');
      toast.success('Tentativa de conexão interrompida.');
    } catch {
      toast.error('Erro ao parar conexão');
    }
  };

  const handlePause = async () => {
    try {
      await api.post('/dispatch/stop');
      toast('⏸️ Disparo pausado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao pausar');
    }
  };

  const handleCancel = async () => {
    try {
      await api.post('/dispatch/cancel');
      setProgress(null);
      setStoppedSession(null);
      toast('❌ Disparo cancelado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const handleResume = async (sessionId) => {
    try {
      const { data } = await api.post('/dispatch/resume', { sessionId });
      toast.success(`▶️ Retomando do contato ${data.startIndex + 1}`);
      setStoppedSession(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao retomar');
    }
  };

  return (
    <div className="page-container" style={{ padding: '28px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <LayoutDashboard size={26} color="var(--accent)" />
          Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Visão geral do sistema de automação e conexão do WhatsApp
        </p>
      </div>

      {/* Grid de 4 Cards de Métricas (Uniforme 4x1 ou 2x2) */}
      <div className="dashboard-kpi-grid">
        {/* KPI 1: Status do Motor */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Motor WhatsApp</span>
            <div className={`card-icon ${botStatus === 'connected' ? 'green' : 'red'}`}>
              <StatusIcon size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div className={`status-dot ${status.color}`} />
            <span className="card-value" style={{ fontSize: '20px' }}>{status.label}</span>
          </div>
          <div className="card-label">
            {botStatus === 'connected' ? 'Sessão ativa e operacional' : 'Requer pareamento'}
          </div>
        </div>

        {/* KPI 2: Contatos Ativos */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Contatos Ativos</span>
            <div className="card-icon blue">
              <Users size={18} />
            </div>
          </div>
          <div className="card-value" style={{ fontSize: '24px', marginBottom: '6px' }}>
            {stats.totalContacts.toLocaleString('pt-BR')}
          </div>
          <div className="card-label">contatos prontos para envio</div>
        </div>

        {/* KPI 3: Agendamento Diário */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Agendamento Diário</span>
            <div className="card-icon yellow">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-value" style={{ fontSize: '24px', marginBottom: '6px' }}>
            {settings.schedule_enabled === 'true' ? settings.schedule_time || '15:00' : 'OFF'}
          </div>
          <div className="card-label">
            {settings.schedule_enabled === 'true' ? `Envio diário às ${settings.schedule_time}` : 'Agendamento desativado'}
          </div>
        </div>

        {/* KPI 4: Último Disparo */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Último Disparo</span>
            <div className="card-icon green">
              <FileSpreadsheet size={18} />
            </div>
          </div>
          {stats.lastSession ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="card-value" style={{ fontSize: '20px', color: 'var(--accent)' }}>
                  {stats.lastSession.sent}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>enviados</span>
                {stats.lastSession.errors > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--error)' }}>({stats.lastSession.errors} erros)</span>
                )}
              </div>
              <div className="card-label">
                <span className={`badge badge-${stats.lastSession.status === 'DONE' ? 'success' : stats.lastSession.status === 'STOPPED' ? 'warning' : 'error'}`}>
                  {stats.lastSession.status}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <div className="card-value" style={{ fontSize: '20px', color: 'var(--text-muted)' }}>0</div>
              <div className="card-label">Nenhum envio recente</div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Principal em 2 Colunas Balanceadas */}
      <div className="dashboard-main-grid">
        {/* Coluna 1: Painel de Conexão WhatsApp */}
        <div className="card" style={{ padding: '24px' }}>
          <div className="card-header" style={{ marginBottom: '16px' }}>
            <div>
              <span className="card-title">Conexão do WhatsApp</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                Pareie o dispositivo para habilitar disparos e validações
              </span>
            </div>
            <div className={`card-icon ${botStatus === 'connected' ? 'green' : 'red'}`}>
              <QrCode size={20} />
            </div>
          </div>

          {botStatus === 'connected' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                padding: '16px',
                background: 'rgba(37, 211, 102, 0.08)',
                border: '1px solid rgba(37, 211, 102, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="status-dot connected" style={{ width: '10px', height: '10px' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                      Dispositivo Conectado com Sucesso
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Motor Baileys online e autenticado na nuvem
                    </div>
                  </div>
                </div>
                <span className="badge badge-success">Online</span>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                O bot está pronto para realizar envios automáticos, checagem em lote no Validador e agendamentos diários.
              </div>

              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(true)}
                style={{ alignSelf: 'flex-start', color: 'var(--error)', marginTop: '8px' }}
              >
                Desconectar Sessão do WhatsApp
              </button>
            </div>
          ) : (
            <div>
              {/* Abas de Pareamento */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  className={`btn btn-sm ${authMode === 'phone' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={switchToPhone}
                  style={{ flex: 1, justifyContent: 'center', gap: '6px' }}
                >
                  <Phone size={14} /> Conectar via Número
                </button>
                <button
                  className={`btn btn-sm ${authMode === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={switchToQR}
                  style={{ flex: 1, justifyContent: 'center', gap: '6px' }}
                >
                  <QrCode size={14} /> Conectar via QR Code
                </button>
              </div>

              {authMode === 'phone' ? (
                <div>
                  {pairingCode ? (
                    <div style={{ textAlign: 'center', padding: '20px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Abra o WhatsApp &gt; <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar com número</strong>
                      </p>
                      <div className="mono" style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '4px', color: 'var(--accent)', marginBottom: '16px' }}>
                        {pairingCode}
                      </div>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                        onClick={stopConnection}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : botStatus === 'connecting' ? (
                    <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                        Gerando código de pareamento...
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
                        Aguarde a resposta dos servidores do WhatsApp
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={stopConnection}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={requestPairingCode}>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Número com código do país (ex: 25884...)
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          className="input input-mono"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="25884..."
                          style={{ flex: 1 }}
                        />
                        <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                          Gerar Código
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="qr-container" style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '220px' }}>
                  {botStatus === 'qr' && qrCode ? (
                    <>
                      <QRCodeSVG value={qrCode} size={180} level="M" />
                      <p style={{ marginTop: '12px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
                        Escaneie com a câmera do WhatsApp
                      </p>
                      <button className="btn btn-sm btn-secondary" onClick={stopConnection} style={{ marginTop: '12px' }}>
                        Parar Conexão
                      </button>
                    </>
                  ) : botStatus === 'connecting' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Gerando QR Code...
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={stopConnection}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                        Clique no botão abaixo para gerar uma imagem de QR Code.
                      </p>
                      <button className="btn btn-primary" onClick={generateQR} style={{ gap: '8px' }}>
                        <QrCode size={16} /> Gerar QR Code
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna 2: Disparo Ativo / Ações Rápidas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Se houver sessão pausada */}
          {!isDispatching && stoppedSession && (
            <div className="card" style={{ border: '1px solid rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.05)' }}>
              <div className="card-header" style={{ marginBottom: '12px' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)' }}>
                  <Pause size={16} /> Disparo Interrompido
                </span>
                <span className="badge badge-warning">PARADO</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '14px', lineHeight: 1.5 }}>
                O disparo anterior parou em <strong>{stoppedSession.sent}/{stoppedSession.total}</strong> envios. Deseja retomar de onde parou?
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleResume(stoppedSession.id)}
                  disabled={botStatus !== 'connected'}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Play size={15} /> Retomar Disparo
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    api.post('/dispatch/cancel', { sessionId: stoppedSession.id })
                      .then(() => { setStoppedSession(null); toast('Sessão descartada'); loadData(); })
                      .catch(() => toast.error('Erro'));
                  }}
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                >
                  <Square size={14} /> Descartar
                </button>
              </div>
            </div>
          )}

          {/* Barra de Progresso de Envio Ativo */}
          {progress && !isDone ? (
            <div className="card">
              <div className="card-header" style={{ marginBottom: '16px' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Send size={16} color="var(--accent)" />
                  {isStopped ? 'Disparo Pausado' : progress.status === 'PAUSED_BATCH' ? 'Pausa Anti-Ban' : 'Disparo em Andamento'}
                </span>
                <span className={`badge ${progress.status === 'DONE' ? 'badge-success' : isStopped || progress.status === 'PAUSED_BATCH' ? 'badge-warning' : 'badge-info'}`}>
                  {progress.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span className="mono" style={{ fontSize: '22px', fontWeight: 700 }}>
                  {progress.sent} / {progress.total}
                </span>
                <span className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                  {progressPercent}%
                </span>
              </div>

              <div className="progress-bar-container" style={{ height: '8px', marginBottom: '16px' }}>
                <div className="progress-bar-fill" style={{
                  width: `${progressPercent}%`,
                  backgroundColor: isStopped ? 'var(--warning)' : undefined
                }} />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                padding: '12px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TEMPO DECORRIDO</div>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>{formatTime(elapsedSeconds)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TEMPO ESTIMADO</div>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>{formatTime(estimatedSeconds)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {isDispatching ? (
                  <>
                    <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePause}>
                      <Pause size={14} /> Pausar
                    </button>
                    <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCancel}>
                      <Square size={14} /> Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleResume(progress.sessionId)}>
                      <Play size={14} /> Retomar
                    </button>
                    <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCancel}>
                      <Square size={14} /> Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Painel de Ações Rápidas */
            <div className="card" style={{ padding: '24px' }}>
              <div className="card-header" style={{ marginBottom: '16px' }}>
                <div>
                  <span className="card-title">Ações Rápidas</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    Atalhos para as principais operações da plataforma
                  </span>
                </div>
                <div className="card-icon blue">
                  <Sparkles size={18} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                  onClick={() => navigate('/dispatch')}
                  style={{
                    padding: '16px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37, 211, 102, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Send size={16} color="var(--accent)" />
                    </div>
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Novo Disparo</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Fila em tempo real</div>
                </div>

                <div
                  onClick={() => navigate('/validator')}
                  style={{
                    padding: '16px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--info)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} color="var(--info)" />
                    </div>
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Validador WhatsApp</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Verificação em lote</div>
                </div>

                <div
                  onClick={() => navigate('/generator')}
                  style={{
                    padding: '16px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Cpu size={16} color="#8b5cf6" />
                    </div>
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Gerador de Leads</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Geração por prefixo</div>
                </div>

                <div
                  onClick={() => navigate('/files')}
                  style={{
                    padding: '16px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--warning)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Folder size={16} color="var(--warning)" />
                    </div>
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Arquivos & Lotes</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Planilhas e mídias</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Desconectar Bot WhatsApp */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}>
                <AlertTriangle color="var(--error)" size={20} />
                Desconectar WhatsApp
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5, fontSize: '14px' }}>
              Tem certeza que deseja desconectar o bot? Esta ação apagará a sessão salva do Baileys e o sistema precisará ser pareado novamente para realizar disparos.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  try {
                    await api.post('/bot/logout');
                    toast.success('WhatsApp desconectado');
                  } catch {
                    toast.error('Erro ao desconectar');
                  }
                }}
              >
                Sim, Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
