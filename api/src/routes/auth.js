const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  if (username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const passwordValid = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const accessToken = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { username, role: 'admin', type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

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
  });
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token ausente' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

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

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = router;
