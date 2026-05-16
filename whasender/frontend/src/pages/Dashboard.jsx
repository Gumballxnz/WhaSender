/**
 * WhaSender — Dashboard (Página Principal)
 * Exibe status do bot, progresso e estatísticas em tempo real
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Wifi, WifiOff, Activity, Users, Clock, AlertTriangle,
  Send, FileSpreadsheet, CheckCircle2, XCircle, Phone, QrCode,
  Pause, Square, Play, Timer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '../services/useSocket';
import api from '../services/api';

/**
 * Formatar segundos em HH:MM:SS
 */
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function Dashboard() {
  const [botStatus, setBotStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState(null);
  const [progress, setProgress] = useState(null);
  const [stats, setStats] = useState({ totalContacts: 0, lastSession: null });
  const [settings, setSettings] = useState({});
  const [pairingCode, setPairingCode] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [authMode, setAuthMode] = useState('phone');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [stoppedSession, setStoppedSession] = useState(null);

  // Timer de tempo decorrido
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Carregar dados iniciais
  useEffect(() => {
    loadData();
  }, []);

  // Timer: contar tempo decorrido durante disparo
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

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [progress?.status]);

  async function loadData() {
    try {
      const [statusRes, contactsRes, historyRes, settingsRes, dispatchStatusRes] = await Promise.all([
        api.get('/bot/status'),
        api.get('/contacts'),
        api.get('/dispatch/history'),
        api.get('/settings'),
        api.get('/dispatch/status'),
      ]);
      setBotStatus(statusRes.data.status);
      setStats({
        totalContacts: contactsRes.data.filter(c => c.active).length,
        lastSession: historyRes.data[0] || null,
      });
      setSettings(settingsRes.data);
      if (statusRes.data.pairingCode) {
        setPairingCode(statusRes.data.pairingCode);
        setBotStatus('pairing');
      }
      // Verificar se há sessão parada para retomada
      if (dispatchStatusRes.data.stoppedSession) {
        setStoppedSession(dispatchStatusRes.data.stoppedSession);
      }
    } catch {}
  }

  // WebSocket para atualizações em tempo real
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
        if (botStatus !== 'pairing') setBotStatus('qr');
        break;
      case 'PAIRING_CODE':
        setPairingCode(msg.payload);
        setBotStatus('pairing');
        break;
      case 'PAIRING_CODE_ERROR':
        toast.error(`Erro ao parear: ${msg.message}`);
        setPairingCode(null);
        break;
      case 'PROGRESS':
        setProgress(msg.data);
        // Se o disparo parou ou foi cancelado, limpar timer e recarregar dados
        if (['STOPPED', 'CANCELLED', 'DONE'].includes(msg.data?.status) && !msg.data?.current) {
          startTimeRef.current = null;
          setElapsedSeconds(0);
          // Recarregar para atualizar stoppedSession e lastSession
          setTimeout(() => loadData(), 500);
        }
        break;
      case 'DISPATCH_STARTED':
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
        setStoppedSession(null);
        setProgress({ sent: 0, total: msg.data.total, status: 'SENDING', delayMs: msg.data.delayMs });
        break;
      case 'DISPATCH_RESUMED':
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
        setStoppedSession(null);
        setProgress({ sent: msg.data.sentCount, total: msg.data.total, status: 'SENDING', delayMs: msg.data.delayMs });
        break;
      case 'DISPATCH_AUTO_STOPPED':
        toast.error('⚠️ Bot desconectou — disparo pausado automaticamente');
        loadData();
        break;
    }
  }, []);

  useSocket(handleWsMessage);

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

  // Calcular tempo estimado restante
  const delayMs = progress?.delayMs || parseInt(settings.delay_ms) || 30000;
  const delaySec = Math.round(delayMs / 1000);
  const remaining = progress ? progress.total - (progress.sent || 0) : 0;
  
  let estimatedSeconds = remaining * delaySec;
  
  // Adicionar estimativa de pausas de lote
  const batchSize = parseInt(settings.batch_size) || 0;
  const batchPauseMins = parseInt(settings.batch_pause_minutes) || 10;
  const maxPauses = parseInt(settings.max_pauses) || 0;
  
  if (batchSize > 0 && remaining > batchSize) {
     let remainingPauses = Math.floor((remaining - 1) / batchSize);
     if (maxPauses > 0) {
        const pausesTaken = Math.floor((progress?.sent || 0) / batchSize);
        let pausesAllowedRemaining = maxPauses - pausesTaken;
        if (pausesAllowedRemaining < 0) pausesAllowedRemaining = 0;
        
        if (remainingPauses > pausesAllowedRemaining) {
           remainingPauses = pausesAllowedRemaining;
        }
     }
     estimatedSeconds += remainingPauses * batchPauseMins * 60;
  }

  const requestPairingCode = async (e) => {
    e.preventDefault();
    if (!phoneInput || phoneInput.length < 10) {
      toast.error('Digite um número de telefone válido com código do país (ex: 258...)');
      return;
    }
    try {
      await api.post('/bot/pair', { phone: phoneInput });
      toast.success('Solicitando código...');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao solicitar código');
    }
  };

  const switchToQR = async () => {
    try {
      setAuthMode('qr');
      await api.post('/bot/qr');
    } catch {}
  };

  const switchToPhone = () => {
    setAuthMode('phone');
  };

  // Ações de disparo
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
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Visão geral do sistema de automação</p>
      </div>

      {/* Cards de status */}
      <div className="card-grid">
        {/* Card: Status do Bot */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Status do Bot</span>
            <div className={`card-icon ${botStatus === 'connected' ? 'green' : 'red'}`}>
              <StatusIcon size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className={`status-dot ${status.color}`}></div>
              <span className={`badge ${status.badge}`}>{status.label}</span>
            </div>
            
            {botStatus === 'connected' && (
              <button 
                className="btn btn-sm btn-danger" 
                onClick={() => setShowLogoutConfirm(true)}
              >
                Desconectar WhatsApp
              </button>
            )}
          </div>

          {/* Autenticação WhatsApp */}
          {(botStatus === 'disconnected' || botStatus === 'qr' || botStatus === 'pairing') && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button 
                  className={`btn btn-sm ${authMode === 'phone' ? 'btn-primary' : 'btn-secondary'}`} 
                  onClick={switchToPhone}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Phone size={14} /> Número
                </button>
                <button 
                  className={`btn btn-sm ${authMode === 'qr' ? 'btn-primary' : 'btn-secondary'}`} 
                  onClick={switchToQR}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <QrCode size={14} /> QR Code
                </button>
              </div>

              {authMode === 'phone' ? (
                <div>
                  {!pairingCode ? (
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
                        <button type="submit" className="btn btn-primary btn-sm">
                          Gerar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar &gt; Ligar com número de telefone
                      </p>
                      <div className="mono" style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '4px', color: 'var(--accent)' }}>
                        {pairingCode}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="qr-container" style={{ margin: 0, padding: '16px' }}>
                  {qrCode ? (
                    <>
                      <QRCodeSVG value={qrCode} size={180} level="M" />
                      <p style={{ marginTop: '12px', color: '#333', fontSize: '13px', fontWeight: 500 }}>
                        Escaneie com o WhatsApp
                      </p>
                    </>
                  ) : (
                    <div style={{ padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                      Gerando QR Code...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card: Contatos Ativos */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Contatos Ativos</span>
            <div className="card-icon blue">
              <Users size={20} />
            </div>
          </div>
          <div className="card-value">{stats.totalContacts}</div>
          <div className="card-label">contatos prontos para envio</div>
        </div>

        {/* Card: Próximo Agendamento */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Agendamento</span>
            <div className="card-icon yellow">
              <Clock size={20} />
            </div>
          </div>
          <div className="card-value" style={{ fontSize: '24px' }}>
            {settings.schedule_enabled === 'true' ? `${settings.schedule_time || '15:00'}` : 'OFF'}
          </div>
          <div className="card-label">
            {settings.schedule_enabled === 'true'
              ? `Disparo diário às ${settings.schedule_time} (Moçambique CAT)`
              : 'Agendamento desativado'}
          </div>
        </div>

        {/* Card: Último Disparo */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Último Disparo</span>
            <div className="card-icon green">
              <FileSpreadsheet size={20} />
            </div>
          </div>
          {stats.lastSession ? (
            <>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '6px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} color="var(--success)" />
                    <span className="mono" style={{ color: 'var(--success)' }}>{stats.lastSession.sent}</span>
                  </div>
                  <span className="card-label">enviados</span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <XCircle size={14} color="var(--error)" />
                    <span className="mono" style={{ color: 'var(--error)' }}>{stats.lastSession.errors}</span>
                  </div>
                  <span className="card-label">erros</span>
                </div>
              </div>
              <div className="card-label" style={{ fontSize: '12px' }}>
                <span className={`badge badge-${stats.lastSession.status === 'DONE' ? 'success' : stats.lastSession.status === 'STOPPED' ? 'warning' : stats.lastSession.status === 'CANCELLED' ? 'error' : 'warning'}`}>
                  {stats.lastSession.status}
                </span>
                <span style={{ marginLeft: '8px' }}>
                  {stats.lastSession.started_at ? new Date(stats.lastSession.started_at + 'Z').toLocaleString('pt-BR') : '—'}
                </span>
              </div>
            </>
          ) : (
            <div className="card-label">Nenhum disparo registrado</div>
          )}
        </div>
      </div>

      {/* Sessão Parada — Botão de Retomar */}
      {!isDispatching && stoppedSession && (
        <div className="card" style={{ marginBottom: '20px', border: '1px solid rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.05)' }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Pause size={16} color="var(--warning)" />
              Disparo Pausado
            </span>
            <span className="badge badge-warning">PARADO</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px', lineHeight: 1.5 }}>
            O disparo anterior foi interrompido em <strong style={{ color: 'var(--text-primary)' }}>{stoppedSession.sent}/{stoppedSession.total}</strong> envios. 
            Pode retomar de onde parou ou cancelar.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={() => handleResume(stoppedSession.id)}
              disabled={botStatus !== 'connected'}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Play size={16} /> Retomar Disparo
            </button>
            <button
              className="btn"
              onClick={() => {
                api.post('/dispatch/cancel', { sessionId: stoppedSession.id })
                  .then(() => { setStoppedSession(null); toast('Sessão descartada'); loadData(); })
                  .catch(() => toast.error('Erro'));
              }}
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <Square size={14} /> Descartar
            </button>
          </div>
          {botStatus !== 'connected' && (
            <p style={{ color: 'var(--warning)', fontSize: '12px', marginTop: '8px' }}>
              ⚠️ Conecte o bot primeiro para retomar
            </p>
          )}
        </div>
      )}

      {/* Barra de Progresso (visível durante disparo) */}
      {progress && !isDone && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <span className="card-title">
              <Send size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {isStopped ? 'Disparo Pausado' : progress.status === 'PAUSED_BATCH' ? 'Pausa de Lote' : 'Disparo em Andamento'}
            </span>
            <span className={`badge ${progress.status === 'DONE' ? 'badge-success' : progress.status === 'STOPPED' || progress.status === 'PAUSED_BATCH' ? 'badge-warning' : progress.status === 'ERROR' ? 'badge-error' : progress.status === 'CANCELLED' ? 'badge-error' : 'badge-info'}`}>
              {progress.status === 'STOPPED' ? 'PAUSADO' : progress.status === 'PAUSED_BATCH' ? 'PAUSA LOTE' : progress.status}
            </span>
          </div>

          {/* Contagem e percentagem */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span className="mono" style={{ fontSize: '20px', fontWeight: 700 }}>
              {progress.sent} / {progress.total}
            </span>
            <span className="mono" style={{ fontSize: '16px', color: 'var(--accent)' }}>
              {progressPercent}%
            </span>
          </div>

          {/* Barra de progresso */}
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ 
              width: `${progressPercent}%`,
              backgroundColor: isStopped ? 'var(--warning)' : undefined
            }}></div>
          </div>

          {/* Informações de tempo */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '10px', 
            marginTop: '12px',
            padding: '10px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            borderRadius: '8px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Decorrido</div>
              <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                <Timer size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {formatTime(elapsedSeconds)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Estimado</div>
              <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>
                ~{formatTime(estimatedSeconds)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Intervalo</div>
              <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {delaySec}s
              </div>
            </div>
          </div>

          {/* Contato atual */}
          {progress.current && progress.status !== 'PAUSED_BATCH' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <Activity size={14} />
              <span>Enviando para <strong style={{ color: 'var(--text-primary)' }}>{progress.current.name}</strong> — {progress.current.file_name}</span>
            </div>
          )}

          {/* Aviso de Pausa de Lote */}
          {progress.status === 'PAUSED_BATCH' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', color: 'var(--warning)', fontSize: '13px', fontWeight: 500, padding: '8px 12px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '6px' }}>
              <Timer size={14} />
              <span>Lote concluído. Pausa de {progress.batchPauseMs ? progress.batchPauseMs / 60000 : 0} minutos antes de retomar...</span>
            </div>
          )}

          {/* Erro individual */}
          {progress.status === 'ERROR' && progress.error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: 'var(--error)', fontSize: '13px' }}>
              <AlertTriangle size={14} />
              <span>{progress.error}</span>
            </div>
          )}

          {/* Razão de paragem automática */}
          {progress.reason && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: 'var(--warning)', fontSize: '13px' }}>
              <AlertTriangle size={14} />
              <span>{progress.reason}</span>
            </div>
          )}

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            {isDispatching && (
              <>
                <button
                  className="btn"
                  style={{ flex: 1, justifyContent: 'center', background: 'rgba(251, 191, 36, 0.15)', color: 'var(--warning)', border: '1px solid rgba(251, 191, 36, 0.3)' }}
                  onClick={handlePause}
                >
                  <Pause size={16} /> Pausar
                </button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleCancel}
                >
                  <Square size={16} /> Cancelar
                </button>
              </>
            )}

            {isStopped && (
              <>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleResume(progress.sessionId)}
                  disabled={botStatus !== 'connected'}
                >
                  <Play size={16} /> Retomar
                </button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleCancel}
                >
                  <Square size={16} /> Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Logout */}
      {showLogoutConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--surface-color)', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px', border: '1px solid var(--border-default)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', margin: '0 20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
              <AlertTriangle color="var(--error)" size={22} />
              Desconectar WhatsApp
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5, fontSize: '14px' }}>
              Tem certeza que deseja desconectar o bot? Esta ação apagará a sessão atual na nuvem e o sistema ficará inativo até você parear novamente.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn" 
                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }} 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-danger" 
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  try { await api.post('/bot/logout'); } catch {}
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
