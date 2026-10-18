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

    await runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = FALSE WHERE id = $2', [teamId, req.participantId]).catch(() => {
      return runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = 0 WHERE id = $2', [teamId, req.participantId]);
    });

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

    await runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = false WHERE id = $2', [team.id, req.participantId]).catch(() => {
      return runAsync('UPDATE participants SET team_id = $1, category_id = NULL, category_confirmed = 0 WHERE id = $2', [team.id, req.participantId]);
    });

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

    await runAsync('UPDATE participants SET team_id = NULL, category_id = NULL, category_confirmed = false WHERE id = $1', [req.participantId]).catch(() => {
      return runAsync('UPDATE participants SET team_id = NULL, category_id = NULL, category_confirmed = 0 WHERE id = $1', [req.participantId]);
    });

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

    await runAsync('UPDATE participants SET category_id = $1, category_confirmed = FALSE WHERE id = $2', [categoryId, req.participantId]).catch(() => {
      return runAsync('UPDATE participants SET category_id = $1, category_confirmed = 0 WHERE id = $2', [categoryId, req.participantId]);
    });

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
    const confirmedVal = Boolean(confirmed);
    await runAsync('UPDATE participants SET category_confirmed = $1 WHERE id = $2', [confirmed, req.participantId]).catch(() => {
      return runAsync('UPDATE participants SET category_confirmed = $1 WHERE id = $2', [confirmed ? 1 : 0, req.participantId]);
    });

    // Check if all team members (3) have confirmed
    const teammates = await allAsync('SELECT id, category_id, category_confirmed FROM participants WHERE team_id = $1', [participant.team_id]);
    
    if (teammates.length === 3) {
      const allConfirmed = teammates.every(m => Boolean(m.category_confirmed) && m.category_id);
      const uniqueCats = new Set(teammates.map(m => m.category_id));
      
      if (allConfirmed && uniqueCats.size === 3) {
        await runAsync("UPDATE teams SET status = 'ready' WHERE id = $1", [participant.team_id]);
      } else {
        await runAsync("UPDATE teams SET status = 'full' WHERE id = $1", [participant.team_id]);
      }
    }

    res.json({ ok: true, confirmed: Boolean(confirmedVal) });
  } catch (e) {
    console.error('Confirm category error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Rename team (from Team section)
router.post('/api/teams/rename', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const participant = await getAsync('SELECT team_id FROM participants WHERE id = $1', [req.participantId]);
    if (!participant?.team_id) {
      return res.status(400).json({ error: isKy ? 'Сиз командада жоксуз' : 'You are not in a team' });
    }
    const newName = String(req.body?.team_name || '').trim();
    if (!newName) {
      return res.status(400).json({ error: isKy ? 'Команданын аталышын жазыңыз' : 'Team name cannot be empty' });
    }
    await runAsync('UPDATE teams SET team_name = $1 WHERE id = $2', [newName, participant.team_id]);
    res.json({ ok: true, team_name: newName });
  } catch (e) {
    console.error('Rename team error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update participant profile (and team name if in team)
router.put('/api/me', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const b = req.body || {};
    const { full_name, email, grade, team_name } = b;

    // 1. Update participant personal profile
    const pUpdates = [];
    const pParams = [];

    if (full_name !== undefined) {
      const cleanName = String(full_name).trim();
      if (!cleanName) {
        return res.status(400).json({ error: isKy ? 'Аты-жөнүңүздү жазыңыз' : 'Full name cannot be empty' });
      }
      pUpdates.push(`full_name = $${pParams.length + 1}`);
      pParams.push(cleanName);
    }

    if (grade !== undefined) {
      const cleanGrade = String(grade).trim();
      pUpdates.push(`grade = $${pParams.length + 1}`);
      pParams.push(cleanGrade);
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      const { isValidEmail } = require('../../utils/sanitization');
      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: isKy ? 'Email дареги туура эмес' : 'Invalid email address' });
      }
      const existing = await getAsync(
        'SELECT id FROM participants WHERE LOWER(email) = $1 AND id != $2',
        [cleanEmail, req.participantId]
      );
      if (existing) {
        return res.status(400).json({ error: isKy ? 'Бул email мурунтан катталган' : 'This email is already in use by another participant' });
      }
      pUpdates.push(`email = $${pParams.length + 1}`);
      pParams.push(cleanEmail);
    }

    if (pUpdates.length > 0) {
      pParams.push(req.participantId);
      await runAsync(`UPDATE participants SET ${pUpdates.join(', ')} WHERE id = $${pParams.length}`, pParams);
    }

    // 2. If team_name provided and participant is in a team, update team name
    if (team_name !== undefined) {
      const p = await getAsync('SELECT team_id FROM participants WHERE id = $1', [req.participantId]);
      if (p?.team_id) {
        const cleanTeamName = String(team_name).trim();
        if (cleanTeamName) {
          await runAsync('UPDATE teams SET team_name = $1 WHERE id = $2', [cleanTeamName, p.team_id]);
        }
      }
    }

    const updatedParticipant = await getAsync(
      'SELECT id, full_name, email, grade, school, city, team_id, category_id, category_confirmed FROM participants WHERE id = $1',
      [req.participantId]
    );

    let updatedTeam = null;
    let teammates = [];
    if (updatedParticipant?.team_id) {
      updatedTeam = await getAsync('SELECT id, team_name, school, city, invite_code, status, created_at FROM teams WHERE id = $1', [updatedParticipant.team_id]);
      teammates = await allAsync('SELECT id, full_name, email, grade, school, category_id, category_confirmed FROM participants WHERE team_id = $1', [updatedParticipant.team_id]);
    }

    res.json({
      ok: true,
      message: isKy ? 'Маалыматтар ийгиликтүү сакталды' : 'Profile updated successfully',
      participant: updatedParticipant,
      team: updatedTeam,
      teammates
    });
  } catch (e) {
    console.error('Update participant profile error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Verify old password
router.post('/api/me/verify-password', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required' });

    const participant = await getAsync('SELECT id, password_hash FROM participants WHERE id = $1', [req.participantId]);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    const ok = await bcrypt.compare(password, participant.password_hash);
    if (!ok) return res.status(400).json({ error: isKy ? 'Учурдагы сырсөз туура эмес' : 'Current password is incorrect' });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Change password
router.post('/api/me/change-password', async (req, res) => {
  try {
    const isKy = getReqLang(req) === 'ky';
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: isKy ? 'Эски жана жаңы сырсөздү жазыңыз' : 'Old and new password required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ 
        error: isKy 
          ? 'Сырсөз кеминде 8 белгиден туруп, чоң жана кичине тамгаларды жана санды камтышы керек' 
          : 'Password must be at least 8 characters and include uppercase, lowercase, and numbers' 
      });
    }

    const participant = await getAsync('SELECT id, password_hash FROM participants WHERE id = $1', [req.participantId]);
    if (!participant) return res.status(404).json({ error: isKy ? 'Катышуучу табылган жок' : 'Participant not found' });

    const ok = await bcrypt.compare(oldPassword, participant.password_hash);
    if (!ok) return res.status(400).json({ error: isKy ? 'Учурдагы эски сырсөз туура эмес' : 'Old password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE participants SET password_hash = $1 WHERE id = $2', [hashed, req.participantId]);
    res.json({ ok: true, message: isKy ? 'Сырсөз ийгиликтүү алмаштырылды' : 'Password changed successfully' });
  } catch (e) {
    console.error('Change password error:', e);
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
