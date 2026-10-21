/* Public routes: authentication (register, login, password reset) */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { signTeamToken, setTeamCookie } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimiter');
const { isValidEmail, isStrongPassword, generateCode } = require('../../utils/sanitization');
const { sendPasswordResetEmail } = require('../../services/email');
const { RATE_LIMITS } = require('../../config');

const router = express.Router();
const { runAsync, getAsync } = db;

// Register
function canonicalBranch(b) {
  const s = String(b || '').trim().toLowerCase();
  if (s === 'талас' || s === 'talas') return 'Талас';
  if (s === 'манас' || s === 'manas') return 'Манас';
  if (s === 'чолпон-ата' || s === 'чолпоната' || s === 'cholpon-ata' || s === 'cholponata') return 'Чолпон-Ата';
  return String(b || '').trim();
}

function getReqLang(req) {
  const l = String(req.headers['x-lang'] || req.headers['accept-language'] || req.body?.lang || '').toLowerCase();
  return l.includes('ky') ? 'ky' : 'en';
}

// Register participant
router.post('/api/register', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const data = req.body || {};
    const fullName = String(data.full_name || data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    const grade = String(data.grade || data.class || '').trim();
    const rawBranch = String(data.branch || data.school || data.city || '').trim();
    const branch = canonicalBranch(rawBranch);

    if (!fullName || !email || !password || !grade || !branch) {
      return res.status(400).json({
        error: isKy
          ? 'Аты-жөнүңүздү, email, сырсөз, класс жана филиалды толтуруңуз'
          : 'Please fill in full name, email, password, grade, and branch',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: isKy ? 'Туура эмес email дареги' : 'Invalid email address',
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: isKy
          ? 'Сырсөз кеминде 8 белгиден туруп, коопсуздук талаптарына жооп бериши керек'
          : 'Password must be at least 8 characters and meet security requirements',
      });
    }

    const exists = await getAsync('SELECT id FROM participants WHERE LOWER(email) = $1', [email]);
    if (exists) {
      return res.status(400).json({
        error: isKy
          ? 'Бул email менен катышуучу буга чейин катталган'
          : 'A participant with this email is already registered',
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const insertRes = await runAsync(
      `INSERT INTO participants (full_name, email, password_hash, grade, school, city, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [fullName, email, hashed, grade, branch, branch],
    );

    const participantId = insertRes.lastID || insertRes.rows?.[0]?.id;
    const participant = await getAsync('SELECT id, full_name, email, grade, school, city, team_id, category_id, category_confirmed FROM participants WHERE id = $1', [participantId]);

    const token = signTeamToken(participant);
    setTeamCookie(res, token);

    res.json({
      ok: true,
      token,
      participant,
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Login participant
router.post('/api/login', rateLimit(RATE_LIMITS.login), async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const email = String(req.body?.email || req.body?.login || req.body?.team_email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({
        error: isKy ? 'Email жана сырсөз талап кылынат' : 'Email and password are required',
      });
    }

    const participant = await getAsync(
      'SELECT id, full_name, email, password_hash, grade, school, city, team_id, category_id, category_confirmed FROM participants WHERE LOWER(email) = $1',
      [email],
    );

    if (!participant) {
      return res.status(401).json({
        error: isKy ? 'Email же сырсөз туура эмес' : 'Invalid email or password',
      });
    }

    const matchBcrypt = await bcrypt.compare(password, participant.password_hash);
    if (!matchBcrypt) {
      return res.status(401).json({
        error: isKy ? 'Email же сырсөз туура эмес' : 'Invalid email or password',
      });
    }

    const token = signTeamToken(participant);
    setTeamCookie(res, token);

    delete participant.password_hash;
    res.json({
      ok: true,
      token,
      participant,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Password reset: request code
router.post('/api/password-reset/request', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: isKy ? 'Email талап кылынат' : 'Email is required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: isKy ? 'Туура эмес email дареги' : 'Invalid email address' });

    const cleanEmail = email.trim().toLowerCase();
    const participant = await getAsync('SELECT id, full_name, email FROM participants WHERE LOWER(email) = $1', [cleanEmail]);
    const team = await getAsync(
      'SELECT id, team_name, team_email, email FROM teams WHERE LOWER(COALESCE(team_email, \'\')) = $1 OR LOWER(COALESCE(email, \'\')) = $1 OR LOWER(COALESCE(login, \'\')) = $1',
      [cleanEmail],
    );
    if (!participant && !team) {
      return res.status(404).json({ error: isKy ? 'Бул email менен аккаунт табылган жок' : 'Account with this email not found.' });
    }

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await runAsync('DELETE FROM password_reset_codes WHERE LOWER(email) = $1', [cleanEmail]);
    await runAsync(
      'INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES ($1,$2,$3,NOW())',
      [cleanEmail, code, expiresAt],
    );

    let sendResult = { success: false };
    try {
      sendResult = await sendPasswordResetEmail({ email: cleanEmail, team: team || { team_name: participant?.full_name }, code });
    } catch (emailError) {
      console.error('✗ Failed to send password reset email:', emailError.message);
      sendResult = { success: false, error: emailError.message };
    }

    const emailSent = Boolean(sendResult && sendResult.success);
    if (!emailSent) {
      await runAsync('DELETE FROM password_reset_codes WHERE LOWER(email) = $1', [cleanEmail]);
      const errorMsg = sendResult.userMessage || (isKy ? 'Код жөнөтүүдө ката кетти. Почта орнотууларын текшериңиз.' : 'Failed to send reset code. Please check email settings.');
      return res.status(500).json({ error: errorMsg });
    }

    res.json({
      ok: true,
      message: isKy ? 'Сырсөздү калыбына келтирүү коду электрондук почтаңызга жөнөтүлдү' : 'Password reset code sent to your email',
    });
  } catch (e) {
    console.error('Password reset request error:', e);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

// Password reset: verify code
router.post('/api/password-reset/verify-code', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { email, code } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !code) return res.status(400).json({ error: isKy ? 'Email жана код талап кылынат' : 'Email and code are required' });

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE LOWER(email) = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [cleanEmail, code],
    );

    if (!resetCode) {
      return res.status(400).json({ error: isKy ? 'Код туура эмес же мөөнөтү бүткөн' : 'Invalid or expired code' });
    }

    res.json({ ok: true, message: isKy ? 'Код ийгиликтүү текшерилди' : 'Code verified successfully' });
  } catch (e) {
    console.error('Password reset verify-code error:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Password reset: verify code + reset password
router.post('/api/password-reset/verify', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { email, code, newPassword } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !code || !newPassword) {
      return res.status(400).json({ error: isKy ? 'Email, код жана жаңы сырсөз талап кылынат' : 'Email, code, and new password are required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: isKy ? 'Сырсөз кеминде 8 белгиден турушу керек' : 'Password must be at least 8 characters' });
    }

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE LOWER(email) = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [cleanEmail, code],
    );

    if (!resetCode) {
      return res.status(400).json({ error: isKy ? 'Код туура эмес же мөөнөтү бүткөн' : 'Invalid or expired code' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE participants SET password_hash = $1 WHERE LOWER(email) = $2', [hashed, cleanEmail]);
    await runAsync(
      'UPDATE teams SET password = $1 WHERE LOWER(COALESCE(team_email, \'\')) = $2 OR LOWER(COALESCE(email, \'\')) = $2 OR LOWER(COALESCE(login, \'\')) = $2',
      [hashed, cleanEmail],
    );
    await runAsync('UPDATE password_reset_codes SET used = 1 WHERE id = $1', [resetCode.id]);

    console.log(`Password reset successful for ${email}`);
    res.json({ ok: true, message: isKy ? 'Сырсөз ийгиликтүү өзгөртүлдү' : 'Password successfully updated' });
  } catch (e) {
    console.error('Password reset verify error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
