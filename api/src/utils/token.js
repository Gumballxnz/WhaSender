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

  const accessToken = jwt.sign(tokenPayload, db.getJwtSecret(), { expiresIn: '7d' });
  const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, db.getJwtRefreshSecret(), { expiresIn: '30d' });

  if (res && typeof res.cookie === 'function') {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  return { accessToken, expiresIn: 7 * 86400 };
}

module.exports = { issueAuthTokens };
