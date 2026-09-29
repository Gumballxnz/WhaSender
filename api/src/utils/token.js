const jwt = require('jsonwebtoken');
const db = require('../db');

function issueAuthTokens(res, user, organizationId, role) {
  const tokenPayload = {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    organizationId,
    role: role || 'member',
  };

  const accessToken = jwt.sign(tokenPayload, db.getJwtSecret(), { expiresIn: '15m' });
  const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, db.getJwtRefreshSecret(), { expiresIn: '7d' });

  if (res && typeof res.cookie === 'function') {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
  }

  return { accessToken, expiresIn: 900 };
}

module.exports = { issueAuthTokens };
