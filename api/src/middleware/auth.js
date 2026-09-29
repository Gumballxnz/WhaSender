const jwt = require('jsonwebtoken');
const db = require('../db');

function authMiddleware(req, res, next) {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const isPublic =
    req.path === '/api/auth/setup-status' ||
    req.path === '/api/auth/setup' ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/refresh' ||
    req.path === '/api/health' ||
    (req.method === 'GET' && req.path.startsWith('/api/organizations/invites/')) ||
    (req.method === 'POST' && /\/api\/organizations\/invites\/[^/]+\/accept/.test(req.path));

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (isPublic) return next();
    return res.status(401).json({ error: 'Não autorizado — token ausente' });
  }

  try {
    const payload = jwt.verify(token, db.getJwtSecret());
    req.user = payload;
    next();
  } catch (err) {
    if (isPublic) return next();
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
