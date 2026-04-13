/* Public routes: authentication (register, login, password reset) */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { signTeamToken, setTeamCookie } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimiter');
const { isValidEmail, isStrongPassword, safeEqual, generateCode } = require('../../utils/sanitization');
const { sendPasswordResetEmail } = require('../../services/email');
const { RATE_LIMITS } = require('../../config');

const router = express.Router();
const { runAsync, getAsync } = db;

// Register
router.post('/api/register', async (req, res) => {
  try {
    const data = req.body;
    if (!data.team_name || !data.password || !data.captain_email) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const email = data.captain_email.trim();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (!isStrongPassword(data.password)) {
      return res.status(400).json({ error: 'Weak password: must have 8+ chars, uppercase, lowercase, and number' });
    }

    const exists = await getAsync('SELECT id FROM teams WHERE captain_email = $1', [email]);
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const members = Array.isArray(data.members)
      ? data.members
          .map((m) => ({
            name: String(m?.name || '').trim(),
            class: String(m?.class || '').trim(),
          }))
          .filter((m) => m.name || m.class)
      : [];

    const randomLogin = 'team_' + Math.random().toString(36).substring(2, 15);
    const categoryId = data.category_id ? parseInt(data.category_id, 10) || null : null;

    await runAsync(
      `INSERT INTO teams (team_name, login, password, captain_name, captain_email, captain_phone, members, school, city, category_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        data.team_name.trim(),
        randomLogin,
        hashed,
        data.captain_name?.trim() || '',
        email,
        data.captain_phone?.trim() || '',
        JSON.stringify(members),
        data.school?.trim() || '',
        data.city?.trim() || '',
        categoryId,
      ]
    );

    console.log(`✓ Team registered: ${data.team_name} (${email})`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post('/api/login', rateLimit(RATE_LIMITS.login), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const team = await getAsync(
      'SELECT id, team_name, login, password, captain_name, captain_email FROM teams WHERE captain_email = $1',
      [email.trim()]
    );
    if (!team) {
      return res.status(401).json({ error: 'Неправильный логин или пароль' });
    }

    const ok = await bcrypt.compare(password, team.password);
    if (!ok) {
      return res.status(401).json({ error: 'Неправильный логин или пароль' });
    }

    const token = signTeamToken(team);
    setTeamCookie(res, token);

    res.json({
      ok: true,
      team: {
        id: team.id,
        team_name: team.team_name,
        login: team.login,
        captain_name: team.captain_name,
        captain_email: team.captain_email,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Password reset: request code
router.post('/api/password-reset/request', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

    const team = await getAsync('SELECT id, captain_name FROM teams WHERE captain_email = $1', [email.trim()]);
    if (!team) {
      await new Promise((r) => setTimeout(r, 1000));
      return res.json({ ok: true, message: 'If email exists, reset code has been sent' });
    }

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await runAsync('DELETE FROM password_reset_codes WHERE email = $1', [email.trim()]);
    await runAsync(
      'INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES ($1,$2,$3,NOW())',
      [email.trim(), code, expiresAt]
    );

    let emailSent = false;
    try {
      await sendPasswordResetEmail({ email: email.trim(), team, code });
      emailSent = true;
    } catch (emailError) {
      console.error('✗ Failed to send password reset email:', emailError.message);
    }

    if (!emailSent) {
      console.warn(`WARNING: Password reset code generated but email not sent to ${email}`);
    }

    res.json({ ok: true, message: 'If email exists, reset code has been sent' });
  } catch (e) {
    console.error('Password reset request error:', e);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

// Password reset: verify code
router.post('/api/password-reset/verify-code', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email, code } = req.body;
    console.log('Password reset verify-code:', { email, code });

    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [email.trim(), code]
    );

    console.log('Reset code lookup:', resetCode ? 'found' : 'not found');

    if (!resetCode) {
      return res.status(400).json({ error: 'Неверный или истекший код' });
    }

    res.json({ ok: true, message: 'Code verified successfully' });
  } catch (e) {
    console.error('Password reset verify-code error:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Password reset: verify code + reset password
router.post('/api/password-reset/verify', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    console.log('Password reset verify:', { email, code, newPasswordLength: newPassword?.length });

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code and new password required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Weak password: must have 8+ chars, uppercase, lowercase, and number' });
    }

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [email.trim(), code]
    );

    console.log('Reset code lookup result:', resetCode ? 'found' : 'not found');

    if (!resetCode) {
      return res.status(400).json({ error: 'Неверный или истекший код' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE teams SET password = $1 WHERE captain_email = $2', [hashed, email.trim()]);
    await runAsync('UPDATE password_reset_codes SET used = 1 WHERE id = $1', [resetCode.id]);

    console.log(`Password reset successful for ${email}`);
    res.json({ ok: true, message: 'Password reset successfully' });
  } catch (e) {
    console.error('Password reset verify error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
