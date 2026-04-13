/* Admin routes: login, tests, questions, categories, teams, results, settings */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../db');
const { adminAuth, signAdminToken } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimiter');
const { safeEqual, sanitizeString } = require('../../utils/sanitization');
const { ADMIN_USER, ADMIN_PASSWORD, RATE_LIMITS } = require('../../config');

const router = express.Router();
const { runAsync, allAsync, getAsync } = db;

const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// --- Admin Login ---
router.post('/api/admin/login', rateLimit(RATE_LIMITS.adminLogin), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (!safeEqual(username, ADMIN_USER) || !safeEqual(password, ADMIN_PASSWORD)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = signAdminToken();
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ ok: true, token });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Logout — clear httpOnly cookie
router.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.json({ ok: true });
});

// All following routes require admin auth
router.use('/api/admin', adminAuth);

// --- Tests CRUD ---
router.get('/api/admin/tests', async (req, res) => {
  try {
    const tests = await allAsync(
      `SELECT t.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM tests t LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.id DESC`
    );
    res.json(tests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/tests', async (req, res) => {
  try {
    const { title, description, preview_text, lang, duration_minutes, window_start, window_end, window_range, category_id, status } = req.body;
    const titleClean = sanitizeString(title || '', 200);
    if (!titleClean) return res.status(400).json({ error: 'title is required' });

    const catId = category_id ? parseInt(category_id, 10) || null : null;
    if (!catId) return res.status(400).json({ error: 'category_id is required' });

    const range = parseHumanWindow(window_range);
    const ws = range.start || window_start || null;
    const we = range.end || window_end || null;
    if (ws && we && new Date(ws).getTime() > new Date(we).getTime()) {
      return res.status(400).json({ error: 'window_start must be before window_end' });
    }

    const dur = parseInt(duration_minutes, 10) || 30;
    if (dur <= 0) return res.status(400).json({ error: 'duration_minutes must be positive' });

    const testStatus = ['draft', 'published', 'archived'].includes(status) ? status : 'draft';

    const result = await runAsync(
      'INSERT INTO tests (title, description, preview_text, lang, duration_minutes, window_start, window_end, status, category_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id',
      [titleClean, description, preview_text, lang || 'ru', dur, ws, we, testStatus, catId]
    );
    res.json({ ok: true, id: result.rows?.[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/tests/:id', async (req, res) => {
  try {
    const { title, description, preview_text, lang, duration_minutes, window_start, window_end, window_range, category_id, status } = req.body;
    const titleClean = sanitizeString(title || '', 200);
    if (!titleClean) return res.status(400).json({ error: 'title is required' });

    const catId = category_id ? parseInt(category_id, 10) || null : null;
    if (!catId) return res.status(400).json({ error: 'category_id is required' });

    const range = parseHumanWindow(window_range);
    const ws = range.start || window_start || null;
    const we = range.end || window_end || null;
    if (ws && we && new Date(ws).getTime() > new Date(we).getTime()) {
      return res.status(400).json({ error: 'window_start must be before window_end' });
    }

    const dur = parseInt(duration_minutes, 10) || 30;
    if (dur <= 0) return res.status(400).json({ error: 'duration_minutes must be positive' });

    const testStatus = ['draft', 'published', 'archived'].includes(status) ? status : undefined;

    const fields = ['title=$1', 'description=$2', 'preview_text=$3', 'lang=$4', 'duration_minutes=$5', 'window_start=$6', 'window_end=$7', 'category_id=$8'];
    const params = [titleClean, description, preview_text, lang || 'ru', dur, ws, we, catId];
    if (testStatus !== undefined) {
      fields.push('status=$' + (params.length + 1));
      params.push(testStatus);
    }
    params.push(req.params.id);
    await runAsync(`UPDATE tests SET ${fields.join(', ')} WHERE id=$${params.length}`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/tests/:id', async (req, res) => {
  try {
    await runAsync('DELETE FROM questions WHERE test_id=$1', [req.params.id]);
    await runAsync('DELETE FROM tests WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete ALL tests, questions, results
router.delete('/api/admin/tests', async (req, res) => {
  try {
    await runAsync('DELETE FROM results', []);
    await runAsync('DELETE FROM questions', []);
    await runAsync('DELETE FROM tests', []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Questions CRUD ---
router.get('/api/admin/tests/:id/questions', async (req, res) => {
  try {
    const rows = await allAsync(
      'SELECT id, test_id, ordinal, text, options, correct, points, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [req.params.id]
    );
    rows.forEach((r) => {
      try { r.options = JSON.parse(r.options || '[]'); } catch { r.options = []; }
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/tests/:id/questions', async (req, res) => {
  try {
    const { ordinal, text, options, correct, points, category_id, lang, type, attachment_url } = req.body;
    const optsJson = JSON.stringify(Array.isArray(options) ? options : []);
    const qType = type === 'text' ? 'text' : 'mcq';
    const result = await runAsync(
      'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id, type, attachment_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [parseInt(req.params.id, 10), ordinal || 0, text || '', optsJson, correct ?? '', points || 1, lang || 'ru', category_id ? parseInt(category_id, 10) || null : null, qType, attachment_url || null]
    );
    res.json({ ok: true, id: result.rows?.[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/questions/:qid', async (req, res) => {
  try {
    const qid = parseInt(req.params.qid, 10);
    const { ordinal, text, options, correct, points, category_id, type, attachment_url } = req.body;
    const fields = [];
    const params = [];

    if (ordinal !== undefined) { fields.push('ordinal = $' + (params.length + 1)); params.push(ordinal || 0); }
    if (text !== undefined) { fields.push('text = $' + (params.length + 1)); params.push(text || ''); }
    if (options !== undefined) { fields.push('options = $' + (params.length + 1)); params.push(JSON.stringify(Array.isArray(options) ? options : [])); }
    if (correct !== undefined) { fields.push('correct = $' + (params.length + 1)); params.push(correct ?? ''); }
    if (points !== undefined) { fields.push('points = $' + (params.length + 1)); params.push(points || 1); }
    if (category_id !== undefined) { fields.push('category_id = $' + (params.length + 1)); params.push(category_id ? parseInt(category_id, 10) || null : null); }
    if (type !== undefined) { fields.push('type = $' + (params.length + 1)); params.push(type === 'text' ? 'text' : 'mcq'); }
    if (attachment_url !== undefined) { fields.push('attachment_url = $' + (params.length + 1)); params.push(attachment_url || null); }

    if (!fields.length) return res.json({ ok: true });
    params.push(qid);
    await runAsync(`UPDATE questions SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/questions/:qid', async (req, res) => {
  try {
    await runAsync('DELETE FROM questions WHERE id = $1', [parseInt(req.params.qid, 10)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- CSV Import/Export ---
router.get('/api/admin/tests/:id/questions/export-csv', async (req, res) => {
  try {
    const qs = await allAsync(
      'SELECT ordinal, text, options, correct, points, category_id FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [req.params.id]
    );
    const header = 'ordinal,text,options,correct,points,category_id\n';
    const lines = qs.map((q) => {
      let opts = '';
      try { opts = JSON.parse(q.options || '[]'); opts = JSON.stringify(opts); } catch { opts = q.options || ''; }
      return [q.ordinal, toCsvValue(q.text || ''), toCsvValue(opts), toCsvValue(q.correct || ''), q.points || 1, q.category_id || ''].join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="test_${req.params.id}_questions.csv"`);
    res.send('\ufeff' + header + lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/tests/:id/questions/import-csv', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const testId = parseInt(req.params.id, 10);
    if (!filePath) return res.status(400).json({ error: 'No file' });

    const text = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsv(text);
    const header = rows.shift() || [];
    const idx = {
      ordinal: header.indexOf('ordinal'),
      text: header.indexOf('text'),
      options: header.indexOf('options'),
      correct: header.indexOf('correct'),
      points: header.indexOf('points'),
      category_id: header.indexOf('category_id'),
    };

    await runAsync('DELETE FROM questions WHERE test_id=$1', [testId]);

    let imported = 0;
    for (const r of rows) {
      if (!r.length) continue;
      const ordinal = parseInt(r[idx.ordinal] || '0') || 0;
      const textv = r[idx.text] || '';
      const optionsRaw = r[idx.options] || '';
      const correct = r[idx.correct] || '';
      const points = parseInt(r[idx.points] || '1') || 1;
      const catId = idx.category_id >= 0 && r[idx.category_id] ? parseInt(r[idx.category_id]) : null;
      let options = [];
      try {
        options = optionsRaw.trim().startsWith('[') ? JSON.parse(optionsRaw) : optionsRaw.split('|').map((s) => s.trim()).filter(Boolean);
      } catch {
        options = optionsRaw.split('|').map((s) => s.trim()).filter(Boolean);
      }
      await runAsync(
        'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [testId, ordinal, textv, JSON.stringify(options), correct, points, 'ru', catId || null]
      );
      imported++;
    }
    res.json({ ok: true, imported });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (filePath) try { fs.unlinkSync(filePath); } catch {}
  }
});

// --- Categories CRUD ---
router.get('/api/admin/categories', async (req, res) => {
  try {
    const rows = await allAsync('SELECT * FROM categories ORDER BY id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/categories', async (req, res) => {
  try {
    const { name_ru, name_ky, desc_ru, desc_ky } = req.body;
    const result = await runAsync(
      'INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id',
      [name_ru, name_ky, desc_ru || null, desc_ky || null]
    );
    res.json({ ok: true, id: result.rows?.[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_ky, desc_ru, desc_ky } = req.body;
    await runAsync('UPDATE categories SET name_ru=$1, name_ky=$2, desc_ru=$3, desc_ky=$4 WHERE id=$5',
      [name_ru, name_ky, desc_ru || null, desc_ky || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    await runAsync('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Teams ---
router.get('/api/admin/teams', async (req, res) => {
  try {
    const teams = await allAsync('SELECT id, team_name, captain_name, captain_email, school, city, created_at FROM teams ORDER BY id DESC');
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/reset-teams', async (req, res) => {
  try {
    await runAsync('DELETE FROM results', []);
    await runAsync('DELETE FROM teams', []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/teams/export-csv', async (req, res) => {
  try {
    const teams = await allAsync(
      `SELECT t.id, t.team_name, t.captain_email, t.captain_phone, t.members, t.school, t.city, t.created_at, c.name_ru AS category_name_ru
       FROM teams t LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.id ASC`
    );
    const header = ['№', 'Название команды', 'Email', 'Телефон', 'Участники', 'Школа', 'Адрес', 'Дата регистрации', 'Категория'].map(toCsvValue).join(',');
    if (!teams?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="teams_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = teams.map((t, i) => {
      let membersStr = '';
      try {
        const arr = JSON.parse(t.members || '[]');
        if (Array.isArray(arr)) membersStr = arr.map((m) => m?.name?.trim() || '').filter(Boolean).join(', ');
      } catch { membersStr = String(t.members); }
      return [i + 1, t.team_name || '', t.captain_email || '', t.captain_phone || '', membersStr, t.school || '', t.city || '', t.created_at || '', t.category_name_ru || ''].map(toCsvValue).join(',');
    }).filter(Boolean);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="teams_export.csv"');
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Results ---
router.get('/api/admin/results', async (req, res) => {
  try {
    const results = await allAsync(
      `SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name, c.name_ru as category_name
       FROM results r
       LEFT JOIN tests t ON t.id = r.test_id
       LEFT JOIN teams tm ON tm.id = r.team_id
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY r.taken_at DESC`
    );
    res.json(processResults(results));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/results/export-csv', async (req, res) => {
  try {
    const results = await allAsync(
      `SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name, c.name_ru as category_name
       FROM results r
       LEFT JOIN tests t ON t.id = r.test_id
       LEFT JOIN teams tm ON tm.id = r.team_id
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY r.taken_at DESC`
    );
    const processed = processResults(results);
    const header = ['№ результата', 'Имя команды', 'Баллы', 'Время прохождения', 'Категория теста'].map(toCsvValue).join(',');
    const rows = processed.map((r) => [r.id, r.team_name || '', r.score_display, r.taken_at_formatted, r.category_name || ''].map(toCsvValue).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="results_export.csv"');
    res.send('\ufeff' + header + '\n' + rows.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Settings ---
router.put('/api/admin/settings', async (req, res) => {
  try {
    const s = req.body || {};
    await runAsync(
      'UPDATE settings SET day1_date=$1, day2_date=$2, day3_date=$3, final_place_ru=$4, final_place_ky=$5, results_published=$6, one_submission_allowed=$7, updated_at=NOW() WHERE id=1',
      [s.day1_date || null, s.day2_date || null, s.day3_date || null, s.final_place_ru || null, s.final_place_ky || null, s.results_published ? 1 : 0, s.one_submission_allowed ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Publish/Unpublish Results ---
router.post('/api/admin/settings/publish-results', async (req, res) => {
  try {
    const { publish } = req.body || {};
    await runAsync(
      'UPDATE settings SET results_published=$1, updated_at=NOW() WHERE id=1',
      [publish ? 1 : 0]
    );
    res.json({ ok: true, results_published: publish ? 1 : 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Auto-update test statuses based on time windows ---
router.post('/api/admin/tests/update-statuses', async (req, res) => {
  try {
    const tests = await allAsync('SELECT id, window_start, window_end, status FROM tests');
    const now = Date.now();
    let updated = 0;
    for (const t of tests) {
      const start = t.window_start ? new Date(t.window_start).getTime() : null;
      const end = t.window_end ? new Date(t.window_end).getTime() : null;
      let newStatus = t.status;
      if (t.status !== 'published') continue; // only auto-update published tests
      if (start && now < start) newStatus = 'scheduled';
      else if (end && now > end) newStatus = 'closed';
      else newStatus = 'active';
      
      if (newStatus !== t.status) {
        await runAsync('UPDATE tests SET status=$1 WHERE id=$2', [newStatus, t.id]);
        updated++;
      }
    }
    res.json({ ok: true, updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Export results for a specific team ---
router.get('/api/admin/results/team/:teamId/export-csv', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId, 10);
    const team = await getAsync('SELECT team_name FROM teams WHERE id=$1', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const results = await allAsync(
      `SELECT r.id, r.score, r.taken_at, r.time_taken_sec, r.answers, r.test_id, t.title, c.name_ru as category_name
       FROM results r
       LEFT JOIN tests t ON t.id = r.test_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE r.team_id = $1
       ORDER BY r.taken_at DESC`,
      [teamId]
    );

    const header = ['№', 'Тест', 'Баллы', 'Время прохождения', 'Затрачено секунд', 'Категория'].map(toCsvValue).join(',');
    const processed = processResults(results);
    const rows = processed.map((r, i) => [i + 1, r.title || '', r.score_display, r.taken_at_formatted, r.time_taken_sec || '', r.category_name || ''].map(toCsvValue).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="results_${team.team_name.replace(/\s+/g, '_')}.csv"`);
    res.send('\ufeff' + header + '\n' + rows.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Homepage blocks ---
router.get('/api/admin/homepage-blocks', async (req, res) => {
  try {
    const blocks = await allAsync('SELECT * FROM homepage_blocks ORDER BY id');
    res.json(blocks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/homepage-blocks/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { title_ru, title_ky, content_ru, content_ky } = req.body;
    const existing = await getAsync('SELECT id FROM homepage_blocks WHERE block_key = $1', [key]);
    if (existing) {
      await runAsync('UPDATE homepage_blocks SET title_ru=$1, title_ky=$2, content_ru=$3, content_ky=$4, updated_at=NOW() WHERE block_key=$5',
        [title_ru || '', title_ky || '', content_ru || '', content_ky || '', key]);
    } else {
      await runAsync('INSERT INTO homepage_blocks (block_key, title_ru, title_ky, content_ru, content_ky, updated_at) VALUES ($1,$2,$3,$4,$5,NOW())',
        [key, title_ru || '', title_ky || '', content_ru || '', content_ky || '']);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Helpers ---
function parseHumanWindow(range) {
  if (!range || typeof range !== 'string') return { start: null, end: null };
  const parts = range.split(/\s*до\s*/i);
  if (parts.length !== 2) return { start: null, end: null };
  function toIso(s) {
    const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[- ](\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const [_, dd, mm, yyyy, hh, min] = m;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return { start: toIso(parts[0]), end: toIso(parts[1]) };
}

function toCsvValue(v) {
  if (v == null || v === undefined) return '""';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inq = false;
  const s = text.replace(/\r/g, '');
  function pushField() { row.push(field); field = ''; }
  function pushRow() { rows.push(row); row = []; }
  while (i < s.length) {
    const ch = s[i++];
    if (inq) {
      if (ch === '"') { if (s[i] === '"') { field += '"'; i++; } else { inq = false; } }
      else { field += ch; }
    } else {
      if (ch === ',') { pushField(); }
      else if (ch === '\n') { pushField(); pushRow(); }
      else if (ch === '"') { inq = true; }
      else { field += ch; }
    }
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows;
}

function processResults(rows) {
  return rows.map((r) => {
    let correct = 0, total = 0;
    if (r.answers) {
      try {
        const answers = JSON.parse(r.answers);
        total = answers.length;
        correct = answers.filter((a) => a.ok).length;
      } catch { correct = r.score || 0; total = correct; }
    }
    let formatted_date = '';
    if (r.taken_at) {
      const d = new Date(r.taken_at);
      formatted_date = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}-${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }
    return { ...r, score_display: total > 0 ? `${correct}/${total}` : `${correct}`, taken_at_formatted: formatted_date };
  });
}

module.exports = router;
