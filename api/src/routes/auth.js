const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { issueAuthTokens } = require('../utils/token');
const { normalizeEmail, isValidEmail, generateUniqueSlug } = require('../utils/validators');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/setup-status', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    res.json({ needsSetup: userCount === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar status do sistema' });
  }
});

router.post('/setup', (req, res) => {
  const { name, username, email, password, organizationName } = req.body;

  if (!name || !username || !email || !password || !organizationName) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Formato de e-mail inválido' });
  }

  const cleanUsername = username.toLowerCase().trim();
  const cleanEmail = normalizeEmail(email);
  const cleanOrgName = organizationName.trim();
  const slug = generateUniqueSlug(db, cleanOrgName);

  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount > 0) {
      return res.status(403).json({ error: 'O sistema já foi configurado anteriormente' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const setupTransaction = db.transaction(() => {
      const userRes = db.prepare(`
        INSERT INTO users (username, email, password_hash, name)
        VALUES (?, ?, ?, ?)
      `).run(cleanUsername, cleanEmail, passwordHash, name.trim());

      const userId = userRes.lastInsertRowid;

      const orgRes = db.prepare(`
        INSERT INTO organizations (name, slug, owner_id)
        VALUES (?, ?, ?)
      `).run(cleanOrgName, slug, userId);

      const orgId = orgRes.lastInsertRowid;

      db.prepare(`
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (?, ?, 'owner')
      `).run(orgId, userId);

      return { userId, orgId };
    });

    const { userId, orgId } = setupTransaction();

    const createdUser = { id: userId, username: cleanUsername, email: cleanEmail, name: name.trim() };
    const { accessToken, expiresIn } = issueAuthTokens(res, createdUser, orgId, 'owner');

    res.json({
      accessToken,
      expiresIn,
      user: createdUser,
      organization: { id: orgId, name: cleanOrgName, slug, role: 'owner' },
    });
  } catch (err) {
    res.status(500).json({ error: `Erro no setup: ${err.message}` });
  }
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const cleanLogin = username.toLowerCase().trim();

  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
      return res.status(400).json({ error: 'Sistema não configurado. Complete o setup inicial.', needsSetup: true });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(cleanLogin, cleanLogin);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const organizations = db.prepare(`
      SELECT o.id, o.name, o.slug, om.role
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = ?
      ORDER BY om.id ASC
    `).all(user.id);

    const activeOrg = organizations[0] || { id: null, name: 'Padrão', slug: 'padrao', role: 'member' };
    const { accessToken, expiresIn } = issueAuthTokens(res, user, activeOrg.id, activeOrg.role);

    res.json({
      accessToken,
      expiresIn,
      user: { id: user.id, username: user.username, email: user.email, name: user.name },
      organization: activeOrg,
      organizations,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao autenticar usuário' });
  }
});

router.get('/me', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const user = db.prepare('SELECT id, username, email, name, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const organizations = db.prepare(`
      SELECT o.id, o.name, o.slug, om.role
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = ?
      ORDER BY om.id ASC
    `).all(user.id);

    const currentOrg = organizations.find((o) => o.id === req.user.organizationId) || organizations[0] || null;

    res.json({
      user,
      organization: currentOrg,
      organizations,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar perfil do usuário' });
  }
});

router.put('/profile', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
  }

  const cleanName = name.trim();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Formato de e-mail inválido' });
  }
  const cleanEmail = normalizeEmail(email);

  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está sendo utilizado por outro usuário' });
    }

    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(cleanName, cleanEmail, req.user.id);

    const user = db.prepare('SELECT id, username, email, name, created_at FROM users WHERE id = ?').get(req.user.id);
    const { accessToken } = issueAuthTokens(res, user, req.user.organizationId, req.user.role);

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      accessToken,
      user,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar perfil', details: err.message });
  }
});

router.put('/password', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });
  }

  try {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar senha', details: err.message });
  }
});

router.post('/switch-org', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { organizationId } = req.body;
  if (!organizationId) {
    return res.status(400).json({ error: 'ID da organização é obrigatório' });
  }

  try {
    const membership = db.prepare(`
      SELECT o.id, o.name, o.slug, om.role
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = ? AND o.id = ?
    `).get(req.user.id, organizationId);

    if (!membership) {
      return res.status(403).json({ error: 'Você não faz parte desta organização' });
    }

    const user = db.prepare('SELECT id, username, email, name FROM users WHERE id = ?').get(req.user.id);

    const { accessToken, expiresIn } = issueAuthTokens(res, user, membership.id, membership.role);

    res.json({
      accessToken,
      expiresIn,
      organization: membership,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alternar organização' });
  }
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token ausente' });
  }

  try {
    const payload = jwt.verify(refreshToken, db.getJwtRefreshSecret());

    const user = db.prepare('SELECT id, username, email, name FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(401).json({ error: 'Usuário não existe mais' });
    }

    const membership = db.prepare(`
      SELECT o.id, o.name, o.slug, om.role
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = ? AND o.id = ?
    `).get(user.id, payload.organizationId);

    const activeRole = membership?.role || 'member';

    const tokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      organizationId: payload.organizationId,
      role: activeRole,
    };

    const accessToken = jwt.sign(tokenPayload, db.getJwtSecret(), { expiresIn: '15m' });

    res.json({ accessToken, expiresIn: 900, organization: membership });
  } catch (err) {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return res.status(403).json({ error: 'Refresh token inválido ou expirado' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = router;
