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

// All routes below require team authentication (skip for non-API paths)
router.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  teamAuth(req, res, next);
});

// Get current team profile
router.get('/api/me', async (req, res) => {
  try {
    const t = await getAsync(
      `SELECT
         t.id, t.team_name, t.login, t.captain_name, t.captain_email,
         t.captain_phone, t.members, t.school, t.city, t.category_id,
         c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM teams t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [req.team.id]
    );
    if (!t) return res.status(404).json({ error: 'Team not found' });

    t.members = parseMembers(t.members);
    res.json({ ok: true, team: t });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update team profile
router.put('/api/me', async (req, res) => {
  try {
    const allowedFields = ['team_name', 'captain_name', 'captain_phone', 'school', 'city', 'members', 'category_id'];
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'members') {
          const members = Array.isArray(req.body.members)
            ? req.body.members
                .map((m) => ({ name: String(m?.name || '').trim(), class: String(m?.class || '').trim() }))
                .filter((m) => m.name || m.class)
            : [];
          updates.push('members = $' + (params.length + 1));
          params.push(JSON.stringify(members));
        } else if (field === 'category_id') {
          const catId = req.body.category_id ? parseInt(req.body.category_id, 10) || null : null;
          updates.push('category_id = $' + (params.length + 1));
          params.push(catId);
        } else {
          updates.push(`${field} = $${params.length + 1}`);
          params.push(req.body[field] ?? null);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.team.id);
    await runAsync(`UPDATE teams SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    const t = await getAsync(
      'SELECT id, team_name, login, captain_name, captain_email, captain_phone, members, school, city FROM teams WHERE id=$1',
      [req.team.id]
    );
    if (t) t.members = parseMembers(t.members);
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
  if (!membersStr) return [];
  if (typeof membersStr === 'string') {
    try {
      return JSON.parse(membersStr);
    } catch {
      return [];
    }
  }
  return membersStr;
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

module.exports = router;
