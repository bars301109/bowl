/* Middleware: authentication & authorization */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN, ADMIN_USER, ADMIN_JWT_SECRET, ADMIN_JWT_EXPIRES_IN } = require('../config');

// --- Team JWT in httpOnly cookie ---
function signTeamToken(team) {
  return jwt.sign(
    { id: team.id, team_name: team.team_name, login: team.login },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setTeamCookie(res, token) {
  res.cookie('team_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000, // 12h
    path: '/',
  });
}

function clearTeamCookie(res) {
  res.clearCookie('team_token', { path: '/' });
}

function teamAuth(req, res, next) {
  // Support both Bearer header and cookie
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.cookies?.team_token) {
    token = req.cookies.team_token;
  }

  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.team = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Admin JWT ---
function signAdminToken() {
  return jwt.sign(
    { role: 'admin', user: ADMIN_USER },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_JWT_EXPIRES_IN }
  );
}

function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.cookies?.admin_token) {
    token = req.cookies.admin_token;
  }

  if (!token) return res.status(401).json({ error: 'Missing admin token' });

  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    if (payload?.role !== 'admin' || payload?.user !== ADMIN_USER) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  signTeamToken,
  setTeamCookie,
  clearTeamCookie,
  teamAuth,
  signAdminToken,
  adminAuth,
};
