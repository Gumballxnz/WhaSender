import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Wifi, WifiOff, Activity, Users, Clock, AlertTriangle,
  Send, CheckCircle2, Phone, QrCode,
  Pause, Square, Play, BarChart3, Search, RefreshCw,
  ArrowRight, ShieldCheck, Zap, Sparkles, Filter
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

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

export default function Dashboard() {
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
  const [sessions, setSessions] = useState([]);
  const [settings, setSettings] = useState({});
  const [phoneInput, setPhoneInput] = useState('');
  const [authMode, setAuthMode] = useState('phone');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [stoppedSession, setStoppedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [timeRange, setTimeRange] = useState('7d');

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
    setRefreshing(true);
    try {
      const [contactsRes, sessionRes, settingsRes, botRes, historyRes, statusRes] = await Promise.all([
        api.get('/contacts').catch(() => ({ data: [] })),
        api.get('/dispatch/last-session').catch(() => ({ data: { session: null } })),
        api.get('/settings').catch(() => ({ data: {} })),
        api.get('/bot/status').catch(() => ({ data: { status: 'disconnected' } })),
        api.get('/dispatch/history').catch(() => ({ data: [] })),
        api.get('/dispatch/status').catch(() => ({ data: { status: 'IDLE' } })),
      ]);

      const activeContacts = Array.isArray(contactsRes.data)
        ? contactsRes.data.filter((c) => c.active).length
        : 0;

      setStats({
        totalContacts: activeContacts,
        lastSession: sessionRes.data?.session || null,
      });

      setSessions(Array.isArray(historyRes.data) ? historyRes.data : []);
      setSettings(settingsRes.data || {});
      setBotStatus(botRes.data?.status || 'disconnected');

      if (botRes.data?.pairingCode) {
        setPairingCode(botRes.data.pairingCode);
      }

      if (statusRes.data?.status === 'STOPPED') {
        setStoppedSession({
          id: statusRes.data.sessionId,
          sent: statusRes.data.sent,
          total: statusRes.data.total,
        });
      } else {
        setStoppedSession(null);
      }
    } catch {
      toast.error('Erro ao atualizar métricas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const computedMetrics = useMemo(() => {
    let totalSent = 0;
    let totalErrors = 0;
    let totalExpected = 0;

    sessions.forEach((s) => {
      totalSent += Number(s.sent || 0);
      totalErrors += Number(s.errors || 0);
      totalExpected += Number(s.total || 0);
    });

    const deliveryAttempts = totalSent + totalErrors;
    const deliveryRate = deliveryAttempts > 0
      ? ((totalSent / deliveryAttempts) * 100).toFixed(1)
      : '100.0';
    const errorRate = deliveryAttempts > 0
      ? ((totalErrors / deliveryAttempts) * 100).toFixed(1)
      : '0.0';

    return {
      totalSent,
      totalErrors,
      deliveryAttempts,
      deliveryRate,
      errorRate,
    };
  }, [sessions]);

  const chartData = useMemo(() => {
    const points = [];
    const recent = [...sessions].reverse().slice(-14);

    if (recent.length === 0) {
      return [
        { label: 'Dia 1', sent: 0, errors: 0 },
        { label: 'Dia 2', sent: 0, errors: 0 },
        { label: 'Dia 3', sent: 0, errors: 0 },
        { label: 'Dia 4', sent: 0, errors: 0 },
        { label: 'Dia 5', sent: 0, errors: 0 },
        { label: 'Dia 6', sent: 0, errors: 0 },
        { label: 'Dia 7', sent: 0, errors: 0 },
      ];
    }

    recent.forEach((s, idx) => {
      points.push({
        label: s.started_at ? formatDate(s.started_at) : `#${idx + 1}`,
        sent: Number(s.sent || 0),
        errors: Number(s.errors || 0),
      });
    });

    while (points.length < 7) {
      points.unshift({ label: '-', sent: 0, errors: 0 });
    }

    return points;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const idMatch = String(s.id).includes(query);
        const statusMatch = String(s.status || '').toLowerCase().includes(query);
        if (!idMatch && !statusMatch) return false;
      }
      return true;
    });
  }, [sessions, statusFilter, searchTerm]);

  const statusConfig = {
    connected: { color: 'connected', icon: Wifi, label: 'Conectado', badge: 'badge-success' },
    disconnected: { color: 'disconnected', icon: WifiOff, label: 'Desconectado', badge: 'badge-error' },
    connecting: { color: 'connecting', icon: Activity, label: 'Conectando...', badge: 'badge-warning' },
    qr: { color: 'qr', icon: Activity, label: 'Aguardando QR', badge: 'badge-info' },
    pairing: { color: 'qr', icon: Phone, label: 'Código Gerado', badge: 'badge-info' },
  };

  const status = statusConfig[botStatus] || statusConfig.disconnected;
  const progressPercent = progress ? Math.round((progress.sent / progress.total) * 100) || 0 : 0;
  const isDispatching = progress && ['SENDING', 'PAUSED_BATCH'].includes(progress.status);
  const isStopped = progress && progress.status === 'STOPPED';
  const isDone = progress && ['DONE', 'CANCELLED'].includes(progress.status);

  const delayMs = progress?.delayMs || parseInt(settings.delay_ms, 10) || 30000;
  const delaySec = Math.round(delayMs / 1000);
  const remaining = progress ? progress.total - (progress.sent || 0) : 0;
  let estimatedSeconds = remaining * delaySec;

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

  const stopConnection = async () => {
    try {
      await api.post('/bot/stop');
      setPairingCode(null);
      setQrCode(null);
      setBotStatus('disconnected');
      toast.success('Tentativa de conexão interrompida');
    } catch {
      toast.error('Erro ao parar conexão');
    }
  };

  const handlePause = async () => {
    try {
      await api.post('/dispatch/stop');
      toast('Disparo pausado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao pausar');
    }
  };

  const handleCancel = async () => {
    try {
      await api.post('/dispatch/cancel');
      setProgress(null);
      setStoppedSession(null);
      toast('Disparo cancelado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const handleResume = async (sessionId) => {
    try {
      const { data } = await api.post('/dispatch/resume', { sessionId });
      toast.success(`Retomando do contato ${data.startIndex + 1}`);
      setStoppedSession(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao retomar');
    }
  };

  const maxSent = Math.max(...chartData.map((d) => d.sent), 10);
  const chartWidth = 900;
  const chartHeight = 180;
  const stepX = chartWidth / (chartData.length - 1 || 1);

  const pointsSvg = chartData.map((d, i) => {
    const x = i * stepX;
    const y = chartHeight - (d.sent / maxSent) * (chartHeight - 30) - 15;
    return { x, y, sent: d.sent, label: d.label };
  });

  const pathD = pointsSvg.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${pointsSvg[pointsSvg.length - 1].x} ${chartHeight} L ${pointsSvg[0].x} ${chartHeight} Z`;

  return (
    <div className="main-container">
      {/* Resend Header */}
      <div className="resend-header">
        <div>
          <h1 className="resend-title">Métricas</h1>
          <p className="resend-subtitle">
            Desempenho de entrega e monitoramento operacional do WhatsApp
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadData}
            disabled={refreshing}
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/dispatch')}
            style={{ padding: '8px 16px', fontWeight: 600 }}
          >
            <Send size={14} />
            <span>Iniciar Disparo</span>
          </button>
        </div>
      </div>

      {/* Resend Hero Metrics Card */}
      <div className="resend-hero-card">
        <div className="resend-hero-header">
          <div className="resend-stats-group">
            <div className="resend-stat-item">
              <span className="resend-stat-label">Disparos Concluídos</span>
              <span className="resend-stat-value">
                {computedMetrics.totalSent.toLocaleString('pt-BR')}
              </span>
            </div>

            <div className="resend-stat-item">
              <span className="resend-stat-label">Taxa de Entrega</span>
              <span className="resend-stat-value" style={{ color: 'var(--accent)' }}>
                {computedMetrics.deliveryRate}%
              </span>
            </div>

            <div className="resend-stat-item">
              <span className="resend-stat-label">Tentativas de Entrega</span>
              <span className="resend-stat-value">
                {computedMetrics.deliveryAttempts.toLocaleString('pt-BR')}
              </span>
            </div>

            <div className="resend-stat-item">
              <span className="resend-stat-label">Contatos Ativos</span>
              <span className="resend-stat-value">
                {stats.totalContacts.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              className="resend-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Todo o histórico</option>
            </select>
          </div>
        </div>

        {/* Resend SVG Area Chart */}
        <div className="resend-chart-wrapper">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="resendChartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#25d366" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#25d366" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0.2, 0.5, 0.8].map((ratio, idx) => (
              <line
                key={idx}
                x1="0"
                y1={chartHeight * ratio}
                x2={chartWidth}
                y2={chartHeight * ratio}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
              />
            ))}

            {/* Area Fill */}
            <path d={areaD} fill="url(#resendChartGradient)" />

            {/* Line Stroke */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Dots */}
            {pointsSvg.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                fill="#000000"
                stroke="var(--accent)"
                strokeWidth="2"
              />
            ))}
          </svg>
        </div>

        <div className="resend-hero-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Enviados com Sucesso</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)' }} />
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Contatos na Fila</span>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Atualizado em tempo real via WebSocket
          </span>
        </div>
      </div>

      {/* Disparo Ativo / Pausado (se houver) */}
      {progress && !isDone && (
        <div className="resend-card" style={{ marginBottom: '24px', borderColor: 'var(--border-accent)' }}>
          <div className="resend-card-header">
            <span className="resend-card-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={14} />
              {isStopped ? 'Disparo Pausado' : progress.status === 'PAUSED_BATCH' ? 'Pausa Anti-Ban Ativa' : 'Disparo em Andamento'}
            </span>
            <span className={`badge ${progress.status === 'DONE' ? 'badge-success' : 'badge-warning'}`}>
              {progress.status}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 600 }}>
              {progress.sent} / {progress.total}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 600, color: 'var(--accent)' }}>
              {progressPercent}%
            </span>
          </div>

          <div className="progress-bar-container" style={{ height: '8px', marginBottom: '16px' }}>
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span>Tempo decorrido: <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{formatTime(elapsedSeconds)}</strong></span>
              <span>Tempo estimado: <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{formatTime(estimatedSeconds)}</strong></span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {isDispatching ? (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={handlePause}>
                    <Pause size={14} /> Pausar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleCancel}>
                    <Square size={14} /> Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => handleResume(progress.sessionId)}>
                    <Play size={14} /> Retomar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleCancel}>
                    <Square size={14} /> Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sessão interrompida pendente */}
      {!isDispatching && stoppedSession && (
        <div className="resend-card" style={{ marginBottom: '24px', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <div className="resend-card-header">
            <span className="resend-card-title" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Pause size={14} /> Disparo Interrompido
            </span>
            <span className="badge badge-warning">PARADO</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            O envio parou em <strong>{stoppedSession.sent}/{stoppedSession.total}</strong> contatos. Deseja retomar de onde parou?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleResume(stoppedSession.id)}
              disabled={botStatus !== 'connected'}
            >
              <Play size={14} /> Retomar Envio
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                api.post('/dispatch/cancel', { sessionId: stoppedSession.id })
                  .then(() => { setStoppedSession(null); toast('Sessão descartada'); loadData(); });
              }}
            >
              <Square size={14} /> Descartar
            </button>
          </div>
        </div>
      )}

      {/* 2-Column Balanced Grid (Resend Metrics Standard) */}
      <div className="resend-grid-2">
        {/* Card 1: Taxa de Erro & Saúde de Entrega */}
        <div className="resend-card">
          <div className="resend-card-header">
            <span className="resend-card-title">Taxa de Erro & Risco</span>
            <ShieldCheck size={16} color="var(--accent)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: Number(computedMetrics.errorRate) > 5 ? 'var(--error)' : '#ffffff' }}>
              {computedMetrics.errorRate}%
            </span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: Number(computedMetrics.errorRate) > 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 211, 102, 0.15)',
              color: Number(computedMetrics.errorRate) > 5 ? 'var(--error)' : 'var(--accent)',
              fontWeight: 600
            }}>
              {Number(computedMetrics.errorRate) > 5 ? 'Atenção aos Bloqueios' : 'Abaixo do limite de risco de 5%'}
            </span>
          </div>

          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
            Algoritmo inteligente de cadência e pausas anti-ban ativo para proteger a saúde e o número do seu WhatsApp.
          </p>

          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Delay ativo: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(delayMs / 1000)}s</strong></span>
            <span>Total com falha: <strong style={{ color: 'var(--text-primary)' }}>{computedMetrics.totalErrors}</strong></span>
          </div>
        </div>

        {/* Card 2: Motor WhatsApp & Sessão Baileys */}
        <div className="resend-card">
          <div className="resend-card-header">
            <span className="resend-card-title">Conexão do Motor WhatsApp</span>
            <div className={`status-dot ${botStatus || 'disconnected'}`} />
          </div>

          {botStatus === 'connected' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span className="badge badge-success">Online</span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  Sessão Baileys ativa e sincronizada
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
                O bot está autenticado na nuvem e pronto para processar novos lotes, disparos agendados e validação em lote.
              </p>
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aparelho conectado</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowLogoutConfirm(true)}
                  style={{ color: 'var(--error)' }}
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${authMode === 'phone' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAuthMode('phone')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Phone size={13} /> Pareamento por Código
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${authMode === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAuthMode('qr')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <QrCode size={13} /> QR Code
                </button>
              </div>

              {authMode === 'phone' ? (
                <div>
                  {pairingCode ? (
                    <div style={{ textAlign: 'center', padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>CÓDIGO DE PAREAMENTO</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '4px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                        {pairingCode}
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={stopConnection}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={requestPairingCode}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="25884..."
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                          style={{ flex: 1, fontSize: '13px' }}
                        />
                        <button type="submit" className="btn btn-primary btn-sm">
                          Gerar Código
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px' }}>
                  {botStatus === 'qr' && qrCode ? (
                    <div>
                      <QRCodeSVG value={qrCode} size={130} level="M" />
                      <button className="btn btn-secondary btn-sm" onClick={stopConnection} style={{ marginTop: '8px' }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={generateQR}>
                      <QrCode size={13} /> Gerar Imagem QR Code
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resend Toolbar for Sessions */}
      <div className="resend-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="resend-search-box">
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              className="resend-search-input"
              placeholder="Buscar disparos por ID ou status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="resend-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Todos os Status</option>
            <option value="DONE">Concluídos</option>
            <option value="STOPPED">Interrompidos</option>
            <option value="RUNNING">Em Execução</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredSessions.length} {filteredSessions.length === 1 ? 'disparo registrado' : 'disparos registrados'}
        </div>
      </div>

      {/* Dispatches Table / Empty State */}
      {filteredSessions.length === 0 ? (
        <div className="resend-empty-state">
          <div className="resend-empty-emblem">
            <Send size={28} color="var(--accent)" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
            Nenhum disparo encontrado
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5, marginBottom: '20px' }}>
            Inicie um novo envio em massa selecionando suas planilhas validadas ou configurando o agendamento diário automático.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/dispatch')}
            style={{ padding: '8px 18px', fontWeight: 600 }}
          >
            <Send size={14} />
            <span>Iniciar Primeiro Disparo</span>
          </button>
        </div>
      ) : (
        <div className="resend-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Sessão</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Data de Início</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Total</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Enviados</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Falhas</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Taxa</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const rate = session.total > 0
                    ? Math.round((session.sent / session.total) * 100)
                    : 0;
                  return (
                    <tr
                      key={session.id}
                      style={{ borderBottom: '1px solid var(--border-default)', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        #{session.id}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {formatDate(session.started_at)}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {session.total}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {session.sent}
                      </td>
                      <td style={{ padding: '14px 18px', color: session.errors > 0 ? 'var(--error)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {session.errors || 0}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: rate === 100 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {rate}%
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span className={`badge ${session.status === 'DONE' ? 'badge-success' : session.status === 'STOPPED' ? 'badge-warning' : 'badge-error'}`}>
                          {session.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Desconectar */}
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
              Deseja encerrar a sessão do WhatsApp? Será necessário reconectar para realizar novos disparos.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
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
                    loadData();
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
