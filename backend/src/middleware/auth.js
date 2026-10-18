/* Middleware: authentication & authorization */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN, ADMIN_USER, ADMIN_JWT_SECRET, ADMIN_JWT_EXPIRES_IN } = require('../config');

// --- Team JWT in httpOnly cookie ---
function signTeamToken(participant) {
  return jwt.sign(
    { id: participant.id, email: participant.email, full_name: participant.full_name, team_id: participant.team_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setTeamCookie(res, token) {
  res.cookie('team_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    path: '/',
  });
}

function clearTeamCookie(res) {
  res.clearCookie('team_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

const db = require('../db');

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
    req.participantId = payload.id;
    req.participant = payload;
    req.team = { id: payload.team_id };

    if (!req.team.id && req.participantId && db.getAsync) {
      db.getAsync('SELECT team_id FROM participants WHERE id = $1', [req.participantId])
        .then(row => {
          if (row && row.team_id) req.team.id = row.team_id;
          next();
        })
        .catch(() => next());
      return;
    }

    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Admin JWT ---
function signAdminToken(username = 'admin') {
  return jwt.sign(
    { role: 'admin', user: username },
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
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Redirects unauthenticated browser requests for admin pages
function adminPageAuth(req, res, next) {
  let token = req.cookies?.admin_token;
  if (!token) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  }

  // If token is present in cookie/header, verify it
  if (token) {
    try {
      const payload = jwt.verify(token, ADMIN_JWT_SECRET);
      if (payload && payload.role === 'admin') {
        req.admin = payload;
        return next();
      }
    } catch (e) {
      // Token invalid
    }
  }

  // In iframe environments (AI Studio preview), cookies are often blocked by third-party cookie restrictions.
  // We allow the HTML page to load so client-side checkAdminAuth() can verify localStorage adminToken
  // via Authorization: Bearer header. If client is not authenticated, checkAdminAuth() redirects to /admin-login.
  next();
}

// Redirects unauthenticated browser requests for team pages
function teamPageAuth(req, res, next) {
  let token = req.cookies?.team_token;
  if (!token) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  }

  if (!token) {
    return res.redirect(302, '/login');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.team = payload;
    next();
  } catch (e) {
    return res.redirect(302, '/login');
  }
}

module.exports = {
  signTeamToken,
  setTeamCookie,
  clearTeamCookie,
  teamAuth,
  teamPageAuth,
  signAdminToken,
  adminAuth,
  adminPageAuth,
};

