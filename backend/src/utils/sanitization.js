/* Input sanitization utilities */
const crypto = require('crypto');

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a string — trim + escape HTML
 */
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  let cleaned = str.trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return escapeHtml(cleaned);
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate password strength: minimum 6 characters
 */
function isStrongPassword(pw) {
  return typeof pw === 'string' && pw.trim().length >= 6;
}

/**
 * Timing-safe string comparison
 * Uses SHA-256 constant-time comparison to prevent timing attacks
 */
function safeEqual(a, b) {
  if (a === undefined || b === undefined || a === null || b === null) {
    return false;
  }
  const aStr = String(a);
  const bStr = String(b);
  const aHash = crypto.createHash('sha256').update(aStr).digest();
  const bHash = crypto.createHash('sha256').update(bStr).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

/**
 * Generate a random alphanumeric code of given length
 */
function generateCode(length = 6) {
  const chars = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

module.exports = {
  escapeHtml,
  sanitizeString,
  isValidEmail,
  isStrongPassword,
  safeEqual,
  generateCode,
};
