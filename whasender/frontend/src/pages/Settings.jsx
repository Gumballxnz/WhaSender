/**
 * WhaSender — Página de Configurações
 */
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Clock, Zap, Shield, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

function Settings() {
  const [settings, setSettings] = useState({ delay_ms: '30000', schedule_time: '15:00', schedule_enabled: 'false', max_per_dispatch: '104' });
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try { const { data } = await api.get('/settings'); setSettings(data); }
    catch { toast.error('Erro ao carregar configurações'); }
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast.success('Configurações salvas!');
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const delaySeconds = Math.round(parseInt(settings.delay_ms || 30000) / 1000);
  const scheduleEnabled = settings.schedule_enabled === 'true';

  return (
    <div>
      <div className="page-header"><h2>Configurações</h2><p>Ajustar parâmetros do sistema</p></div>
      <div className="card-grid">
        {/* Agendamento */}
        <div className="card">
          <div className="card-header"><span className="card-title">Agendamento Automático</span><div className="card-icon yellow"><Clock size={20} /></div></div>
          <div className="toggle-container" style={{ marginBottom: '16px' }}>
            <div className={`toggle ${scheduleEnabled ? 'active' : ''}`} onClick={() => setSettings({ ...settings, schedule_enabled: scheduleEnabled ? 'false' : 'true' })} />
            <span style={{ fontSize: '14px' }}>{scheduleEnabled ? 'Ativado' : 'Desativado'}</span>
          </div>
          {scheduleEnabled && (
            <div className="input-group">
              <label>Horário (Moçambique CAT UTC+2)</label>
              <input type="time" className="input input-mono" value={settings.schedule_time || '15:00'} onChange={e => setSettings({ ...settings, schedule_time: e.target.value })} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>O envio ocorrerá diariamente às {settings.schedule_time} (Horário de Moçambique)</span>
            </div>
          )}
        </div>

        {/* Parâmetros de envio */}
        <div className="card">
          <div className="card-header"><span className="card-title">Parâmetros de Envio</span><div className="card-icon green"><Zap size={20} /></div></div>
          <div className="input-group">
            <label>Delay entre envios: <strong className="mono">{delaySeconds}s</strong></label>
            <input type="range" min={5} max={120} value={delaySeconds}
              onChange={e => setSettings({ ...settings, delay_ms: String(e.target.value * 1000) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}><span>5s</span><span>120s</span></div>
          </div>
          <div className="input-group">
            <label>Quantidade máxima por disparo</label>
            <input type="number" className="input input-mono" value={settings.max_per_dispatch || 104}
              onChange={e => setSettings({ ...settings, max_per_dispatch: e.target.value })} min={1} max={999} />
          </div>
        </div>

        {/* Status do Bot */}
        <div className="card">
          <div className="card-header"><span className="card-title">Bot WhatsApp</span><div className="card-icon blue"><SettingsIcon size={20} /></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={async () => { try { const { data } = await api.get('/bot/status'); toast.success(`Status: ${data.status}`); } catch { toast.error('Erro'); } }}>
              Verificar Conexão
            </button>
          </div>
        </div>

        {/* Segurança placeholder */}
        <div className="card">
          <div className="card-header"><span className="card-title">Segurança</span><div className="card-icon red"><Shield size={20} /></div></div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Token JWT em memória, refresh via cookie HttpOnly</p>
          <span className="badge badge-success">Proteção ativa</span>
        </div>
      </div>

      {/* Botão salvar */}
      <div style={{ marginTop: '20px' }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : <><Save size={18} /> Salvar Configurações</>}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
export default Settings;
