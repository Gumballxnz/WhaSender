import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Play, Loader2, Users, Clock, FileSpreadsheet, Info, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function Dispatch() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [maxCount, setMaxCount] = useState(104);
  const [startFrom, setStartFrom] = useState(1);
  const [batchSize, setBatchSize] = useState(0);
  const [batchPauseMins, setBatchPauseMins] = useState(10);
  const [maxPauses, setMaxPauses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [botStatus, setBotStatus] = useState('disconnected');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, sRes, botRes, fRes] = await Promise.all([
        api.get('/contacts'),
        api.get('/settings'),
        api.get('/bot/status'),
        api.get('/files')
      ]);

      const availableFiles = new Set(fRes.data.files.map(f => f.name.toLowerCase()));
      const activeContacts = cRes.data.filter(c => c.active);
      const dispatchableContacts = activeContacts.filter(c => availableFiles.has(c.file_name.toLowerCase()));

      setContacts(dispatchableContacts);
      setDelaySeconds(Math.round(parseInt(sRes.data.delay_ms || 30000) / 1000));

      setMaxCount(activeContacts.length > 0 ? activeContacts.length : 106);
      setBatchSize(parseInt(sRes.data.batch_size || 0));
      setBatchPauseMins(parseInt(sRes.data.batch_pause_minutes || 10));
      setMaxPauses(parseInt(sRes.data.max_pauses || 0));
      setBotStatus(botRes.data.status);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  const startDispatch = async () => {
    try {
      setDispatching(true);
      await api.post('/dispatch/start', {
        delay_ms: delaySeconds * 1000,
        max_count: maxCount,
        start_from: startFrom,
        batch_size: batchSize,
        batch_pause_minutes: batchPauseMins,
        max_pauses: maxPauses
      });
      toast.success('Disparo iniciado!');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar');
      setDispatching(false);
    }
  };

  const preview = contacts.slice(startFrom - 1, maxCount);

  let totalDelaySeconds = (preview.length > 0 ? preview.length - 1 : 0) * delaySeconds;
  let totalPauseSeconds = 0;
  let actualPauses = 0;
  if (batchSize > 0 && preview.length > batchSize) {
    actualPauses = Math.floor((preview.length - 1) / batchSize);
    if (maxPauses > 0 && actualPauses > maxPauses) actualPauses = maxPauses;
    totalPauseSeconds = actualPauses * batchPauseMins * 60;
  }
  const totalEstSeconds = totalDelaySeconds + totalPauseSeconds;
  const estH = Math.floor(totalEstSeconds / 3600);
  const estM = Math.floor((totalEstSeconds % 3600) / 60);

  let estStr = '0m';
  if (totalEstSeconds > 0) {
    if (estH > 0) estStr = `${estH}h ${estM}m`;
    else if (estM > 0) estStr = `${estM}m`;
    else estStr = '< 1m';
  }

  return (
    <div className="main-container">
      <div className="resend-header">
        <div>
          <h1 className="resend-title">Disparo Manual</h1>
          <p className="resend-subtitle">
            Configure parâmetros de cadência, lote anti-ban e inicie o envio
          </p>
        </div>
      </div>

      <div className="resend-grid-2">
        <div className="resend-card">
          <div className="resend-card-header">
            <span className="resend-card-title">Parâmetros de Disparo</span>
            <Send size={16} color="var(--accent)" />
          </div>

          <div className="input-group" style={{ marginBottom: '16px' }}>
            <label>Delay entre envios (segundos)</label>
            <input
              type="number"
              className="input input-mono"
              value={delaySeconds}
              onChange={e => setDelaySeconds(Math.max(5, parseInt(e.target.value) || 5))}
              min={5}
              max={120}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '16px' }}>
            <label>Quantidade máxima</label>
            <input
              type="number"
              className="input input-mono"
              value={maxCount}
              onChange={e => setMaxCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={contacts.length || 999}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '16px' }}>
            <label>Iniciar a partir do nº</label>
            <input
              type="number"
              className="input input-mono"
              value={startFrom}
              onChange={e => setStartFrom(Math.max(1, Math.min(contacts.length, parseInt(e.target.value) || 1)))}
              min={1}
              max={contacts.length || 1}
            />
          </div>

          <div className="input-group" style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px', marginBottom: '16px' }}>
            <label>Pausar após X envios (0 = desativado)</label>
            <input
              type="number"
              className="input input-mono"
              value={batchSize}
              onChange={e => setBatchSize(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
          </div>

          {batchSize > 0 && (
            <>
              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label>Tempo de Pausa (minutos)</label>
                <input
                  type="number"
                  className="input input-mono"
                  value={batchPauseMins}
                  onChange={e => setBatchPauseMins(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                />
              </div>

              <div className="input-group">
                <label>Limite Máximo de Pausas (0 = infinito)</label>
                <input
                  type="number"
                  className="input input-mono"
                  value={maxPauses}
                  onChange={e => setMaxPauses(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={13} color="var(--accent)" />
                  <span>Com {preview.length} contatos a enviar, o bot fará <strong>{actualPauses} pausa{actualPauses !== 1 ? 's' : ''}</strong> reais.</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="resend-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="resend-card-header">
              <span className="resend-card-title">Resumo do Envio</span>
              <FileSpreadsheet size={16} color="var(--accent)" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(37, 211, 102, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={18} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 600, color: '#fff' }}>
                    {preview.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>contatos selecionados na fila</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={18} color="var(--warning)" />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 600, color: '#fff' }}>
                    ~{estStr}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    tempo estimado {actualPauses > 0 ? `(c/ ${actualPauses} pausa${actualPauses > 1 ? 's' : ''})` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: '20px', fontWeight: 600 }}
              onClick={startDispatch}
              disabled={dispatching || preview.length === 0 || botStatus !== 'connected'}
            >
              {dispatching ? (
                <><Loader2 size={18} className="spin" /> Iniciando...</>
              ) : (
                <><Play size={18} /> Iniciar Disparo</>
              )}
            </button>

            {botStatus !== 'connected' && (
              <div style={{ color: 'var(--error)', fontSize: '12px', textAlign: 'center', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <AlertTriangle size={14} />
                <span>O WhatsApp precisa estar conectado para disparar.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="resend-card" style={{ marginTop: '24px', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-default)', fontSize: '13px', fontWeight: 600, color: '#fff' }}>
          Fila de Destinatários ({preview.length})
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '10px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>#</th>
                <th style={{ padding: '10px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Nome</th>
                <th style={{ padding: '10px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Telefone</th>
                <th style={{ padding: '10px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((c, i) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                >
                  <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '12px 18px', color: 'var(--text-primary)' }}>
                    {c.name}
                  </td>
                  <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {c.phone}
                  </td>
                  <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    {c.file_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
