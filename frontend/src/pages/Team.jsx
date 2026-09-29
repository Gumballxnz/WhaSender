import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, Trash2, Copy, Check,
  Clock, X, Loader2, Building2, Crown, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function Team() {
  const { currentOrganization, user } = useAuthStore();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteDays, setInviteDays] = useState(7);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [removingMember, setRemovingMember] = useState(false);

  const isOwnerOrAdmin = currentOrganization?.role === 'owner' || currentOrganization?.role === 'admin';
  const isOwner = currentOrganization?.role === 'owner';

  const loadMembers = async () => {
    try {
      const { data } = await api.get('/organizations/members');
      setMembers(data.members || []);
    } catch {
      toast.error('Erro ao carregar lista de membros');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadInvites = async () => {
    if (!isOwnerOrAdmin) {
      setLoadingInvites(false);
      return;
    }
    try {
      const { data } = await api.get('/organizations/invites');
      setInvites(data.invites || []);
    } catch {
      toast.error('Erro ao carregar convites pendentes');
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    loadMembers();
    loadInvites();
  }, [currentOrganization?.id]);

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await api.post(`/organizations/members/${memberId}/role`, { role: newRole });
      toast.success('Função atualizada com sucesso');
      loadMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar função');
    }
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingMember(true);
    try {
      await api.delete(`/organizations/members/${memberId}`);
      toast.success('Membro removido da organização');
      setConfirmRemoveMember(null);
      loadMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover membro');
    } finally {
      setRemovingMember(false);
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setGeneratingInvite(true);
    try {
      const { data } = await api.post('/organizations/invites', {
        role: inviteRole,
        expiresInDays: inviteDays,
      });
      const url = `${window.location.origin}/invite?code=${data.code}`;
      setGeneratedLink(url);
      toast.success('Convite gerado!');
      loadInvites();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar convite');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId) => {
    try {
      await api.delete(`/organizations/invites/${inviteId}`);
      toast.success('Convite revogado');
      loadInvites();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao revogar convite');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Link copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-container" style={{ padding: '28px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={26} color="var(--accent)" />
            Equipe & Membros
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Gerencie os colaboradores da organização <strong style={{ color: 'var(--text-primary)' }}>{currentOrganization?.name}</strong>
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setGeneratedLink('');
              setShowInviteModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <UserPlus size={18} />
            Convidar Membro
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(37, 211, 102, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} color="var(--accent)" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{currentOrganization?.name}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Identificador: {currentOrganization?.slug}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className={`badge-${currentOrganization?.role}`}>
            Sua Função: {currentOrganization?.role === 'owner' ? 'Proprietário' : currentOrganization?.role === 'admin' ? 'Administrador' : 'Membro'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {members.length} {members.length === 1 ? 'membro' : 'membros'}
          </span>
        </div>
      </div>

      <div className="table-container" style={{ marginBottom: '32px' }}>
        <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--accent)" /> Membros Ativos
          </span>
        </div>

        {loadingMembers ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton" style={{ height: '48px', marginBottom: '12px' }} />
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Colaborador</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>E-mail</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>Função</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ingressou em</th>
                {isOwnerOrAdmin && <th style={{ textAlign: 'right', padding: '12px 16px' }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.id === user?.id;
                const isMemberOwner = m.role === 'owner';
                const canModify = isOwner && !isMemberOwner && !isSelf;

                return (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: isMemberOwner ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-input)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: isMemberOwner ? 'var(--warning)' : 'var(--text-primary)'
                        }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {m.name}
                            {isMemberOwner && <Crown size={14} color="var(--warning)" />}
                            {isSelf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(você)</span>}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{m.username}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {m.email}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {canModify ? (
                        <select
                          className="input"
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          style={{ padding: '4px 8px', fontSize: '12px', width: 'auto', display: 'inline-block' }}
                        >
                          <option value="admin">Administrador</option>
                          <option value="member">Membro</option>
                        </select>
                      ) : (
                        <span className={`badge-${m.role}`}>
                          {m.role === 'owner' ? 'Proprietário' : m.role === 'admin' ? 'Administrador' : 'Membro'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {m.joined_at?.substring(0, 10)}
                    </td>
                    {isOwnerOrAdmin && (
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {!isMemberOwner && !isSelf && (isOwner || (currentOrganization?.role === 'admin' && m.role === 'member')) && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => setConfirmRemoveMember(m)}
                            style={{ padding: '6px 10px', color: 'var(--error)' }}
                            title="Remover membro"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isOwnerOrAdmin && (
        <div className="table-container">
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="var(--info)" /> Convites Pendentes
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {invites.length} links ativos
            </span>
          </div>

          {loadingInvites ? (
            <div style={{ padding: '24px' }}>
              {[1, 2].map((n) => (
                <div key={n} className="skeleton" style={{ height: '40px', marginBottom: '10px' }} />
              ))}
            </div>
          ) : invites.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhum convite pendente. Clique em "Convidar Membro" para criar um link de acesso.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Código do Convite</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px' }}>Função Concedida</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Criado Por</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Expira Em</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const inviteUrl = `${window.location.origin}/invite?code=${inv.code}`;
                  return (
                    <tr key={inv.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)' }}>
                        {inv.code}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span className={`badge-${inv.role}`}>
                          {inv.role === 'admin' ? 'Administrador' : 'Membro'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {inv.created_by_name}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {inv.expires_at || 'Nunca'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => copyToClipboard(inviteUrl)}
                          style={{ padding: '6px 10px', marginRight: '8px' }}
                          title="Copiar link do convite"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRevokeInvite(inv.id)}
                          style={{ padding: '6px 10px', color: 'var(--error)' }}
                          title="Revogar convite"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Convidar Novo Membro</h3>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                <X size={18} />
              </button>
            </div>

            {generatedLink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px', background: 'rgba(37, 211, 102, 0.1)', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  ✅ Convite criado com sucesso! Compartilhe o link abaixo com o novo membro:
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="input"
                    value={generatedLink}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => copyToClipboard(generatedLink)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
                  </button>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowInviteModal(false)}
                  style={{ alignSelf: 'flex-end', marginTop: '10px' }}
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="input-group">
                  <label>Função no Time</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="member">Membro (Disparos, Validador, Arquivos)</option>
                    <option value="admin">Administrador (Gerencia equipe, convites e configs)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>Validade do Convite</label>
                  <select
                    className="input"
                    value={inviteDays}
                    onChange={(e) => setInviteDays(Number(e.target.value))}
                  >
                    <option value={1}>1 Dia</option>
                    <option value={7}>7 Dias (Padrão)</option>
                    <option value={30}>30 Dias</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowInviteModal(false)}
                    disabled={generatingInvite}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={generatingInvite}
                  >
                    {generatingInvite ? <><Loader2 size={16} className="spin" /> Gerando...</> : 'Gerar Link de Convite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {confirmRemoveMember && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}>
                <AlertTriangle size={20} /> Confirmar Remoção
              </h3>
              <button className="modal-close" onClick={() => setConfirmRemoveMember(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Deseja realmente remover <strong>{confirmRemoveMember.name}</strong> da organização? O usuário perderá acesso imediato a todos os recursos deste time.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmRemoveMember(null)}
                disabled={removingMember}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleRemoveMember(confirmRemoveMember.id)}
                disabled={removingMember}
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
              >
                {removingMember ? <><Loader2 size={14} className="spin" /> Removendo...</> : 'Sim, Remover'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
