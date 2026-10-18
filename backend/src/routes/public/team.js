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

// Require team authentication for /api/me and /api/teams endpoints
router.use('/api/me', teamAuth);
router.use('/api/teams', teamAuth);

// Get current team profile
// Get current participant profile, team, teammates, and categories
router.get('/api/me', async (req, res) => {
  try {
    const participant = await getAsync(
      `SELECT id, full_name, email, grade, school, city, team_id, category_id, category_confirmed
       FROM participants WHERE id = $1`,
      [req.participantId]
    );
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    let team = null;
    let teammates = [];
    if (participant.team_id) {
      team = await getAsync(
        `SELECT id, team_name, school, city, invite_code, status, created_at FROM teams WHERE id = $1`,
        [participant.team_id]
      );
      teammates = await allAsync(
        `SELECT id, full_name, email, grade, school, category_id, category_confirmed FROM participants WHERE team_id = $1`,
        [participant.team_id]
      );
    }

    const categories = await allAsync('SELECT id, name_ru, name_ky, desc_ru, desc_ky FROM categories ORDER BY id ASC');

    res.json({
      ok: true,
      participant,
      team,
      teammates,
      categories,
      // For legacy frontend compatibility:
      teamData: team ? { ...team, members: teammates } : null
    });
  } catch (e) {
    console.error('Get me error:', e);
    res.status(500).json({ error: e.message });
  }
});

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

// Create team
router.post('/api/teams/create', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { team_name } = req.body || {};
    if (!team_name || !String(team_name).trim()) {
      return res.status(400).json({ 
        error: isKy ? 'Команданын атын жазыңыз' : 'Please enter team name' 
      });
    }

    const participant = await getAsync('SELECT team_id, school, city FROM participants WHERE id = $1', [req.participantId]);
    if (!participant) {
      return res.status(401).json({ error: isKy ? 'Авторизация талап кылынат' : 'Authentication required' });
    }
    if (participant.team_id) {
      return res.status(400).json({ 
        error: isKy ? 'Сиз мурунтан эле командада барсыз. Алгач командадан чыгыңыз.' : 'You are already in a team. Please leave your current team first.' 
      });
    }

    const branch = canonicalBranch(participant.school || participant.city);
    const inviteCode = 'AKYL-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const insertRes = await runAsync(
      `INSERT INTO teams (team_name, school, city, invite_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'forming', NOW()) RETURNING id`,
      [String(team_name).trim(), branch, branch, inviteCode]
    );

    const teamId = insertRes.lastID || insertRes.rows?.[0]?.id;

    await runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = FALSE WHERE id = $2', [teamId, req.participantId]);

    res.json({ ok: true, invite_code: inviteCode, team_id: teamId });
  } catch (e) {
    console.error('Create team error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Join team by invite code
router.post('/api/teams/join', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const inviteCode = String(req.body?.invite_code || '').trim().toUpperCase();
    if (!inviteCode) {
      return res.status(400).json({ 
        error: isKy ? 'Чакыруу кодун киргизиңиз' : 'Please enter invite code' 
      });
    }

    const participant = await getAsync('SELECT team_id, school, city FROM participants WHERE id = $1', [req.participantId]);
    if (!participant) {
      return res.status(401).json({ error: isKy ? 'Авторизация талап кылынат' : 'Authentication required' });
    }
    if (participant.team_id) {
      return res.status(400).json({ 
        error: isKy ? 'Сиз буга чейин командада барсыз' : 'You are already in a team' 
      });
    }

    const team = await getAsync('SELECT id, team_name, school, city, status FROM teams WHERE UPPER(invite_code) = $1', [inviteCode]);
    if (!team) {
      return res.status(404).json({ 
        error: isKy ? 'Бул код менен команда табылган жок' : 'Team with this invite code was not found' 
      });
    }

    // Enforce branch matching
    const pBranch = canonicalBranch(participant.school || participant.city);
    const tBranch = canonicalBranch(team.school || team.city);
    if (pBranch && tBranch && pBranch !== tBranch) {
      return res.status(400).json({ 
        error: isKy
          ? `Команданын катышуучулары бир гана филиалдан (${tBranch}) боло алышат. Сиз ${pBranch} филиалынансыз.`
          : `Team members must be from the same branch (${tBranch}). You are registered under ${pBranch}.`
      });
    }

    const countRes = await getAsync('SELECT COUNT(*) as cnt FROM participants WHERE team_id = $1', [team.id]);
    const memberCount = parseInt(countRes?.cnt || 0, 10);

    if (memberCount >= 3) {
      return res.status(400).json({ 
        error: isKy ? 'Командада орундар толду (максимум 3 катышуучу)' : 'Team is already full (maximum 3 members)' 
      });
    }

    await runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = FALSE WHERE id = $2', [team.id, req.participantId]);

    const newCount = memberCount + 1;
    if (newCount === 3) {
      await runAsync("UPDATE teams SET status = 'full' WHERE id = $1", [team.id]);
    }

    res.json({ ok: true, team_id: team.id, team_name: team.team_name });
  } catch (e) {
    console.error('Join team error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Leave team
router.post('/api/teams/leave', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const participant = await getAsync('SELECT team_id FROM participants WHERE id = $1', [req.participantId]);
    if (!participant?.team_id) {
      return res.status(400).json({ 
        error: isKy ? 'Сиз командада жоксуз' : 'You are not in a team' 
      });
    }

    const teamId = participant.team_id;

    await runAsync('UPDATE participants SET team_id = NULL, category_id = NULL, category_confirmed = FALSE WHERE id = $1', [req.participantId]);

    // Update team status back to forming if it was full or ready
    await runAsync("UPDATE teams SET status = 'forming' WHERE id = $1", [teamId]);

    res.json({ ok: true });
  } catch (e) {
    console.error('Leave team error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Select category
router.post('/api/teams/category', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const categoryId = parseInt(req.body?.category_id, 10);
    if (!categoryId) {
      return res.status(400).json({ 
        error: isKy ? 'Категорияны тандаңыз' : 'Please select a category' 
      });
    }

    const participant = await getAsync('SELECT team_id FROM participants WHERE id = $1', [req.participantId]);
    if (!participant?.team_id) {
      return res.status(400).json({ 
        error: isKy ? 'Сиз командада жоксуз' : 'You are not in a team' 
      });
    }

    // Check if category is already taken by another teammate
    const taken = await getAsync(
      'SELECT id FROM participants WHERE team_id = $1 AND category_id = $2 AND id != $3',
      [participant.team_id, categoryId, req.participantId]
    );
    if (taken) {
      return res.status(400).json({ 
        error: isKy ? 'Бул категорияны командалашыңыз тандап алган' : 'This category is already chosen by a teammate' 
      });
    }

    await runAsync('UPDATE participants SET category_id = $1, category_confirmed = FALSE WHERE id = $2', [categoryId, req.participantId]);

    // Reset team status to forming/full (not ready until re-confirmed)
    await runAsync("UPDATE teams SET status = 'full' WHERE id = $1 AND status = 'ready'", [participant.team_id]);

    res.json({ ok: true });
  } catch (e) {
    console.error('Select category error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Confirm category distribution
router.post('/api/teams/confirm', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const participant = await getAsync('SELECT team_id, category_id FROM participants WHERE id = $1', [req.participantId]);
    if (!participant?.team_id) {
      return res.status(400).json({ 
        error: isKy ? 'Сиз командада жоксуз' : 'You are not in a team' 
      });
    }
    if (!participant.category_id) {
      return res.status(400).json({ 
        error: isKy ? 'Алгач өз категорияңызды тандаңыз' : 'Please select your category first' 
      });
    }

    const confirmed = req.body?.confirmed !== false;

    await runAsync('UPDATE participants SET category_confirmed = $1 WHERE id = $2', [confirmed, req.participantId]);

    // Check if all team members (3) have confirmed
    const teammates = await allAsync('SELECT id, category_id, category_confirmed FROM participants WHERE team_id = $1', [participant.team_id]);
    
    if (teammates.length === 3) {
      const allConfirmed = teammates.every(m => m.category_confirmed && m.category_id);
      const uniqueCats = new Set(teammates.map(m => m.category_id));
      
      if (allConfirmed && uniqueCats.size === 3) {
        await runAsync("UPDATE teams SET status = 'ready' WHERE id = $1", [participant.team_id]);
      } else {
        await runAsync("UPDATE teams SET status = 'full' WHERE id = $1", [participant.team_id]);
      }
    }

    res.json({ ok: true, confirmed });
  } catch (e) {
    console.error('Confirm category error:', e);
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
