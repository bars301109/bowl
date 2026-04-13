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
 * Validate password strength: 8+ chars, uppercase, lowercase, digit
 */
function isStrongPassword(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}

/**
 * Timing-safe string comparison
 * Uses constant-time comparison to prevent timing attacks
 */
function safeEqual(a, b) {
  const aStr = String(a);
  const bStr = String(b);
  const maxLen = Math.max(aStr.length, bStr.length);
  // Pad both strings to same length to prevent length-based timing attacks
  const aBuf = Buffer.alloc(maxLen, 0);
  const bBuf = Buffer.alloc(maxLen, 0);
  aBuf.write(aStr, 0, Math.min(aStr.length, maxLen));
  bBuf.write(bStr, 0, Math.min(bStr.length, maxLen));
  return crypto.timingSafeEqual(aBuf, bBuf) && aStr.length === bStr.length;
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
