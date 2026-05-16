/**
 * WhaSender — Rotas de Autenticação
 * Login, refresh token e logout
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Rate limiting: máximo 5 tentativas por minuto no login
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Autenticar operador e retornar tokens
 */
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  // Verificar credenciais contra variáveis de ambiente
  if (username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const passwordValid = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Gerar access token (15 minutos)
  const accessToken = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Gerar refresh token (7 dias)
  const refreshToken = jwt.sign(
    { username, role: 'admin', type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Enviar refresh token como cookie HttpOnly
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/api/auth',
  });

  res.json({
    accessToken,
    expiresIn: 900, // 15 minutos em segundos
  });
});

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token do cookie
 */
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token ausente' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Gerar novo access token
    const accessToken = jwt.sign(
      { username: payload.username, role: payload.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken, expiresIn: 900 });
  } catch (err) {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return res.status(403).json({ error: 'Refresh token inválido ou expirado' });
  }
});

/**
 * POST /api/auth/logout
 * Limpar cookie de refresh token
 */
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = router;
