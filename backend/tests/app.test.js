/* Unit & Integration Tests using node:test and node:assert */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { escapeHtml, isValidEmail, isStrongPassword, safeEqual, generateCode } = require('../src/utils/sanitization');
const { signTeamToken, signAdminToken } = require('../src/middleware/auth');

describe('Sanitization Utils', () => {
  it('escapeHtml escapes special characters', () => {
    assert.strictEqual(
      escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('isValidEmail validates emails', () => {
    assert.strictEqual(isValidEmail('test@example.com'), true);
    assert.strictEqual(isValidEmail('invalid'), false);
    assert.strictEqual(isValidEmail(''), false);
  });

  it('isStrongPassword checks password strength', () => {
    assert.strictEqual(isStrongPassword('Short1A'), false);       // too short
    assert.strictEqual(isStrongPassword('nouppercase1'), false); // no uppercase
    assert.strictEqual(isStrongPassword('NOLOWERCASE1'), false); // no lowercase
    assert.strictEqual(isStrongPassword('NoDigits!!'), false);   // no digit
    assert.strictEqual(isStrongPassword('GoodPass1'), true);
  });

  it('safeEqual compares strings safely', () => {
    assert.strictEqual(safeEqual('abc', 'abc'), true);
    assert.strictEqual(safeEqual('abc', 'xyz'), false);
  });

  it('generateCode generates numeric code', () => {
    const code = generateCode(6);
    assert.match(code, /^\d{6}$/);
  });
});

describe('Auth middleware', () => {
  it('signTeamToken creates valid token', () => {
    const token = signTeamToken({ id: 1, team_name: 'Test Team', login: 'team_1' });
    assert.ok(token);
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.split('.').length, 3);
  });

  it('signAdminToken creates valid token', () => {
    const token = signAdminToken();
    assert.ok(token);
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.split('.').length, 3);
  });
});

describe('Database in-memory adapter', () => {
  const db = require('../src/db');

  it('runs query and insert operations in in-memory mode', async () => {
    const res = await db.runAsync(
      'INSERT INTO categories (name_ru, name_ky, slug) VALUES (?, ?, ?)',
      ['История', 'Тарых', 'history']
    );
    assert.ok(res);

    const rows = await db.allAsync('SELECT * FROM categories');
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);
  });
});
