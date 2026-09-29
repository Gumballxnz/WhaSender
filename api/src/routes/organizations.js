const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

function getOrgContext(req, res) {
  if (!req.user || !req.user.organizationId) {
    res.status(400).json({ error: 'Nenhuma organização ativa selecionada' });
    return null;
  }
  const membership = db.prepare(`
    SELECT om.role, o.id, o.name, o.slug, o.owner_id
    FROM organization_members om
    JOIN organizations o ON om.organization_id = o.id
    WHERE om.user_id = ? AND om.organization_id = ?
  `).get(req.user.id, req.user.organizationId);

  if (!membership) {
    res.status(403).json({ error: 'Acesso negado à organização' });
    return null;
  }
  return membership;
}

router.get('/current', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  const count = db.prepare('SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ?').get(ctx.id).count;
  res.json({
    id: ctx.id,
    name: ctx.name,
    slug: ctx.slug,
    role: ctx.role,
    isOwner: ctx.role === 'owner',
    membersCount: count,
  });
});

router.get('/members', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  const members = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, om.role, om.joined_at
    FROM users u
    JOIN organization_members om ON u.id = om.user_id
    WHERE om.organization_id = ?
    ORDER BY 
      CASE om.role 
        WHEN 'owner' THEN 1 
        WHEN 'admin' THEN 2 
        ELSE 3 
      END,
      om.joined_at ASC
  `).all(ctx.id);

  res.json({ members });
});

router.post('/members/:id/role', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas proprietários e administradores podem alterar funções' });
  }

  const targetUserId = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Função inválida. Escolha admin ou member.' });
  }

  const targetMember = db.prepare(`
    SELECT om.role, om.user_id
    FROM organization_members om
    WHERE om.organization_id = ? AND om.user_id = ?
  `).get(ctx.id, targetUserId);

  if (!targetMember) {
    return res.status(404).json({ error: 'Membro não encontrado nesta organização' });
  }

  if (targetMember.role === 'owner') {
    return res.status(403).json({ error: 'Não é possível alterar a função do proprietário da organização' });
  }

  if (ctx.role === 'admin' && targetMember.role === 'admin') {
    return res.status(403).json({ error: 'Administradores não podem alterar outros administradores' });
  }

  db.prepare(`
    UPDATE organization_members
    SET role = ?
    WHERE organization_id = ? AND user_id = ?
  `).run(role, ctx.id, targetUserId);

  res.json({ success: true, message: 'Função atualizada com sucesso' });
});

router.delete('/members/:id', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas proprietários e administradores podem remover membros' });
  }

  const targetUserId = parseInt(req.params.id, 10);

  const targetMember = db.prepare(`
    SELECT om.role
    FROM organization_members om
    WHERE om.organization_id = ? AND om.user_id = ?
  `).get(ctx.id, targetUserId);

  if (!targetMember) {
    return res.status(404).json({ error: 'Membro não encontrado nesta organização' });
  }

  if (targetMember.role === 'owner') {
    return res.status(403).json({ error: 'Não é possível remover o proprietário da organização' });
  }

  if (ctx.role === 'admin' && targetMember.role === 'admin') {
    return res.status(403).json({ error: 'Administradores não podem remover outros administradores' });
  }

  db.prepare('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?').run(ctx.id, targetUserId);

  res.json({ success: true, message: 'Membro removido da organização' });
});

router.get('/invites', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem ver convites pendentes' });
  }

  const invites = db.prepare(`
    SELECT oi.id, oi.code, oi.role, oi.created_at, oi.expires_at, u.name as created_by_name
    FROM organization_invites oi
    JOIN users u ON oi.created_by = u.id
    WHERE oi.organization_id = ? AND (oi.expires_at IS NULL OR oi.expires_at > datetime('now'))
    ORDER BY oi.id DESC
  `).all(ctx.id);

  res.json({ invites });
});

router.post('/invites', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerar convites' });
  }

  const role = req.body.role === 'admin' ? 'admin' : 'member';
  const days = parseInt(req.body.expiresInDays, 10) || 7;
  const code = crypto.randomBytes(16).toString('hex');

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    INSERT INTO organization_invites (organization_id, code, role, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ctx.id, code, role, req.user.id, expiresAt);

  res.json({
    code,
    role,
    expiresAt,
  });
});

router.delete('/invites/:id', (req, res) => {
  const ctx = getOrgContext(req, res);
  if (!ctx) return;

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem revogar convites' });
  }

  db.prepare('DELETE FROM organization_invites WHERE id = ? AND organization_id = ?').run(req.params.id, ctx.id);
  res.json({ success: true, message: 'Convite revogado' });
});

router.get('/invites/:code', (req, res) => {
  const { code } = req.params;

  const invite = db.prepare(`
    SELECT oi.code, oi.role, oi.expires_at, o.name as organization_name, o.id as organization_id
    FROM organization_invites oi
    JOIN organizations o ON oi.organization_id = o.id
    WHERE oi.code = ? AND (oi.expires_at IS NULL OR oi.expires_at > datetime('now'))
  `).get(code);

  if (!invite) {
    return res.status(404).json({ error: 'Convite inválido ou expirado' });
  }

  res.json({
    valid: true,
    organizationName: invite.organization_name,
    role: invite.role,
    expiresAt: invite.expires_at,
  });
});

router.post('/invites/:code/accept', (req, res) => {
  const { code } = req.params;

  const invite = db.prepare(`
    SELECT oi.id as invite_id, oi.organization_id, oi.role, oi.expires_at, o.name as organization_name, o.slug as organization_slug
    FROM organization_invites oi
    JOIN organizations o ON oi.organization_id = o.id
    WHERE oi.code = ? AND (oi.expires_at IS NULL OR oi.expires_at > datetime('now'))
  `).get(code);

  if (!invite) {
    return res.status(404).json({ error: 'Convite inválido ou expirado' });
  }

  if (req.user && req.user.id) {
    const existing = db.prepare(`
      SELECT id FROM organization_members
      WHERE organization_id = ? AND user_id = ?
    `).get(invite.organization_id, req.user.id);

    if (existing) {
      return res.status(400).json({ error: 'Você já faz parte desta organização' });
    }

    db.prepare(`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(invite.organization_id, req.user.id, invite.role);

    return res.json({
      success: true,
      message: `Você entrou na organização ${invite.organization_name}`,
      organizationId: invite.organization_id,
    });
  }

  const { name, username, email, password } = req.body;
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos de cadastro são obrigatórios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
  }

  const cleanUsername = username.toLowerCase().trim();
  const cleanEmail = email.toLowerCase().trim();

  const userConflict = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(cleanUsername, cleanEmail);
  if (userConflict) {
    return res.status(400).json({ error: 'Usuário ou e-mail já cadastrado. Faça login para aceitar o convite.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const registrationTx = db.transaction(() => {
    const userRes = db.prepare(`
      INSERT INTO users (username, email, password_hash, name)
      VALUES (?, ?, ?, ?)
    `).run(cleanUsername, cleanEmail, passwordHash, name.trim());

    const newUserId = userRes.lastInsertRowid;

    db.prepare(`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(invite.organization_id, newUserId, invite.role);

    return newUserId;
  });

  const newUserId = registrationTx();

  const tokenPayload = {
    id: newUserId,
    username: cleanUsername,
    email: cleanEmail,
    name: name.trim(),
    organizationId: invite.organization_id,
    role: invite.role,
  };

  const accessToken = jwt.sign(tokenPayload, db.getJwtSecret(), { expiresIn: '15m' });
  const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, db.getJwtRefreshSecret(), { expiresIn: '7d' });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });

  res.json({
    accessToken,
    expiresIn: 900,
    user: { id: newUserId, username: cleanUsername, email: cleanEmail, name: name.trim() },
    organization: { id: invite.organization_id, name: invite.organization_name, slug: invite.organization_slug, role: invite.role },
  });
});

module.exports = router;
