/*
 * Akylman Quiz Bowl — Refactored Server
 * Modular architecture with PostgreSQL only
 */
// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { ensureSchema } = require('./services/schema');
const securityHeaders = require('./middleware/security');

// Routes
const authRoutes = require('./routes/public/auth');
const publicRoutes = require('./routes/public/tests');
const teamRoutes = require('./routes/public/team');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'src');

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(securityHeaders);

// --- API Routes ---
app.use(authRoutes);       // /api/register, /api/login, /api/password-reset/*
app.use(publicRoutes);     // /api/tests, /api/categories, /api/settings, /api/homepage-blocks
app.use(teamRoutes);       // /api/me, /api/me/results, /api/me/change-password
app.use(adminRoutes);      // /api/admin/login, /api/admin/*

// Health check
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- Static file serving ---
// Clean URLs for pages
const pageRoutes = ['register', 'login', 'team', 'profile'];
pageRoutes.forEach((page) => {
  app.get(`/${page}`, (req, res, next) => sendPage(res, page, next));
});

// Nested team pages: /team/<section>
app.get('/team/:section', (req, res, next) => sendPage(res, 'team', next));

// Admin pages at standard paths
app.get('/admin', (req, res, next) => sendPage(res, 'admin', next));
app.get('/admin-login', (req, res, next) => sendPage(res, 'admin-login', next));

// Legacy /pages/<name>
app.get('/pages/:page', (req, res, next) => sendPage(res, req.params.page, next));

// Static files (must be AFTER all API routes)
app.use('/', express.static(FRONTEND_DIR, {
  maxAge: 5000,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=5');
  },
}));

// Helper: serve page HTML
function sendPage(res, pageName, next) {
  if (!/^[a-z0-9-]+$/i.test(pageName)) return next();
  const pagesRoot = path.resolve(FRONTEND_DIR, 'pages');
  const filePath = path.resolve(pagesRoot, `${pageName}.html`);
  if (!filePath.startsWith(pagesRoot + path.sep)) return next();
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return next();
}

// --- Startup ---
async function initializeApp() {
  try {
    // Test DB connection
    const connected = await db.testConnection();
    if (!connected) {
      console.warn('⚠️  Database connection failed, but continuing startup...');
    }

    await ensureSchema();

    // WAL cleanup not needed for PostgreSQL
    console.log('');
    console.log('✅ Akylman Quiz Bowl Server Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: PostgreSQL (persistent)`);
    console.log(`📧 Email: Resend (HTTP API)`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin-login`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to initialize:', err);
    console.error('⚠️  Continuing startup, but some features may not work...');
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await db.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await db.shutdown();
  process.exit(0);
});

initializeApp();

module.exports = app;
