/* Centralized configuration from environment variables */
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

// JWT
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '12h';

// Admin
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_JWT_EXPIRES_IN = '8h';

// Email — Resend only
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Akylman Quiz <onboarding@resend.dev>';

// Rate limits
const RATE_LIMITS = {
  login: { windowMs: 10 * 60 * 1000, max: 20 },
  reset: { windowMs: 10 * 60 * 1000, max: 10 },
  adminLogin: { windowMs: 10 * 60 * 1000, max: 10 },
};

// Data
const DATA_DIR = isProd ? '/var/data' : path.join(__dirname, '..', '..', 'data');
const TESTS_DIR = path.join(DATA_DIR, 'tests');

// Validate required secrets in production
if (isProd) {
  const missing = [];
  if (!JWT_SECRET) missing.push('JWT_SECRET');
  if (!ADMIN_USER) missing.push('ADMIN_USER');
  if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!ADMIN_JWT_SECRET) missing.push('ADMIN_JWT_SECRET');
  if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');

  if (missing.length > 0) {
    console.error(`⚠️  Missing required env vars in production: ${missing.join(', ')}`);
    console.error('⚠️  Server will start, but some features may not work.');
    // Don't exit — let the server start anyway
  }
}

module.exports = {
  isProd,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  ADMIN_USER,
  ADMIN_PASSWORD,
  ADMIN_JWT_SECRET,
  ADMIN_JWT_EXPIRES_IN,
  RESEND_API_KEY,
  RESEND_FROM,
  RATE_LIMITS,
  DATA_DIR,
  TESTS_DIR,
};
