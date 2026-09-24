const jwt = require('jsonwebtoken');

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh'
];

function authMiddleware(req, res, next) {

  if (PUBLIC_ROUTES.some(route => req.path === route)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado — token ausente' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
