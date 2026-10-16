/* Team routes: profile, results, password change */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { teamAuth, clearTeamCookie } = require('../../middleware/auth');
const { isStrongPassword } = require('../../utils/sanitization');

const router = express.Router();
const { runAsync, getAsync, allAsync } = db;

// Team logout — clear httpOnly cookie (no auth required)
router.post('/api/logout', (req, res) => {
  clearTeamCookie(res);
  res.json({ ok: true });
});

// Require team authentication for /api/me endpoints
router.use('/api/me', teamAuth);

// Get current team profile
router.get('/api/me', async (req, res) => {
  try {
    const t = await getAsync(
      `SELECT
         t.id, t.team_name, t.login, t.team_email, t.email, t.phone,
         t.members, t.school, t.city, t.category_id,
         c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM teams t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [req.team.id]
    );
    if (!t) return res.status(404).json({ error: 'Team not found' });

    t.team_email = t.team_email || t.email || '';
    t.email = t.team_email;
    t.phone = t.phone || '';
    t.members = parseMembers(t.members);
    res.json({ ok: true, team: t, ...t });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update team profile
router.put('/api/me', async (req, res) => {
  try {
    const b = req.body || {};
    const updates = [];
    const params = [];

    // Support flexible alias keys
    const teamName = b.team_name !== undefined ? b.team_name : undefined;
    const emailVal = b.team_email !== undefined ? b.team_email : b.email;
    const phoneVal = b.phone !== undefined ? b.phone : undefined;
    const schoolVal = b.school !== undefined ? b.school : b.branch;
    const cityVal = b.city !== undefined ? b.city : undefined;
    const categoryIdVal = b.category_id !== undefined ? b.category_id : undefined;

    if (teamName !== undefined) {
      updates.push(`team_name = $${params.length + 1}`);
      params.push(String(teamName).trim());
    }

    if (emailVal !== undefined) {
      const email = String(emailVal).trim().toLowerCase();
      const { isValidEmail } = require('../../utils/sanitization');
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Некорректный email адрес' });
      }
      if (email) {
        const existing = await getAsync(
          'SELECT id FROM teams WHERE (LOWER(COALESCE(team_email, \'\')) = $1 OR LOWER(COALESCE(email, \'\')) = $1) AND id != $2',
          [email, req.team.id]
        );
        if (existing) {
          return res.status(400).json({ error: 'Этот email уже используется другой командой' });
        }
        updates.push(`team_email = $${params.length + 1}`);
        params.push(email);
        updates.push(`email = $${params.length + 1}`);
        params.push(email);
      }
    }

    if (phoneVal !== undefined) {
      const p = String(phoneVal).trim();
      updates.push(`phone = $${params.length + 1}`);
      params.push(p);
    }

    if (schoolVal !== undefined) {
      updates.push(`school = $${params.length + 1}`);
      params.push(String(schoolVal).trim());
    }

    if (cityVal !== undefined) {
      updates.push(`city = $${params.length + 1}`);
      params.push(String(cityVal).trim());
    }

    if (categoryIdVal !== undefined) {
      const catId = categoryIdVal ? parseInt(categoryIdVal, 10) || null : null;
      updates.push(`category_id = $${params.length + 1}`);
      params.push(catId);
    }

    if (b.members !== undefined) {
      const ALLOWED_CLASSES = [
        '7-A', '7-B', '7-C',
        '8-A', '8-B', '8-C',
        '9-A', '9-B', '9-C'
      ];
      const rawList = Array.isArray(b.members) ? b.members : [];
      const members = rawList
        .map((m) => ({ name: String(m?.name || '').trim(), class: String(m?.class || '').trim() }))
        .filter((m) => m.name || m.class);

      if (members.length > 0) {
        if (members.length < 2) {
          return res.status(400).json({ error: 'В команде должно быть минимум 2 участника' });
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
              error: `Класс «${m.class}» недопустим. Выберите класс для участника #${i + 1} из списка (7-A ... 9-C).`
            });
          }
        }
      }
      updates.push(`members = $${params.length + 1}`);
      params.push(JSON.stringify(members));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.team.id);
    await runAsync(`UPDATE teams SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    const t = await getAsync(
      `SELECT
         t.id, t.team_name, t.login, t.team_email, t.email, t.phone,
         t.members, t.school, t.city, t.category_id,
         c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM teams t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [req.team.id]
    );
    if (t) {
      t.team_email = t.team_email || t.email || '';
      t.email = t.team_email;
      t.phone = t.phone || '';
      t.members = parseMembers(t.members);
    }
    res.json({ ok: true, team: t });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Verify old password
router.post('/api/me/verify-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required' });

    const team = await getAsync('SELECT id, password FROM teams WHERE id = $1', [req.team.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ok = await bcrypt.compare(password, team.password);
    if (!ok) return res.status(400).json({ error: 'Неверный пароль' });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Change password
router.post('/api/me/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new password required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Пароль не соответствует требованиям: минимум 8 символов, заглавная, строчная буква и цифра' });
    }

    const team = await getAsync('SELECT id, password FROM teams WHERE id = $1', [req.team.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ok = await bcrypt.compare(oldPassword, team.password);
    if (!ok) return res.status(400).json({ error: 'Старый пароль неверен' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE teams SET password = $1 WHERE id = $2', [hashed, req.team.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Team results (only visible if admin has published results)
router.get('/api/me/results', async (req, res) => {
  try {
    // Check if results are published
    const settings = await getAsync('SELECT results_published FROM settings WHERE id=1');
    if (!settings || !settings.results_published) {
      return res.json([]); // Return empty if not published
    }

    const rows = await allAsync(
      `SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, r.time_taken_sec, t.title, tm.team_name, c.name_ru as category_name
       FROM results r
       LEFT JOIN tests t ON t.id = r.test_id
       LEFT JOIN teams tm ON tm.id = r.team_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE r.team_id = $1
       ORDER BY r.taken_at DESC`,
      [req.team.id]
    );

    res.json(processResults(rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Leaderboard (only visible if admin has published results)
router.get('/api/leaderboard', async (req, res) => {
  try {
    // Check if results are published
    const settings = await getAsync('SELECT results_published FROM settings WHERE id=1');
    if (!settings || !settings.results_published) {
      return res.json({ published: false, leaderboard: [] });
    }

    const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) || null : null;

    let sql = `
      SELECT 
        tm.id AS team_id,
        tm.team_name,
        tm.school,
        tm.city,
        c.name_ru AS category_name,
        SUM(r.score) AS total_score,
        COUNT(r.id) AS tests_taken,
        MAX(r.taken_at) AS last_taken
      FROM results r
      JOIN teams tm ON tm.id = r.team_id
      LEFT JOIN tests t ON t.id = r.test_id
      LEFT JOIN categories c ON c.id = t.category_id
    `;

    const params = [];
    if (categoryId) {
      sql += ' WHERE t.category_id = $1';
      params.push(categoryId);
    }

    sql += ' GROUP BY tm.id, tm.team_name, tm.school, tm.city, c.name_ru ORDER BY total_score DESC, tests_taken ASC, last_taken ASC';

    const rows = await allAsync(sql, params);

    // Add rank
    const leaderboard = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
    }));

    res.json({ published: true, leaderboard });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function parseMembers(membersStr) {
  let list = [];
  if (typeof membersStr === 'string') {
    try { list = JSON.parse(membersStr); } catch { list = []; }
  } else if (Array.isArray(membersStr)) {
    list = membersStr;
  }
  if (!Array.isArray(list)) list = [];
  return list
    .map(m => typeof m === 'string' ? { name: m, class: '' } : { name: String(m?.name || '').trim(), class: String(m?.class || '').trim() })
    .filter(m => m.name || m.class);
}

function processResults(rows) {
  return rows.map((r) => {
    let correct = 0;
    let total = 0;
    if (r.answers) {
      try {
        const answers = JSON.parse(r.answers);
        total = answers.length;
        correct = answers.filter((a) => a.ok).length;
      } catch {
        correct = r.score || 0;
        total = 0;
      }
    }
    let formatted_date = '';
    if (r.taken_at) {
      const date = new Date(r.taken_at);
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      formatted_date = `${day}.${month}.${year}-${hours}:${minutes}`;
    }
    return {
      ...r,
      score_display: total > 0 ? `${correct}/${total}` : `${correct}`,
      taken_at_formatted: formatted_date,
    };
  });
}

// --- Announcements & Support Tickets ---
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../config');

function optionalTeamAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token && req.cookies?.team_token) {
    token = req.cookies.team_token;
  }
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Announcements for teams
router.get('/api/announcements', async (req, res) => {
  try {
    const team = optionalTeamAuth(req);
    let categoryId = null;
    if (team && team.id) {
      const teamRow = await getAsync('SELECT category_id FROM teams WHERE id = $1', [team.id]);
      if (teamRow) categoryId = teamRow.category_id;
    }

    let rows;
    if (categoryId) {
      rows = await allAsync(
        `SELECT a.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
         FROM announcements a
         LEFT JOIN categories c ON c.id = a.target_category_id
         WHERE a.is_published = 1 AND (a.target_type = 'all' OR a.target_category_id = $1)
         ORDER BY 
           CASE 
             WHEN a.priority = 'urgent' THEN 1 
             WHEN a.priority = 'important' THEN 2 
             ELSE 3 
           END,
           a.created_at DESC`,
        [categoryId]
      );
    } else {
      rows = await allAsync(
        `SELECT a.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
         FROM announcements a
         LEFT JOIN categories c ON c.id = a.target_category_id
         WHERE a.is_published = 1 AND a.target_type = 'all'
         ORDER BY 
           CASE 
             WHEN a.priority = 'urgent' THEN 1 
             WHEN a.priority = 'important' THEN 2 
             ELSE 3 
           END,
           a.created_at DESC`
      );
    }

    res.json({ ok: true, announcements: rows || [] });
  } catch (e) {
    console.error('Announcements fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Support tickets list for team
router.get('/api/team/support/tickets', teamAuth, async (req, res) => {
  try {
    const teamId = req.team.id;
    const tickets = await allAsync(
      `SELECT t.*, 
        (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
        (SELECT m.sender_type FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
       FROM support_tickets t
       WHERE t.team_id = $1
       ORDER BY t.updated_at DESC, t.id DESC`,
      [teamId]
    );

    res.json({ ok: true, tickets: tickets || [] });
  } catch (e) {
    console.error('Support tickets fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create new support ticket
router.post('/api/team/support/tickets', teamAuth, async (req, res) => {
  try {
    const teamId = req.team.id;
    const { subject, category, message } = req.body || {};

    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'Тема обращения обязательна' });
    }
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }

    const teamRow = await getAsync('SELECT team_name FROM teams WHERE id = $1', [teamId]);
    const teamName = teamRow?.team_name || req.team.team_name || 'Команда';

    const cleanSubject = String(subject).trim();
    const cleanCategory = String(category || 'general').trim();
    const cleanMessage = String(message).trim();

    const insertTicket = await runAsync(
      `INSERT INTO support_tickets (team_id, subject, category, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'open', NOW(), NOW()) RETURNING id`,
      [teamId, cleanSubject, cleanCategory]
    );

    const ticketId = insertTicket.lastID || insertTicket.id || (insertTicket.rows && insertTicket.rows[0]?.id);

    await runAsync(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_name, message, created_at)
       VALUES ($1, 'team', $2, $3, NOW())`,
      [ticketId, teamName, cleanMessage]
    );

    res.json({ ok: true, ticket_id: ticketId, message: 'Обращение успешно создано' });
  } catch (e) {
    console.error('Support ticket creation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get single support ticket with all its messages
router.get('/api/team/support/tickets/:id', teamAuth, async (req, res) => {
  try {
    const teamId = req.team.id;
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Неверный ID обращения' });

    const ticket = await getAsync(
      'SELECT * FROM support_tickets WHERE id = $1 AND team_id = $2',
      [ticketId, teamId]
    );
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' });

    const messages = await allAsync(
      'SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY id ASC',
      [ticketId]
    );

    res.json({ ok: true, ticket, messages: messages || [] });
  } catch (e) {
    console.error('Support ticket detail fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Reply to existing ticket
router.post('/api/team/support/tickets/:id/reply', teamAuth, async (req, res) => {
  try {
    const teamId = req.team.id;
    const ticketId = parseInt(req.params.id, 10);
    const { message } = req.body || {};

    if (!ticketId) return res.status(400).json({ error: 'Неверный ID обращения' });
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
    }

    const ticket = await getAsync(
      'SELECT * FROM support_tickets WHERE id = $1 AND team_id = $2',
      [ticketId, teamId]
    );
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' });

    const teamRow = await getAsync('SELECT team_name FROM teams WHERE id = $1', [teamId]);
    const teamName = teamRow?.team_name || req.team.team_name || 'Команда';
    const cleanMessage = String(message).trim();

    await runAsync(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_name, message, created_at)
       VALUES ($1, 'team', $2, $3, NOW())`,
      [ticketId, teamName, cleanMessage]
    );

    await runAsync(
      `UPDATE support_tickets SET updated_at = NOW(), status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END WHERE id = $1`,
      [ticketId]
    );

    res.json({ ok: true, message: 'Сообщение отправлено' });
  } catch (e) {
    console.error('Support reply error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
