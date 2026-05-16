/**
 * WhaSender — Middleware de Autenticação JWT
 * Verifica token em todas as rotas protegidas
 */

const jwt = require('jsonwebtoken');

// Rotas que não precisam de autenticação
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh'
];

/**
 * Middleware que verifica o JWT no header Authorization
 */
function authMiddleware(req, res, next) {
  // Verificar se a rota é pública
  if (PUBLIC_ROUTES.some(route => req.path === route)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado — token ausente' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
