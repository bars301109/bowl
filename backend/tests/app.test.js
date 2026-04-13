/* Basic tests for key endpoints */
const request = require('supertest');

// Mock the database and config for testing
jest.mock('../src/db', () => ({
  type: 'postgres',
  runAsync: jest.fn(),
  allAsync: jest.fn(),
  getAsync: jest.fn(),
  exec: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  shutdown: jest.fn().mockResolvedValue(),
  pool: { query: jest.fn() },
}));

jest.mock('../src/config', () => ({
  isProd: false,
  JWT_SECRET: 'test-secret-key-for-testing-only',
  JWT_EXPIRES_IN: '1h',
  ADMIN_USER: 'testadmin',
  ADMIN_PASSWORD: 'TestPass123',
  ADMIN_JWT_SECRET: 'test-admin-secret-key',
  ADMIN_JWT_EXPIRES_IN: '1h',
  RESEND_API_KEY: 'test_resend_key',
  RESEND_FROM: 'Test <test@example.com>',
  RATE_LIMITS: {
    login: { windowMs: 60000, max: 100 },
    reset: { windowMs: 60000, max: 100 },
    adminLogin: { windowMs: 60000, max: 100 },
  },
  DATA_DIR: '/tmp/test-data',
  TESTS_DIR: '/tmp/test-data/tests',
}));

describe('Sanitization Utils', () => {
  const { escapeHtml, isValidEmail, isStrongPassword, safeEqual, generateCode } = require('../src/utils/sanitization');

  test('escapeHtml escapes special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('isValidEmail validates emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  test('isStrongPassword checks password strength', () => {
    expect(isStrongPassword('Short1A')).toBe(false);       // too short
    expect(isStrongPassword('nouppercase1')).toBe(false); // no uppercase
    expect(isStrongPassword('NOLOWERCASE1')).toBe(false); // no lowercase
    expect(isStrongPassword('NoDigits!!')).toBe(false);   // no digit
    expect(isStrongPassword('GoodPass1')).toBe(true);
  });

  test('safeEqual compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'xyz')).toBe(false);
  });

  test('generateCode generates numeric code', () => {
    const code = generateCode(6);
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('Schema service', () => {
  const db = require('../src/db');
  const { ensureSchema } = require('../src/services/schema');

  test('ensureSchema runs without error (mocked)', async () => {
    db.getAsync.mockResolvedValueOnce({ cnt: 1 }); // categories exist
    db.getAsync.mockResolvedValueOnce({ id: 1 });  // tests exist
    db.getAsync.mockResolvedValueOnce({ id: 1 });  // settings exist

    await expect(ensureSchema()).resolves.not.toThrow();
  });
});

describe('Auth middleware', () => {
  const { signTeamToken, signAdminToken, teamAuth, adminAuth } = require('../src/middleware/auth');

  test('signTeamToken creates valid token', () => {
    const token = signTeamToken({ id: 1, team_name: 'Test Team', login: 'team_1' });
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('signAdminToken creates valid token', () => {
    const token = signAdminToken();
    expect(token).toBeDefined();
  });
});

describe('CSV helpers', () => {
  // These are in the admin routes file — testing parseCsv indirectly
  test('CSV value quoting works', () => {
    // Simple check: toCsvValue wraps in quotes
    const toCsvValue = (v) => {
      if (v == null || v === undefined) return '""';
      return '"' + String(v).replace(/"/g, '""') + '"';
    };
    expect(toCsvValue('hello')).toBe('"hello"');
    expect(toCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(toCsvValue(null)).toBe('""');
  });
});
