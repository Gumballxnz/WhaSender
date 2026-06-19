/**
 * WhaSender — Gerador de Leads (Nova Página Dedicada)
 * Dashboard de métricas + formulário de geração + histórico
 * Inspirado no design mz-lead-pro
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Phone, Hash, Shield, FileSpreadsheet, Download, Loader2, 
  Cpu, History, BarChart3, Zap, AlertTriangle, CheckCircle2, XCircle,
  Archive
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Generator() {
  // Métricas
  const [metrics, setMetrics] = useState({
    totalNumbers: 0,
    totalSessions: 0,
    completedSessions: 0,
    activePrefixes: [],
    byPrefix: [],
  });

  // Histórico
  const [history, setHistory] = useState([]);

  // Formulário
  const [modo, setModo] = useState('total'); // "total" ou "partes"
  const [prefixo, setPrefixo] = useState('87');
  const [quantidade, setQuantidade] = useState(1000);
  const [partesInput, setPartesInput] = useState(10);
  const [contatosPorParte, setContatosPorParte] = useState(1000);

  // Geração em progresso
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [startTime, setStartTime] = useState(null);

  // Loading
  const [loading, setLoading] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [movingSessionId, setMovingSessionId] = useState(null);
  const [downloadingSessionId, setDownloadingSessionId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsRes, historyRes, statusRes] = await Promise.all([
        api.get('/files/generate/metrics'),
        api.get('/files/generate/history'),
        api.get('/files/generate/status'),
      ]);
      setMetrics(metricsRes.data);
      setHistory(historyRes.data);

      // Retomar polling se já houver geração em andamento
      if (statusRes.data.running) {
        setGenerating(true);
        setStartTime(Date.now());
        setProgress(statusRes.data);
        startPolling();
      }
    } catch (err) {
      console.error('Erro ao carregar dados do gerador:', err);
    } finally {
      setLoading(false);
    }
  };

  // Polling de progresso
  const startPolling = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/files/generate/status');
        setProgress(data);
        if (!data.running) {
          clearInterval(interval);
          setGenerating(false);
          if (data.message?.includes('sucesso')) {
            toast.success(data.message);
          } else if (data.message?.includes('Falha')) {
            toast.error(data.message);
          }
          loadData(); // Recarregar métricas e histórico
        }
      } catch (err) {
        clearInterval(interval);
        setGenerating(false);
        toast.error('Erro ao ler status da geração');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calcular partes e total baseado no modo
  const getGenerationParams = () => {
    if (modo === 'total') {
      // Dividir quantidade total em partes de até 25000
      const numPorParte = Math.min(25000, quantidade);
      const numPartes = Math.ceil(quantidade / numPorParte);
      return { partes: numPartes, contatosPorParte: numPorParte, total: quantidade };
    } else {
      return { partes: partesInput, contatosPorParte, total: partesInput * contatosPorParte };
    }
  };

  const params = getGenerationParams();

  // Iniciar geração
  const handleGenerate = async () => {
    setGenerating(true);
    setStartTime(Date.now());
    setProgress({ current: 0, total: params.partes, message: 'Iniciando geração...' });

    try {
      await api.post('/files/generate', {
        partes: params.partes,
        contatosPorParte: params.contatosPorParte,
        prefixo,
      });
      toast.success('Geração de leads iniciada!');
      startPolling();
    } catch (err) {
      setGenerating(false);
      toast.error('Erro ao iniciar: ' + (err.response?.data?.error || err.message));
    }
  };

  // Download ZIP
  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const response = await api.get('/files/download-zip', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Download ZIP iniciado!');
    } catch (err) {
      toast.error('Erro ao baixar ZIP: ' + (err.response?.data?.error || err.message));
    } finally {
      setDownloadingZip(false);
    }
  };

  // Download ZIP de uma sessão específica
  const handleDownloadSessionZip = async (sessionId) => {
    setDownloadingSessionId(sessionId);
    try {
      const response = await api.get(`/files/generate/download-zip/${sessionId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_sessao_${sessionId}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`Download da geração #${sessionId} iniciado!`);
    } catch (err) {
      toast.error('Erro ao baixar ZIP da geração: ' + (err.response?.data?.error || err.message));
    } finally {
      setDownloadingSessionId(null);
    }
  };

  // Mover planilhas de uma sessão para envios
  const handleMoveToFiles = async (sessionId) => {
    setMovingSessionId(sessionId);
    try {
      const { data } = await api.post(`/files/generate/move-to-files/${sessionId}`);
      toast.success(data.message || 'Arquivos movidos com sucesso para a fila de envio!');
    } catch (err) {
      toast.error('Erro ao mover arquivos: ' + (err.response?.data?.error || err.message));
    } finally {
      setMovingSessionId(null);
    }
  };

  // ETA
  const getEta = () => {
    if (!startTime || !progress.current || !generating) return '';
    const elapsed = (Date.now() - startTime) / 1000;
    const avg = elapsed / progress.current;
    const remaining = Math.round(avg * (progress.total - progress.current));
    if (remaining <= 0) return 'Concluindo...';
    if (remaining < 60) return `~${remaining}s restante`;
    return `~${Math.floor(remaining / 60)}m ${remaining % 60}s restante`;
  };

  // Encontrar maior contagem por prefixo para barra proporcional
  const maxPrefixCount = Math.max(1, ...metrics.byPrefix.map(p => p.count));

  // Cores por prefixo
  const prefixColors = {
    '84': '#25d366',
    '85': '#3b82f6',
    '86': '#8b5cf6',
    '87': '#06b6d4',
  };

  const statusBadge = (status) => {
    if (status === 'DONE') return <span className="badge badge-success">feito</span>;
    if (status === 'ERROR') return <span className="badge badge-error">erro</span>;
    if (status === 'RUNNING') return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)' }}>gerando</span>;
    return <span className="badge">{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Gerador de Leads</h2>
        <p>Gere números únicos de Moçambique com garantia anti-duplicata via banco de dados</p>
      </div>

      {/* ═══ MÉTRICAS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Total Gerado */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Números gerados</span>
            <div className="card-icon green"><Phone size={18} /></div>
          </div>
          <div className="card-value" style={{ fontSize: '28px' }}>
            {metrics.totalNumbers.toLocaleString('pt-BR')}
          </div>
          <div className="card-label">Total no banco</div>
        </div>

        {/* Sessões */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Gerações realizadas</span>
            <div className="card-icon blue"><FileSpreadsheet size={18} /></div>
          </div>
          <div className="card-value" style={{ fontSize: '28px' }}>
            {metrics.completedSessions}
          </div>
          <div className="card-label">Gerações concluídas</div>
        </div>

        {/* Prefixos */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Prefixos ativos</span>
            <div className="card-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}><Hash size={18} /></div>
          </div>
          <div className="card-value" style={{ fontSize: '28px' }}>
            {metrics.activePrefixes.length}
          </div>
          <div className="card-label" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
            {metrics.activePrefixes.length > 0 ? metrics.activePrefixes.join(' · ') : '—'}
          </div>
        </div>

        {/* Únicos */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <span className="card-title">Únicos garantidos</span>
            <div className="card-icon green"><Shield size={18} /></div>
          </div>
          <div className="card-value" style={{ fontSize: '28px', color: 'var(--accent)' }}>100%</div>
          <div className="card-label">Sem repetições</div>
        </div>
      </div>

      {/* ═══ POR PREFIXO + ÚLTIMAS GERAÇÕES ═══ */}
      <div className="card-grid" style={{ marginBottom: '24px' }}>
        {/* Breakdown por prefixo */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Hash size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Por prefixo</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {['84', '85', '86', '87'].map(prefix => {
              const data = metrics.byPrefix.find(p => p.prefix === prefix);
              const count = data?.count || 0;
              const pct = maxPrefixCount > 0 ? (count / maxPrefixCount) * 100 : 0;
              const color = prefixColors[prefix] || 'var(--accent)';
              return (
                <div key={prefix}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      +258 {prefix} xxxxxxx
                    </span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color }}>{count.toLocaleString('pt-BR')}</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '100px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '100px',
                      background: color, width: `${pct}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Últimas gerações */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Zap size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Últimas gerações</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                Nenhuma geração registrada
              </p>
            ) : (
              history.slice(0, 5).map(s => (
                <div key={s.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-default)',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {s.total_numbers.toLocaleString('pt-BR')} números · {s.total_parts} partes
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Prefixo {s.prefix} · {s.started_at ? new Date(s.started_at + 'Z').toLocaleString('pt-BR') : '—'}
                    </div>
                  </div>
                  {statusBadge(s.status)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══ FORMULÁRIO DO GERADOR ═══ */}
      <div className="card-grid" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Cpu size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Gerador de Leads
            </span>
            {generating && <div className="card-icon green"><Loader2 size={18} className="spin" /></div>}
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
            Configure o prefixo, quantidade e formato. Cada número é único e nunca se repete.
          </p>

          {/* Modo */}
          <div className="input-group">
            <label>Modo</label>
            <select className="input" value={modo} onChange={e => setModo(e.target.value)} disabled={generating}
              style={{ cursor: 'pointer', backgroundColor: 'var(--bg-input)' }}>
              <option value="total">Por total</option>
              <option value="partes">Por partes</option>
            </select>
          </div>

          {modo === 'total' ? (
            <>
              {/* Prefixo + Quantidade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label>Prefixo</label>
                  <select className="input input-mono" value={prefixo} onChange={e => setPrefixo(e.target.value)} disabled={generating}
                    style={{ cursor: 'pointer', backgroundColor: 'var(--bg-input)' }}>
                    <option value="84">+258 84</option>
                    <option value="85">+258 85</option>
                    <option value="86">+258 86</option>
                    <option value="87">+258 87</option>
                    <option value="ambos">86 + 87</option>
                    <option value="todos">Todos (84-87)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Quantidade de números</label>
                  <input type="number" className="input input-mono" value={quantidade}
                    onChange={e => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={generating} min={1} max={10000000} />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Modo por partes */}
              <div className="input-group">
                <label>Prefixo</label>
                <select className="input input-mono" value={prefixo} onChange={e => setPrefixo(e.target.value)} disabled={generating}
                  style={{ cursor: 'pointer', backgroundColor: 'var(--bg-input)' }}>
                  <option value="84">+258 84</option>
                  <option value="85">+258 85</option>
                  <option value="86">+258 86</option>
                  <option value="87">+258 87</option>
                  <option value="ambos">86 + 87</option>
                  <option value="todos">Todos (84-87)</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label>Partes (planilhas)</label>
                  <input type="number" className="input input-mono" value={partesInput}
                    onChange={e => setPartesInput(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={generating} min={1} max={500} />
                </div>
                <div className="input-group">
                  <label>Contatos por parte</label>
                  <input type="number" className="input input-mono" value={contatosPorParte}
                    onChange={e => setContatosPorParte(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={generating} min={1} max={50000} />
                </div>
              </div>
            </>
          )}

          {/* Total a gerar */}
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            background: 'rgba(37, 211, 102, 0.05)', border: '1px solid var(--border-default)',
            marginBottom: '16px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Total a gerar
            </div>
            <div className="mono" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {params.total.toLocaleString('pt-BR')}
            </div>
            {modo === 'total' && params.partes > 1 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Dividido em {params.partes} parte{params.partes > 1 ? 's' : ''} de {params.contatosPorParte.toLocaleString('pt-BR')} cada
              </div>
            )}
          </div>

          {/* Progresso */}
          {generating && (
            <div style={{
              padding: '14px', borderRadius: '10px',
              background: 'rgba(37, 211, 102, 0.05)', border: '1px solid var(--border-default)',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                {progress.message || 'Processando...'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                <span>Progresso</span>
                <span>{progress.current} / {progress.total} partes</span>
              </div>
              <div className="progress-bar-container" style={{ margin: 0 }}>
                <div className="progress-bar-fill" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
              </div>
              {getEta() && (
                <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '6px', fontWeight: 500 }}>
                  ⏱️ {getEta()}
                </div>
              )}
            </div>
          )}

          {/* Sucesso e Ações pós-geração */}
          {!generating && progress.sessionId && progress.message?.includes('sucesso') && (
            <div style={{
              padding: '16px', borderRadius: '10px',
              background: 'rgba(37, 211, 102, 0.08)', border: '1px solid var(--accent)',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                <CheckCircle2 size={18} />
                <span>Geração concluída com sucesso!</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
                Os números foram salvos permanentemente no banco anti-duplicata. Escolha o que fazer com os arquivos Excel:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={() => handleDownloadSessionZip(progress.sessionId)}
                  disabled={downloadingSessionId === progress.sessionId}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '13px' }}
                >
                  {downloadingSessionId === progress.sessionId ? (
                    <><Loader2 size={15} className="spin" /> Baixando...</>
                  ) : (
                    <><Download size={15} /> Baixar ZIP</>
                  )}
                </button>
                <button
                  onClick={() => handleMoveToFiles(progress.sessionId)}
                  disabled={movingSessionId === progress.sessionId}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '13px' }}
                >
                  {movingSessionId === progress.sessionId ? (
                    <><Loader2 size={15} className="spin" /> Movendo...</>
                  ) : (
                    <><Zap size={15} /> Mover para Envios</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Botão Gerar */}
          <button
            onClick={handleGenerate}
            disabled={generating || params.total === 0}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '15px' }}
          >
            {generating ? (
              <><Loader2 size={18} className="spin" /> Gerando Leads...</>
            ) : (
              <><Zap size={18} /> Gerar Leads</>
            )}
          </button>
        </div>

        {/* Painel lateral — Como funciona */}
        <div className="card" style={{ background: 'var(--bg-card)' }}>
          <div className="card-header">
            <span className="card-title">Como funciona</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            {[
              '✓ Números realistas de Moçambique (9 dígitos)',
              '✓ Validação contra sequências fakes',
              '✓ Nunca repete números antigos do banco',
              '✓ Cada parte vira um arquivo Excel (.xlsx)',
              '✓ Tudo compactado em um único ZIP',
              '✓ Disparo direto via WhaSender',
            ].map((text, i) => (
              <div key={i} style={{
                fontSize: '14px', color: 'var(--text-secondary)',
                padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.02)',
              }}>
                {text}
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '20px', padding: '14px', borderRadius: '10px',
            background: 'rgba(37, 211, 102, 0.05)', border: '1px solid var(--border-default)',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Cada parte: até 50.000 números. Várias partes para volumes maiores.
              Todos os números ficam salvos permanentemente no banco de dados para garantir <strong style={{ color: 'var(--accent)' }}>0% duplicatas</strong> entre todas as gerações.
            </p>
          </div>

          {/* Botão Download ZIP */}
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip || generating}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '16px' }}
          >
            {downloadingZip ? (
              <><Loader2 size={16} className="spin" /> Compactando...</>
            ) : (
              <><Archive size={16} /> Baixar Todos (ZIP)</>
            )}
          </button>
        </div>
      </div>

      {/* ═══ HISTÓRICO COMPLETO ═══ */}
      <div className="table-container">
        <div className="table-toolbar">
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} /> Histórico de Gerações
          </span>
          <span className="badge badge-info">{history.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Prefixo</th>
              <th>Total</th>
              <th>Partes</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Nenhuma geração registrada ainda
                </td>
              </tr>
            ) : (
              history.map(s => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontSize: '13px' }}>
                    {s.started_at ? new Date(s.started_at + 'Z').toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>{s.prefix}</td>
                  <td className="mono">{s.total_numbers.toLocaleString('pt-BR')}</td>
                  <td className="mono">{s.total_parts}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        onClick={() => handleDownloadSessionZip(s.id)}
                        disabled={s.status !== 'DONE' || downloadingSessionId === s.id}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '12px', height: 'auto', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        title="Baixar ZIP desta geração"
                      >
                        {downloadingSessionId === s.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Download size={13} />
                        )}
                        <span>ZIP</span>
                      </button>
                      <button
                        onClick={() => handleMoveToFiles(s.id)}
                        disabled={s.status !== 'DONE' || movingSessionId === s.id}
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '12px', height: 'auto', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(37, 211, 102, 0.12)', color: 'var(--accent)', border: '1px solid rgba(37, 211, 102, 0.2)' }}
                        title="Mover planilhas para a fila de envio"
                      >
                        {movingSessionId === s.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Zap size={13} />
                        )}
                        <span>Mover</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
