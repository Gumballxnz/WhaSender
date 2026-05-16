/**
 * WhaSender — Página de Disparo Manual
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Play, Loader2, Users, Clock, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

function Dispatch() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [maxCount, setMaxCount] = useState(104);
  const [startFrom, setStartFrom] = useState(1);
  const [batchSize, setBatchSize] = useState(0); // 0 = sem lote
  const [batchPauseMins, setBatchPauseMins] = useState(10);
  const [maxPauses, setMaxPauses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [botStatus, setBotStatus] = useState('disconnected');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, sRes, botRes] = await Promise.all([api.get('/contacts'), api.get('/settings'), api.get('/bot/status')]);
      setContacts(cRes.data.filter(c => c.active));
      setDelaySeconds(Math.round(parseInt(sRes.data.delay_ms || 30000) / 1000));
      setMaxCount(parseInt(sRes.data.max_per_dispatch || 104));
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
  const estStr = estH > 0 ? `${estH}h ${estM}m` : `${estM}m`;

  return (
    <div>
      <div className="page-header"><h2>Disparo Manual</h2><p>Configurar e iniciar envio</p></div>
      <div className="card-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">Configurações</span><div className="card-icon green"><Send size={20} /></div></div>
          <div className="input-group"><label>Delay entre envios (segundos)</label><input type="number" className="input input-mono" value={delaySeconds} onChange={e => setDelaySeconds(Math.max(5, parseInt(e.target.value) || 5))} min={5} max={120} /></div>
          <div className="input-group"><label>Quantidade máxima</label><input type="number" className="input input-mono" value={maxCount} onChange={e => setMaxCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={contacts.length || 999} /></div>
          <div className="input-group"><label>Iniciar a partir do nº</label><input type="number" className="input input-mono" value={startFrom} onChange={e => setStartFrom(Math.max(1, Math.min(contacts.length, parseInt(e.target.value) || 1)))} min={1} max={contacts.length || 1} /></div>
          <div className="input-group" style={{ borderTop: '1px solid var(--border-default)', paddingTop: '12px' }}><label>Pausar após X envios (0 = desativado)</label><input type="number" className="input input-mono" value={batchSize} onChange={e => setBatchSize(Math.max(0, parseInt(e.target.value) || 0))} min={0} /></div>
          {batchSize > 0 && (
            <>
              <div className="input-group"><label>Tempo de Pausa (minutos)</label><input type="number" className="input input-mono" value={batchPauseMins} onChange={e => setBatchPauseMins(Math.max(1, parseInt(e.target.value) || 1))} min={1} /></div>
              <div className="input-group">
                <label>Limite Máximo de Pausas (0 = infinito)</label>
                <input type="number" className="input input-mono" value={maxPauses} onChange={e => setMaxPauses(Math.max(0, parseInt(e.target.value) || 0))} min={0} />
                <div style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px'}}>
                  💡 Com {preview.length} contatos a enviar, o bot fará <strong>{actualPauses} pausa{actualPauses !== 1 ? 's' : ''}</strong> reais.
                </div>
              </div>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Resumo</span><div className="card-icon blue"><FileSpreadsheet size={20} /></div></div>
          <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}><Users size={18} color="var(--accent)" /><div><div className="mono" style={{fontSize:'18px',fontWeight:600}}>{preview.length}</div><div className="card-label">contatos a enviar</div></div></div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <Clock size={18} color="var(--warning)" />
              <div>
                <div className="mono" style={{fontSize:'18px',fontWeight:600}}>~{estStr}</div>
                <div className="card-label">estimado {actualPauses > 0 ? `(c/ ${actualPauses} pausa${actualPauses > 1 ? 's' : ''})` : ''}</div>
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" style={{width:'100%',justifyContent:'center',marginTop:'20px'}} onClick={startDispatch} disabled={dispatching || preview.length === 0 || botStatus !== 'connected'}>
            {dispatching ? <><Loader2 size={20} style={{animation:'spin 1s linear infinite'}} /> Disparando...</> : <><Play size={20} /> Iniciar Disparo</>}
          </button>
          {botStatus !== 'connected' && (
            <div style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', marginTop: '10px' }}>
              ⚠️ O WhatsApp precisa estar conectado para iniciar disparos.
            </div>
          )}
        </div>
      </div>
      <div className="table-container" style={{marginTop:'20px'}}><div className="table-toolbar"><span style={{fontWeight:600}}>Fila ({preview.length})</span></div>
        <table><thead><tr><th>#</th><th>Nome</th><th>Telefone</th><th>Arquivo</th></tr></thead><tbody>
          {preview.map((c, i) => (<tr key={c.id}><td className="mono" style={{color:'var(--text-muted)'}}>{i+1}</td><td>{c.name}</td><td className="mono">{c.phone}</td><td className="mono" style={{color:'var(--accent)'}}>{c.file_name}</td></tr>))}
        </tbody></table>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
export default Dispatch;
