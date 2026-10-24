import { useState, useEffect, useMemo } from 'react';
import {
  Users, UserPlus, Shield, Trash2, Copy, Check,
  Clock, X, Loader2, Building2, Crown, Search, Mail, Send,
  Link as LinkIcon, CheckCircle2
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

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const [emailConfig, setEmailConfig] = useState({ email_provider: 'disabled' });
  const [deliveryMethod, setDeliveryMethod] = useState('email');

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteDays, setInviteDays] = useState(7);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [emailDispatched, setEmailDispatched] = useState(false);
  const [copied, setCopied] = useState(false);

  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [confirmRevokeInvite, setConfirmRevokeInvite] = useState(null);
  const [revokingInvite, setRevokingInvite] = useState(false);

  const isOwnerOrAdmin = currentOrganization?.role === 'owner' || currentOrganization?.role === 'admin';
  const isOwner = currentOrganization?.role === 'owner';
  const hasEmailProvider = emailConfig?.email_provider && emailConfig.email_provider !== 'disabled';
  const providerLabel = emailConfig?.email_provider === 'resend' ? 'Resend' : 'SMTP';

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

  const loadEmailConfig = async () => {
    try {
      const { data } = await api.get('/settings/email');
      setEmailConfig(data || { email_provider: 'disabled' });
      if (data?.email_provider && data.email_provider !== 'disabled') {
        setDeliveryMethod('email');
      } else {
        setDeliveryMethod('link');
      }
    } catch {
      setEmailConfig({ email_provider: 'disabled' });
      setDeliveryMethod('link');
    }
  };

  useEffect(() => {
    loadMembers();
    loadInvites();
    loadEmailConfig();
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
    if (!inviteEmail.trim()) {
      toast.error('Informe o e-mail do colaborador');
      return;
    }

    setGeneratingInvite(true);
    try {
      const shouldSend = hasEmailProvider && deliveryMethod === 'email';
      const { data } = await api.post('/organizations/invites', {
        email: inviteEmail.trim(),
        role: inviteRole,
        expiresInDays: inviteDays,
        sendEmail: shouldSend,
      });

      const url = `${window.location.origin}/invite?code=${data.code}`;
      setGeneratedLink(url);
      setEmailDispatched(Boolean(data.emailSent));

      if (data.emailSent) {
        toast.success(`Convite com link de ativação enviado para ${inviteEmail.trim()} via ${providerLabel}!`);
      } else if (data.emailError) {
        toast.error(`Falha no envio do e-mail: ${data.emailError}. Você pode copiar o link direto.`);
      } else {
        toast.success('Link de convite gerado com sucesso!');
      }
      loadInvites();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar convite');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId) => {
    setRevokingInvite(true);
    try {
      await api.delete(`/organizations/invites/${inviteId}`);
      toast.success('Convite revogado com sucesso');
      setConfirmRevokeInvite(null);
      loadInvites();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao revogar convite');
    } finally {
      setRevokingInvite(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Link copiado para a área de transferência');
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = (m.name || '').toLowerCase().includes(query);
        const emailMatch = (m.email || '').toLowerCase().includes(query);
        const userMatch = (m.username || '').toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !userMatch) return false;
      }
      return true;
    });
  }, [members, roleFilter, searchTerm]);

  return (
    <div className="main-container">
      {/* Resend Header */}
      <div className="resend-header">
        <div>
          <h1 className="resend-title">Equipe</h1>
          <p className="resend-subtitle">
            Gerenciamento de membros, níveis de acesso e convites da organização
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setGeneratedLink('');
              setEmailDispatched(false);
              setShowInviteModal(true);
            }}
            style={{ padding: '8px 16px', fontWeight: 600 }}
          >
            <UserPlus size={14} />
            <span>Convidar Membro</span>
          </button>
        )}
      </div>

      {/* Resend Toolbar */}
      <div className="resend-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="resend-search-box">
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              className="resend-search-input"
              placeholder="Buscar colaborador por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="resend-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">Todas as Funções</option>
            <option value="owner">Proprietário</option>
            <option value="admin">Administrador</option>
            <option value="member">Membro</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredMembers.length} {filteredMembers.length === 1 ? 'membro ativo' : 'membros ativos'}
        </div>
      </div>

      {/* Tabela de Membros */}
      <div className="resend-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '32px' }}>
        {loadingMembers ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton" style={{ height: '44px', marginBottom: '10px' }} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Colaborador</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>E-mail</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Função</th>
                  <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Ingressou</th>
                  {isOwnerOrAdmin && (
                    <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px', textAlign: 'right' }}>Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const isSelf = m.id === user?.id;
                  const isMemberOwner = m.role === 'owner';
                  const canModify = isOwner && !isMemberOwner && !isSelf;

                  return (
                    <tr
                      key={m.id}
                      style={{ borderBottom: '1px solid var(--border-default)', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isMemberOwner ? 'rgba(37, 211, 102, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '12px',
                            color: isMemberOwner ? 'var(--accent)' : 'var(--text-primary)'
                          }}>
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {m.name}
                              {isMemberOwner && <Crown size={13} color="var(--accent)" />}
                              {isSelf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(você)</span>}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{m.username}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {m.email}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {canModify ? (
                          <select
                            className="resend-select"
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            <option value="admin">Administrador</option>
                            <option value="member">Membro</option>
                          </select>
                        ) : (
                          <span className={`badge ${m.role === 'owner' ? 'badge-success' : m.role === 'admin' ? 'badge-info' : ''}`} style={{ fontSize: '11px' }}>
                            {m.role === 'owner' ? 'Proprietário' : m.role === 'admin' ? 'Administrador' : 'Membro'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {m.joined_at?.substring(0, 10)}
                      </td>
                      {isOwnerOrAdmin && (
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          {!isMemberOwner && !isSelf && (isOwner || (currentOrganization?.role === 'admin' && m.role === 'member')) && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setConfirmRemoveMember(m)}
                              style={{ color: 'var(--error)', padding: '4px 8px' }}
                              title="Remover membro"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convites Pendentes */}
      {isOwnerOrAdmin && (
        <div>
          <div className="resend-header" style={{ marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>Convites Pendentes</h2>
              <p className="resend-subtitle">
                Links e e-mails enviados aguardando confirmação de cadastro
              </p>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {invites.length} {invites.length === 1 ? 'convite ativo' : 'convites ativos'}
            </span>
          </div>

          <div className="resend-card" style={{ padding: 0, overflow: 'hidden' }}>
            {loadingInvites ? (
              <div style={{ padding: '24px' }}>
                {[1, 2].map((n) => (
                  <div key={n} className="skeleton" style={{ height: '40px', marginBottom: '8px' }} />
                ))}
              </div>
            ) : invites.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Nenhum convite pendente. Clique em "Convidar Membro" para enviar um novo convite.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Destinatário</th>
                      <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Função Concedida</th>
                      <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Criado Por</th>
                      <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px' }}>Expira Em</th>
                      <th style={{ padding: '12px 18px', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.6px', textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => {
                      const inviteUrl = `${window.location.origin}/invite?code=${inv.code}`;
                      return (
                        <tr
                          key={inv.id}
                          style={{ borderBottom: '1px solid var(--border-default)', transition: 'background var(--transition-fast)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {inv.target_email || 'Qualquer e-mail'}
                          </td>
                          <td style={{ padding: '14px 18px' }}>
                            <span className="badge" style={{ fontSize: '11px' }}>
                              {inv.role === 'admin' ? 'Administrador' : 'Membro'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                            {inv.created_by_name}
                          </td>
                          <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                            {inv.expires_at ? inv.expires_at.substring(0, 10) : 'Nunca'}
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => copyToClipboard(inviteUrl)}
                              style={{ marginRight: '8px' }}
                              title="Copiar link do convite"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setConfirmRevokeInvite(inv)}
                              style={{ color: 'var(--error)' }}
                              title="Revogar convite"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Convidar Membro */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={18} color="var(--accent)" /> Convidar Colaborador
              </h3>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                <X size={18} />
              </button>
            </div>

            {generatedLink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  padding: '14px',
                  background: emailDispatched ? 'rgba(37, 211, 102, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${emailDispatched ? 'rgba(37, 211, 102, 0.25)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5
                }}>
                  {emailDispatched ? (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <CheckCircle2 size={16} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        Convite com link de ativação enviado para <strong>{inviteEmail}</strong> via <strong>{providerLabel}</strong>!
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          O colaborador poderá definir a senha e acessar a equipe diretamente pelo e-mail recebido.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span>
                      Link de ativação gerado para <strong>{inviteEmail}</strong>. Envie este link para o colaborador definir a senha e ingressar:
                    </span>
                  )}
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
                    type="button"
                    className="btn btn-primary"
                    onClick={() => copyToClipboard(generatedLink)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowInviteModal(false);
                      setGeneratedLink('');
                    }}
                  >
                    Concluir
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="input-group">
                  <label>E-mail do Colaborador</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="colaborador@empresa.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {hasEmailProvider ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600 }}>Forma de Envio</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button
                        type="button"
                        className={`btn ${deliveryMethod === 'email' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDeliveryMethod('email')}
                        style={{ padding: '9px 12px', justifyContent: 'center', fontSize: '12px', gap: '6px' }}
                      >
                        <Mail size={14} />
                        <span>Enviar por E-mail</span>
                      </button>
                      <button
                        type="button"
                        className={`btn ${deliveryMethod === 'link' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDeliveryMethod('link')}
                        style={{ padding: '9px 12px', justifyContent: 'center', fontSize: '12px', gap: '6px' }}
                      >
                        <LinkIcon size={14} />
                        <span>Apenas Gerar Link</span>
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {deliveryMethod === 'email'
                        ? `O e-mail com link de ativação será disparado via ${providerLabel} diretamente para a caixa de entrada.`
                        : 'O link de ativação será gerado na tela para envio manual (WhatsApp, etc.).'}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <LinkIcon size={14} color="var(--accent)" />
                    <span>Provedor de e-mail desativado. O convite será gerado em link para envio manual.</span>
                  </div>
                )}

                <div className="input-group">
                  <label>Função no Time</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="member">Membro (Disparos, Validador e Arquivos)</option>
                    <option value="admin">Administrador (Gerencia equipe, convites e configs)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>Validade do Link</label>
                  <select
                    className="input"
                    value={inviteDays}
                    onChange={(e) => setInviteDays(Number(e.target.value))}
                  >
                    <option value={1}>1 Dia</option>
                    <option value={7}>7 Dias (Recomendado)</option>
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
                    disabled={generatingInvite || !inviteEmail.trim()}
                  >
                    {generatingInvite ? (
                      <><Loader2 size={14} className="spin" /> Gerando...</>
                    ) : hasEmailProvider && deliveryMethod === 'email' ? (
                      <><Send size={14} /> Enviar Convite por E-mail</>
                    ) : (
                      <><LinkIcon size={14} /> Gerar Link de Convite</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Confirmar Remoção */}
      {confirmRemoveMember && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--error)' }}>Remover Colaborador</h3>
              <button className="modal-close" onClick={() => setConfirmRemoveMember(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Tem certeza que deseja remover <strong>{confirmRemoveMember.name}</strong> da organização? O usuário perderá imediatamente o acesso aos dados deste ambiente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmRemoveMember(null)}
                disabled={removingMember}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                onClick={() => handleRemoveMember(confirmRemoveMember.id)}
                disabled={removingMember}
              >
                {removingMember ? 'Removendo...' : 'Sim, Remover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Revogação de Convite */}
      {confirmRevokeInvite && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--error)' }}>Revogar Convite</h3>
              <button className="modal-close" onClick={() => setConfirmRevokeInvite(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Tem certeza que deseja revogar o convite de <strong>{confirmRevokeInvite.target_email || confirmRevokeInvite.targetEmail || 'este colaborador'}</strong>? O link de acesso será cancelado imediatamente e não poderá mais ser usado.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmRevokeInvite(null)}
                disabled={revokingInvite}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                onClick={() => handleRevokeInvite(confirmRevokeInvite.id)}
                disabled={revokingInvite}
              >
                {revokingInvite ? <><Loader2 size={14} className="spin" /> Revogando...</> : 'Sim, Revogar Convite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
