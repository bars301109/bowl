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
router.post('/api/register', async (req, res) => {
  try {
    const data = req.body || {};
    const teamEmail = String(data.team_email || data.email || '').trim().toLowerCase();
    const teamName = String(data.team_name || '').trim();
    const password = String(data.password || '');

    if (!teamName || !password || !teamEmail) {
      return res.status(400).json({ error: 'Пожалуйста, заполните название команды, email и пароль' });
    }

    if (!isValidEmail(teamEmail)) {
      return res.status(400).json({ error: 'Некорректный email адрес команды' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
    }

    const exists = await getAsync(
      'SELECT id FROM teams WHERE LOWER(COALESCE(team_email, \'\')) = $1 OR LOWER(COALESCE(email, \'\')) = $1',
      [teamEmail]
    );
    if (exists) {
      return res.status(400).json({ error: 'Команда с таким email уже зарегистрирована' });
    }

    const categoryId = data.category_id ? parseInt(data.category_id, 10) || null : null;

    const hashed = await bcrypt.hash(password, 10);

    // Format participants (members)
    let members = [];
    if (Array.isArray(data.members)) {
      members = data.members
        .map((m) => ({
          name: String(m?.name || '').trim(),
          class: String(m?.class || '').trim(),
        }))
        .filter((m) => m.name || m.class);
    } else {
      for (let i = 1; i <= 6; i++) {
        const mName = String(data[`member_${i}_name`] || '').trim();
        const mClass = String(data[`member_${i}_info`] || data[`member_${i}_class`] || '').trim();
        if (mName || mClass) {
          members.push({ name: mName, class: mClass });
        }
      }
    }

    const ALLOWED_CLASSES = [
      '7-A', '7-B', '7-C',
      '8-A', '8-B', '8-C',
      '9-A', '9-B', '9-C'
    ];
    if (members.length === 0) {
      return res.status(400).json({ error: 'Пожалуйста, укажите участников команды' });
    }
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.name) {
        return res.status(400).json({ error: `Пожалуйста, укажите ФИО участника #${i + 1}` });
      }
      if (!m.class) {
        return res.status(400).json({ error: `Пожалуйста, выберите класс для участника #${i + 1}` });
      }
      if (!ALLOWED_CLASSES.includes(m.class)) {
        return res.status(400).json({
          error: `Класс «${m.class}» недопустим. Выберите класс из предложенного списка.`
        });
      }
    }

    const randomLogin = 'team_' + Math.random().toString(36).substring(2, 12);
    const branchVal = String(data.branch || data.school || '').trim();
    const cityVal = String(data.city || (data.branch ? data.branch : '')).trim();

    const insertResult = await runAsync(
      `INSERT INTO teams (team_name, login, password, team_email, email, phone, members, school, city, category_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING id`,
      [
        teamName,
        randomLogin,
        hashed,
        teamEmail,
        teamEmail,
        '',
        JSON.stringify(members),
        branchVal,
        cityVal,
        categoryId,
      ]
    );

    const teamId = insertResult.lastID || insertResult.rows?.[0]?.id;

    const newTeam = await getAsync(
      'SELECT id, team_name, login, team_email, email, phone, members, school, city, category_id FROM teams WHERE id = $1',
      [teamId]
    );

    const token = signTeamToken(newTeam);
    setTeamCookie(res, token);

    console.log(`✓ Team registered and logged in: ${teamName} (${teamEmail})`);
    res.json({
      ok: true,
      token,
      team: {
        id: newTeam.id,
        team_name: newTeam.team_name,
        login: newTeam.login,
        team_email: newTeam.team_email || newTeam.email || teamEmail,
        email: newTeam.team_email || newTeam.email || teamEmail,
        phone: newTeam.phone || '',
        members: members,
        school: newTeam.school || '',
        city: newTeam.city || '',
        category_id: newTeam.category_id,
      },
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Login (supports Team Email, Team Name, or Login)
router.post('/api/login', rateLimit(RATE_LIMITS.login), async (req, res) => {
  try {
    const inputIdentifier = req.body?.email || req.body?.login || req.body?.team_email || req.body?.username;
    const password = req.body?.password;
    if (!inputIdentifier || !password) {
      return res.status(400).json({ error: 'Email (или название команды) и пароль обязательны' });
    }

    const cleanInput = String(inputIdentifier).trim().toLowerCase();
    const team = await getAsync(
      `SELECT id, team_name, login, password, team_email, email, phone, members, school, city, category_id
       FROM teams 
       WHERE LOWER(COALESCE(team_email, '')) = $1 
          OR LOWER(COALESCE(email, '')) = $1 
          OR LOWER(COALESCE(login, '')) = $1
          OR LOWER(COALESCE(team_name, '')) = $1`,
      [cleanInput]
    );
    if (!team) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const matchBcrypt = await bcrypt.compare(String(password), String(team.password));
    const matchPlain = (team.password === password);
    if (!matchBcrypt && !matchPlain) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    let parsedMembers = [];
    try { parsedMembers = JSON.parse(team.members || '[]'); } catch { parsedMembers = []; }
    if (!Array.isArray(parsedMembers)) parsedMembers = [];

    const token = signTeamToken(team);
    setTeamCookie(res, token);

    res.json({
      ok: true,
      token,
      team: {
        id: team.id,
        team_name: team.team_name,
        login: team.login,
        team_email: team.team_email || team.email || cleanInput,
        email: team.team_email || team.email || cleanInput,
        phone: team.phone || '',
        members: parsedMembers,
        school: team.school || '',
        city: team.city || '',
        category_id: team.category_id,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Password reset: request code
router.post('/api/password-reset/request', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email обязателен' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Некорректный email адрес' });

    const cleanEmail = email.trim().toLowerCase();
    const team = await getAsync(
      'SELECT id, team_name, team_email, email FROM teams WHERE LOWER(COALESCE(team_email, \'\')) = $1 OR LOWER(COALESCE(email, \'\')) = $1 OR LOWER(COALESCE(login, \'\')) = $1',
      [cleanEmail]
    );
    if (!team) {
      await new Promise((r) => setTimeout(r, 1000));
      return res.json({ ok: true, message: 'Если email зарегистрирован, код для сброса пароля отправлен' });
    }

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await runAsync('DELETE FROM password_reset_codes WHERE LOWER(email) = $1', [cleanEmail]);
    await runAsync(
      'INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES ($1,$2,$3,NOW())',
      [cleanEmail, code, expiresAt]
    );

    let sendResult = { success: false };
    try {
      sendResult = await sendPasswordResetEmail({ email: cleanEmail, team, code });
    } catch (emailError) {
      console.error('✗ Failed to send password reset email:', emailError.message);
      sendResult = { success: false, error: emailError.message };
    }

    const emailSent = Boolean(sendResult && sendResult.success);
    if (!emailSent) {
      await runAsync('DELETE FROM password_reset_codes WHERE LOWER(email) = $1', [cleanEmail]);
      const errorMsg = sendResult.userMessage || 'Не удалось отправить письмо с кодом на указанную почту. Проверьте настройки почты.';
      return res.status(500).json({ error: errorMsg });
    }

    res.json({
      ok: true,
      message: 'Код сброса пароля отправлен на ваш email',
    });
  } catch (e) {
    console.error('Password reset request error:', e);
    res.status(500).json({ error: 'Ошибка сервера. Пожалуйста, попробуйте позже.' });
  }
});

// Password reset: verify code
router.post('/api/password-reset/verify-code', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !code) return res.status(400).json({ error: 'Email и код обязательны' });

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE LOWER(email) = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [cleanEmail, code]
    );

    if (!resetCode) {
      return res.status(400).json({ error: 'Неверный или истекший код' });
    }

    res.json({ ok: true, message: 'Код успешно подтвержден' });
  } catch (e) {
    console.error('Password reset verify-code error:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Password reset: verify code + reset password
router.post('/api/password-reset/verify', rateLimit(RATE_LIMITS.reset), async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, код и новый пароль обязательны' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    const resetCode = await getAsync(
      'SELECT * FROM password_reset_codes WHERE LOWER(email) = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()',
      [cleanEmail, code]
    );

    if (!resetCode) {
      return res.status(400).json({ error: 'Неверный или истекший код' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync(
      'UPDATE teams SET password = $1 WHERE LOWER(COALESCE(team_email, \'\')) = $2 OR LOWER(COALESCE(email, \'\')) = $2 OR LOWER(COALESCE(login, \'\')) = $2',
      [hashed, cleanEmail]
    );
    await runAsync('UPDATE password_reset_codes SET used = 1 WHERE id = $1', [resetCode.id]);

    console.log(`Password reset successful for ${email}`);
    res.json({ ok: true, message: 'Пароль успешно изменен' });
  } catch (e) {
    console.error('Password reset verify error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
