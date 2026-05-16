/**
 * WhaSender — Página de Contatos
 */
import { useState, useEffect } from 'react';
import { Users, Plus, Upload, Search, Trash2, Edit3, X, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, id: null });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', file_name: '' });
  const [importJson, setImportJson] = useState('');

  useEffect(() => { loadContacts(); }, []);

  async function loadContacts() {
    try { const { data } = await api.get('/contacts'); setContacts(data); }
    catch { toast.error('Erro ao carregar contatos'); }
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.file_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditingId(null); setForm({ name: '', phone: '', file_name: '' }); setShowModal(true); };
  const openEdit = (c) => { setEditingId(c.id); setForm({ name: c.name, phone: c.phone, file_name: c.file_name }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) { await api.put(`/contacts/${editingId}`, form); toast.success('Contato atualizado'); }
      else { await api.post('/contacts', form); toast.success('Contato criado'); }
      setShowModal(false); loadContacts();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar'); }
  };

  const confirmDelete = (id) => {
    setShowDeleteConfirm({ show: true, id });
  };

  const handleDelete = async () => {
    const { id } = showDeleteConfirm;
    setShowDeleteConfirm({ show: false, id: null });
    try { 
      await api.delete(`/contacts/${id}`); 
      toast.success('Removido'); 
      loadContacts(); 
    }
    catch { toast.error('Erro ao remover'); }
  };

  const handleToggle = async (c) => {
    try { await api.put(`/contacts/${c.id}`, { active: c.active ? 0 : 1 }); loadContacts(); }
    catch { toast.error('Erro ao alternar status'); }
  };

  const handleImport = async () => {
    try {
      const arr = JSON.parse(importJson);
      const { data } = await api.post('/contacts/import', arr);
      toast.success(data.message);
      setShowImport(false); setImportJson(''); loadContacts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'JSON inválido');
    }
  };

  return (
    <div>
      <div className="page-header"><h2>Contatos</h2><p>Gerenciar contatos e mapeamento de arquivos</p></div>
      <div className="table-container">
        <div className="table-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '320px' }}>
            <Search size={16} color="var(--text-muted)" />
            <input className="input" placeholder="Buscar por nome, telefone ou arquivo..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '6px 0' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}><Upload size={14} /> Importar</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={14} /> Novo</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Arquivo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Nenhum contato encontrado</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="mono">{c.phone}</td>
                <td className="mono" style={{ color: 'var(--accent)' }}>{c.file_name}</td>
                <td><span className={`badge ${c.active ? 'badge-success' : 'badge-error'}`}>{c.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(c)} title={c.active ? 'Desativar' : 'Ativar'}>
                      {c.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}><Edit3 size={14} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(c.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal criar/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingId ? 'Editar' : 'Novo'} Contato</h3><button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button></div>
            <form onSubmit={handleSave}>
              <div className="input-group"><label>Nome</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="Ex: Ola 1" /></div>
              <div className="input-group"><label>Telefone</label><input className="input input-mono" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required placeholder="258841234567" /></div>
              <div className="input-group"><label>Arquivo</label><input className="input input-mono" value={form.file_name} onChange={e => setForm({...form, file_name: e.target.value})} required placeholder="parte_1.xlsx" /></div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Salvar</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Importar Contatos</h3><button className="modal-close" onClick={() => setShowImport(false)}><X size={16} /></button></div>
            <div className="input-group"><label>JSON Array</label>
              <textarea className="input input-mono" rows={8} value={importJson} onChange={e => setImportJson(e.target.value)} placeholder={'[\n  { "name": "Ola 1", "phone": "258841234567", "file_name": "parte_1.xlsx" }\n]'} style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleImport}>Importar</button>
          </div>
        </div>
      )}

      {/* Modal Deletar */}
      {showDeleteConfirm.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--text-primary)' }}>
              <AlertTriangle color="var(--error)" size={22} />
              Remover Contato
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5, fontSize: '14px' }}>
              Tem certeza que deseja remover este contato? Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn" 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} 
                onClick={() => setShowDeleteConfirm({ show: false, id: null })}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDelete}
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 24px; width: 100%; max-width: 400px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
export default Contacts;
