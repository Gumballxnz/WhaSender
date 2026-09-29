import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Upload, FileText, Play, Square,
  Download, ArrowRight, RefreshCw, Loader2, Clock, Check, ShieldCheck, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useSocketStore from '../store/socketStore';

export default function Validator() {
  const botStatus = useSocketStore((s) => s.botStatus);
  const validationProgress = useSocketStore((s) => s.validationProgress);
  const setValidationProgress = useSocketStore((s) => s.setValidationProgress);

  const [inputMode, setInputMode] = useState('file');
  const [selectedFile, setSelectedFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [speedMode, setSpeedMode] = useState('balanced');
  const [sessionName, setSessionName] = useState('');

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [movingToFiles, setMovingToFiles] = useState(false);
  const [confirmMoveId, setConfirmMoveId] = useState(null);

  const fileInputRef = useRef(null);

  const isConnected = botStatus === 'connected';
  const isRunning = validationProgress?.status === 'RUNNING';

  const speedConfigs = {
    safe: { chunkSize: 25, delayMs: 500, label: 'Seguro (Recomendado)', desc: '25 contatos/lote, pausa de 500ms' },
    balanced: { chunkSize: 40, delayMs: 300, label: 'Equilibrado', desc: '40 contatos/lote, pausa de 300ms' },
    turbo: { chunkSize: 50, delayMs: 150, label: 'Turbo (Rápido)', desc: '50 contatos/lote, pausa de 150ms' },
  };

  const loadSessions = async () => {
    try {
      const { data } = await api.get('/validator/sessions');
      setSessions(data.sessions || []);
    } catch {
      toast.error('Erro ao carregar histórico de validações');
    } finally {
      setHistoryLoading(false);
    }
  };

  const checkInitialStatus = async () => {
    try {
      const { data } = await api.get('/validator/status');
      if (data.session && data.session.status === 'RUNNING') {
        setValidationProgress(data.session);
      }
    } catch {}
  };

  useEffect(() => {
    checkInitialStatus();
    loadSessions();
  }, []);

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleStart = async () => {
    if (!isConnected) {
      toast.error('Conecte o bot de WhatsApp no Dashboard antes de iniciar.');
      return;
    }

    if (inputMode === 'file' && !selectedFile) {
      toast.error('Selecione uma planilha ou arquivo de texto.');
      return;
    }

    if (inputMode === 'text' && !rawText.trim()) {
      toast.error('Digite ou cole ao menos um número de telefone.');
      return;
    }

    setLoading(true);

    try {
      const cfg = speedConfigs[speedMode];
      let res;

      if (inputMode === 'file') {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('name', sessionName.trim() || selectedFile.name);
        formData.append('chunkSize', cfg.chunkSize);
        formData.append('delayMs', cfg.delayMs);

        res = await api.post('/validator/start', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await api.post('/validator/start', {
          phones: rawText,
          name: sessionName.trim() || `Validação Manual (${new Date().toLocaleTimeString('pt-BR')})`,
          chunkSize: cfg.chunkSize,
          delayMs: cfg.delayMs,
        });
      }

      toast.success(res.data.message || 'Validação iniciada!');
      setSelectedFile(null);
      setRawText('');
      setSessionName('');
      loadSessions();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar validação');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      await api.post('/validator/stop');
      toast('Validação sendo interrompida...');
    } catch {
      toast.error('Erro ao solicitar parada.');
    }
  };

  const handleDownload = (sessionId, type) => {
    window.open(`/api/validator/export/${sessionId}/${type}`, '_blank');
  };

  const handleMoveToFiles = async (sessionId) => {
    setMovingToFiles(true);
    try {
      const { data } = await api.post(`/validator/move-to-files/${sessionId}`);
      toast.success(data.message || 'Números movidos para arquivos de disparo!');
      setConfirmMoveId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao mover números');
    } finally {
      setMovingToFiles(false);
    }
  };

  const rawPhoneCount = rawText
    .split(/[\r\n,;]+/)
    .map((p) => p.replace(/\D/g, ''))
    .filter((p) => p.length >= 8).length;

  const total = validationProgress?.total || 0;
  const checked = validationProgress?.checked || 0;
  const validCount = validationProgress?.validCount || 0;
  const invalidCount = validationProgress?.invalidCount || 0;
  const pct = total > 0 ? Math.min(100, Math.round((checked / total) * 100)) : 0;
  const validRate = checked > 0 ? ((validCount / checked) * 100).toFixed(1) : 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 color="var(--accent)" size={28} />
            Validador de Contas WhatsApp
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Identifique em massa quais números possuem conta ativa no WhatsApp antes de disparar.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '6px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: 600,
            background: isConnected ? 'rgba(37, 211, 102, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${isConnected ? 'rgba(37, 211, 102, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            color: isConnected ? 'var(--accent)' : 'var(--error)',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? 'var(--accent)' : 'var(--error)' }} />
            {isConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          </div>

          <button className="btn" onClick={loadSessions} title="Atualizar histórico">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {!isConnected && (
        <div style={{
          padding: '16px', borderRadius: '12px', marginBottom: '24px',
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle color="var(--error)" size={24} />
            <div>
              <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>Sessão do WhatsApp Desconectada</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                O protocolo oficial do WhatsApp exige uma conexão autenticada para validar a existência dos contatos.
              </p>
            </div>
          </div>
          <a href="/dashboard" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: '13px' }}>
            Conectar Bot no Dashboard
          </a>
        </div>
      )}

      {validationProgress && (
        <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--border-accent)', background: 'linear-gradient(180deg, rgba(37,211,102,0.03) 0%, var(--bg-card) 100%)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isRunning ? <Loader2 size={18} className="spin" color="var(--accent)" /> : <CheckCircle2 size={18} color="var(--accent)" />}
              {isRunning ? 'Validação em Andamento' : 'Status da Validação'}
            </span>
            <span style={{
              fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px',
              background: isRunning ? 'rgba(37, 211, 102, 0.15)' : 'rgba(255,255,255,0.05)',
              color: isRunning ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              {validationProgress.status}
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Progresso Geral</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {checked.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')} ({pct}%)
              </span>
            </div>
            <div style={{ height: '10px', borderRadius: '100px', background: 'var(--bg-input)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '100px',
                background: 'linear-gradient(90deg, var(--accent) 0%, #3b82f6 100%)',
                width: `${pct}%`, transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.2)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} color="var(--accent)" /> WhatsApp Ativo
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {validCount.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {validRate}% de conversão
              </div>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <XCircle size={14} color="var(--error)" /> Sem WhatsApp
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--error)', fontFamily: 'var(--font-mono)' }}>
                {invalidCount.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Inexistentes ou inativos
              </div>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} color="var(--text-muted)" /> Total Processado
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {checked.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                De {total.toLocaleString('pt-BR')} contatos
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
            {isRunning ? (
              <button className="btn btn-danger" onClick={handleStop} style={{ gap: '8px' }}>
                <Square size={15} /> Interromper Validação
              </button>
            ) : (
              validationProgress.sessionId && (
                <>
                  <button className="btn" onClick={() => handleDownload(validationProgress.sessionId, 'valid')} style={{ gap: '6px' }}>
                    <Download size={15} color="var(--accent)" /> Baixar Válidos (.xlsx)
                  </button>
                  <button className="btn" onClick={() => handleDownload(validationProgress.sessionId, 'invalid')} style={{ gap: '6px' }}>
                    <Download size={15} color="var(--error)" /> Baixar Inválidos (.xlsx)
                  </button>
                  <button className="btn btn-primary" onClick={() => setConfirmMoveId(validationProgress.sessionId)} style={{ gap: '6px' }}>
                    <ArrowRight size={15} /> Mover para Disparo
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">1. Entrada de Contatos</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'var(--bg-input)', padding: '4px', borderRadius: '8px' }}>
            <button
              className="btn"
              style={{
                flex: 1, justifyContent: 'center', fontSize: '13px',
                background: inputMode === 'file' ? 'var(--bg-card)' : 'transparent',
                borderColor: inputMode === 'file' ? 'var(--border-default)' : 'transparent',
                color: inputMode === 'file' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setInputMode('file')}
            >
              <Upload size={14} style={{ marginRight: '6px' }} /> Arquivo (.xlsx, .txt)
            </button>
            <button
              className="btn"
              style={{
                flex: 1, justifyContent: 'center', fontSize: '13px',
                background: inputMode === 'text' ? 'var(--bg-card)' : 'transparent',
                borderColor: inputMode === 'text' ? 'var(--border-default)' : 'transparent',
                color: inputMode === 'text' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setInputMode('text')}
            >
              <FileText size={14} style={{ marginRight: '6px' }} /> Digitar / Colar
            </button>
          </div>

          <div className="input-group" style={{ marginBottom: '16px' }}>
            <label>Nome / Identificador da Sessão (Opcional)</label>
            <input
              className="input"
              placeholder="Ex: Leads Campanha Natal 2026"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              disabled={isRunning}
            />
          </div>

          {inputMode === 'file' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.txt,.csv"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
                disabled={isRunning}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => !isRunning && fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-default)', borderRadius: '12px',
                  padding: '36px 20px', textAlign: 'center', cursor: isRunning ? 'not-allowed' : 'pointer',
                  background: 'rgba(255,255,255,0.01)', transition: 'border-color 0.2s',
                }}
              >
                <Upload size={32} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
                {selectedFile ? (
                  <div>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{selectedFile.name}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB — Clique para trocar
                    </span>
                  </div>
                ) : (
                  <div>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Clique ou arraste a planilha aqui
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Formatos aceitos: .xlsx, .xls, .csv ou .txt
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label>Cole os números de telefone</label>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {rawPhoneCount} identificados
                </span>
              </div>
              <textarea
                className="input input-mono"
                rows={7}
                placeholder={"258841234567\n258851234568\n258861234569"}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={isRunning}
                style={{ resize: 'vertical', fontSize: '13px' }}
              />
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <span className="card-title">2. Velocidade e Anti-Ban</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {Object.entries(speedConfigs).map(([key, cfg]) => {
                const isSelected = speedMode === key;
                return (
                  <div
                    key={key}
                    onClick={() => !isRunning && setSpeedMode(key)}
                    style={{
                      padding: '12px 16px', borderRadius: '10px', cursor: isRunning ? 'not-allowed' : 'pointer',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
                      background: isSelected ? 'rgba(37, 211, 102, 0.05)' : 'var(--bg-input)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '14px', color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {cfg.label}
                      </strong>
                      {isSelected && <Check size={16} color="var(--accent)" />}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                      {cfg.desc}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <ShieldCheck size={15} color="var(--info)" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              O Baileys consulta a API interna de contatos do WhatsApp agrupando requisições em lotes. O modo <strong>Seguro</strong> reduz significativamente riscos de bloqueio em listas grandes.
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}
              onClick={handleStart}
              disabled={loading || isRunning || !isConnected}
            >
              {loading ? (
                <><Loader2 size={16} className="spin" /> Iniciando...</>
              ) : isRunning ? (
                <><Loader2 size={16} className="spin" /> Validação Ativa...</>
              ) : (
                <><Play size={16} /> Iniciar Validação</>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Histórico de Validações
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {sessions.length} sessões registradas
          </span>
        </div>

        {historyLoading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ height: '42px', borderRadius: '8px', background: 'linear-gradient(90deg, var(--bg-input) 25%, var(--bg-card-hover) 50%, var(--bg-input) 75%)', backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite', marginBottom: '10px' }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhuma validação realizada ainda. Suba uma planilha ou cole números acima para começar.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Sessão</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Data</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>Total</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>Válidos</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>Inválidos</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '12px 16px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const sPct = s.total > 0 ? ((s.valid_count / s.total) * 100).toFixed(1) : 0;
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      #{s.id} — {s.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {s.started_at}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {s.total?.toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {s.valid_count?.toLocaleString('pt-BR')} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({sPct}%)</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--error)', fontFamily: 'var(--font-mono)' }}>
                      {s.invalid_count?.toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px',
                        background: s.status === 'COMPLETED' ? 'rgba(37, 211, 102, 0.15)' : s.status === 'RUNNING' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: s.status === 'COMPLETED' ? 'var(--accent)' : s.status === 'RUNNING' ? 'var(--info)' : 'var(--error)',
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="Baixar Válidos"
                          onClick={() => handleDownload(s.id, 'valid')}
                        >
                          <Download size={13} color="var(--accent)" /> Válidos
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="Baixar Inválidos"
                          onClick={() => handleDownload(s.id, 'invalid')}
                        >
                          <Download size={13} color="var(--error)" /> Inválidos
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(37, 211, 102, 0.1)', color: 'var(--accent)' }}
                          title="Mover Válidos para Disparador"
                          onClick={() => setConfirmMoveId(s.id)}
                        >
                          <ArrowRight size={13} /> Disparo
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirmMoveId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: '12px', padding: '24px', maxWidth: '460px', width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--text-primary)' }}>
              <Zap color="var(--accent)" size={22} />
              Mover para Fila de Disparo?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              Deseja salvar os números válidos da <strong>Sessão #{confirmMoveId}</strong> como uma nova planilha de leads na pasta de arquivos do disparador?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setConfirmMoveId(null)}
                disabled={movingToFiles}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleMoveToFiles(confirmMoveId)}
                disabled={movingToFiles}
                style={{ gap: '6px' }}
              >
                {movingToFiles ? <><Loader2 size={14} className="spin" /> Movendo...</> : 'Sim, Mover para Arquivos'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
