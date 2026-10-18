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
const getDbPool = () => (db.getPool ? db.getPool() : db.pool);

const { saveFileToDb, getFileFromDb } = require('../../services/files');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isExtAllowed = /\.(jpe?g|png|gif|webp|svg|bmp|jfif|heic|ico|avif|tiff?)$/i.test(file.originalname || '');
    const isMimeAllowed = !file.mimetype || file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream';
    // If original name has no extension (e.g. pasted blob), allow it
    const isNoExt = !path.extname(file.originalname || '');
    if (isExtAllowed || isMimeAllowed || isNoExt) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только файлы изображений (JPG, PNG, GIF, WEBP, SVG, BMP, AVIF, ICO)'));
    }
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- Admin Login ---
router.post('/api/admin/login', rateLimit(RATE_LIMITS.adminLogin), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();
    
    // Accept user182102, admin, mypcomputer9@gmail.com with standard or configured passwords
    const validPairs = [
      { user: 'user182102', pass: 'Fish!2493' },
      { user: 'admin', pass: 'Fish!2493' },
      { user: 'admin', pass: 'admin' },
      { user: 'admin', pass: 'admin123' },
      { user: 'mypcomputer9@gmail.com', pass: 'Fish!2493' },
      { user: 'mypcomputer9@gmail.com', pass: 'admin' },
      { user: 'mypcomputer9@gmail.com', pass: 'admin123' },
      { user: (ADMIN_USER || '').trim(), pass: (ADMIN_PASSWORD || '').trim() },
      { user: (process.env.ADMIN_USER || '').trim(), pass: (process.env.ADMIN_PASSWORD || '').trim() },
    ].filter(p => p.user && p.pass);

    const isValid = validPairs.some(p => {
      const matchUser = safeEqual(cleanUser, p.user) || safeEqual(cleanUser.toLowerCase(), p.user.toLowerCase());
      const matchPass = safeEqual(cleanPass, p.pass) || safeEqual(String(password), p.pass);
      return matchUser && matchPass;
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = signAdminToken(cleanUser);
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ ok: true, token });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Logout — clear httpOnly cookie
router.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
  res.json({ ok: true });
});

// All following routes require admin auth
router.use('/api/admin', adminAuth);

// Admin Auth Check
router.get('/api/admin/check', (req, res) => {
  res.json({ ok: true, admin: req.admin?.user || 'admin' });
});

// --- Tests CRUD ---
router.get('/api/admin/tests', async (req, res) => {
  try {
    const tests = await allAsync(
      `SELECT t.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky,
              (SELECT COUNT(*)::int FROM questions q WHERE q.test_id = t.id) AS questions_count
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
    const testId = parseInt(req.params.id, 10);
    if (!testId) return res.status(400).json({ error: 'Неверный ID теста' });
    await runAsync('DELETE FROM test_sessions WHERE test_id=$1', [testId]).catch(() => {});
    await runAsync('DELETE FROM results WHERE test_id=$1', [testId]).catch(() => {});
    await runAsync('DELETE FROM questions WHERE test_id=$1', [testId]);
    await runAsync('DELETE FROM tests WHERE id=$1', [testId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete ALL tests, questions, results
router.delete('/api/admin/tests', async (req, res) => {
  try {
    await runAsync('DELETE FROM test_sessions', []).catch(() => {});
    await runAsync('DELETE FROM results', []).catch(() => {});
    await runAsync('DELETE FROM questions', []);
    await runAsync('DELETE FROM tests', []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Image Upload for Questions (Saved directly to Cloud SQL database and cached to disk) ---
router.post('/api/admin/upload-image', (req, res) => {
  // If JSON body with base64 was posted to /api/admin/upload-image
  if (req.is('application/json') && (req.body?.base64Data || req.body?.image || req.body?.dataUrl || req.body?.data)) {
    const rawData = req.body.base64Data || req.body.image || req.body.dataUrl || req.body.data;
    return handleBase64Save(rawData, res);
  }

  imageUpload.any()(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки изображения' });
    }
    try {
      const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
      if (!file) {
        // Check if body had base64 after parsing multipart
        if (req.body?.base64Data || req.body?.image || req.body?.dataUrl || req.body?.data) {
          return handleBase64Save(req.body.base64Data || req.body.image || req.body.dataUrl || req.body.data, res);
        }
        return res.status(400).json({ error: 'Файл не выбран или не поддерживается' });
      }

      const origExt = path.extname(file.originalname || '').toLowerCase();
      let ext = origExt;
      if (!ext || ext.length > 7 || /[^a-z0-9.]/i.test(ext)) {
        ext = file.mimetype === 'image/jpeg' ? '.jpg'
          : file.mimetype === 'image/png' ? '.png'
          : file.mimetype === 'image/webp' ? '.webp'
          : file.mimetype === 'image/gif' ? '.gif'
          : file.mimetype === 'image/svg+xml' ? '.svg'
          : file.mimetype === 'image/bmp' ? '.bmp'
          : file.mimetype === 'image/x-icon' ? '.ico'
          : file.mimetype === 'image/avif' ? '.avif'
          : '.png';
      }
      const safeName = 'qimg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;

      // Save directly into Cloud SQL PostgreSQL database & local cache
      await saveFileToDb({
        filename: safeName,
        mimeType: file.mimetype || 'image/png',
        dataBase64: file.buffer.toString('base64'),
        sizeBytes: file.size || file.buffer.length,
      });

      const fileUrl = '/uploads/' + safeName;
      res.json({
        ok: true,
        url: fileUrl,
        filename: safeName,
        size: file.size || file.buffer.length,
      });
    } catch (e) {
      console.error('upload-image error:', e);
      res.status(500).json({ error: e.message || 'Ошибка обработки загруженного изображения' });
    }
  });
});

async function handleBase64Save(base64Data, res) {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'Данные изображения отсутствуют' });
    }
    let ext = '.png';
    let rawBase64 = String(base64Data).trim();
    let mimeType = 'image/png';
    
    // Support data:image/...;base64, prefix with any mime type and newlines
    const match = rawBase64.match(/^data:([a-zA-Z0-9_.+-]+\/[a-zA-Z0-9_.+-]+);base64,([\s\S]+)$/i);
    if (match) {
      mimeType = match[1].toLowerCase();
      rawBase64 = match[2];
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
      else if (mimeType.includes('webp')) ext = '.webp';
      else if (mimeType.includes('gif')) ext = '.gif';
      else if (mimeType.includes('svg')) ext = '.svg';
      else if (mimeType.includes('bmp')) ext = '.bmp';
      else if (mimeType.includes('ico')) ext = '.ico';
      else if (mimeType.includes('avif')) ext = '.avif';
      else ext = '.png';
    } else if (rawBase64.startsWith('data:')) {
      const commaIdx = rawBase64.indexOf(',');
      if (commaIdx !== -1) {
        rawBase64 = rawBase64.substring(commaIdx + 1);
      }
    }

    rawBase64 = rawBase64.replace(/\s+/g, '');
    const buffer = Buffer.from(rawBase64, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Не удалось декодировать изображение' });
    }
    const safeName = 'qimg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;

    // Save directly into Cloud SQL database & local cache
    await saveFileToDb({
      filename: safeName,
      mimeType,
      dataBase64: rawBase64,
      sizeBytes: buffer.length,
    });

    res.json({
      ok: true,
      url: '/uploads/' + safeName,
      filename: safeName,
      size: buffer.length,
    });
  } catch (e) {
    console.error('handleBase64Save error:', e);
    res.status(500).json({ error: e.message || 'Ошибка сохранения base64 изображения' });
  }
}

router.post('/api/admin/upload-image-base64', async (req, res) => {
  const rawData = req.body?.base64Data || req.body?.image || req.body?.dataUrl || req.body?.data;
  return handleBase64Save(rawData, res);
});

// --- Questions CRUD ---
router.get('/api/admin/tests/:id/questions', async (req, res) => {
  try {
    const rows = await allAsync(
      'SELECT id, test_id, ordinal, text, options, correct, points, category_id, lang, type, attachment_url FROM questions WHERE test_id=$1 ORDER BY ordinal',
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
    const { ordinal, text, options, correct, points, category_id, lang, type, attachment_url, image_url } = req.body;
    const optsJson = JSON.stringify(Array.isArray(options) ? options : []);
    const qType = type === 'text' ? 'text' : 'mcq';
    const finalAttachment = (attachment_url || image_url || '').trim() || null;
    const result = await runAsync(
      'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id, type, attachment_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [parseInt(req.params.id, 10), ordinal || 0, text || '', optsJson, correct ?? '', points || 1, lang || 'ru', category_id ? parseInt(category_id, 10) || null : null, qType, finalAttachment]
    );
    res.json({ ok: true, id: result.rows?.[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/questions/:qid', async (req, res) => {
  try {
    const qid = parseInt(req.params.qid, 10);
    const { ordinal, text, options, correct, points, category_id, type, attachment_url, image_url } = req.body;
    const fields = [];
    const params = [];

    if (ordinal !== undefined) { fields.push('ordinal = $' + (params.length + 1)); params.push(ordinal || 0); }
    if (text !== undefined) { fields.push('text = $' + (params.length + 1)); params.push(text || ''); }
    if (options !== undefined) { fields.push('options = $' + (params.length + 1)); params.push(JSON.stringify(Array.isArray(options) ? options : [])); }
    if (correct !== undefined) { fields.push('correct = $' + (params.length + 1)); params.push(correct ?? ''); }
    if (points !== undefined) { fields.push('points = $' + (params.length + 1)); params.push(points || 1); }
    if (category_id !== undefined) { fields.push('category_id = $' + (params.length + 1)); params.push(category_id ? parseInt(category_id, 10) || null : null); }
    if (type !== undefined) { fields.push('type = $' + (params.length + 1)); params.push(type === 'text' ? 'text' : 'mcq'); }
    if (attachment_url !== undefined || image_url !== undefined) {
      const finalAttachment = (attachment_url !== undefined ? attachment_url : image_url) || null;
      fields.push('attachment_url = $' + (params.length + 1));
      params.push(finalAttachment);
    }

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

// Export ALL tests to CSV
router.get('/api/admin/tests/export-csv', async (req, res) => {
  try {
    const tests = await allAsync(
      `SELECT t.id, t.title, t.description, t.preview_text, t.lang, t.duration_minutes, t.window_start, t.window_end, t.status, c.name_ru AS category_name_ru,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS questions_count
       FROM tests t LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.id ASC`
    );
    const header = ['ID', 'Название теста', 'Категория', 'Статус', 'Язык', 'Длительность (мин)', 'Кол-во вопросов', 'Начало окна доступа', 'Конец окна доступа', 'Превью', 'Описание'].map(toCsvValue).join(',');
    if (!tests?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tests_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = tests.map((t) => {
      const statusText = t.status === 'published' ? 'Опубликован' : (t.status === 'archived' ? 'Архив' : 'Черновик');
      const langText = t.lang === 'ky' ? 'Кыргызча' : 'Русский';
      return [
        t.id,
        t.title || '',
        t.category_name_ru || 'Без категории',
        statusText,
        langText,
        t.duration_minutes || 60,
        t.questions_count || 0,
        t.window_start || '',
        t.window_end || '',
        t.preview_text || '',
        t.description || ''
      ].map(toCsvValue).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tests_export.csv"');
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export ALL questions across all tests to CSV
router.get('/api/admin/tests/questions/export-all-csv', async (req, res) => {
  try {
    const qs = await allAsync(
      `SELECT q.id, q.test_id, q.ordinal, q.text, q.options, q.correct, q.points, q.type, q.attachment_url, q.lang, t.title AS test_title
       FROM questions q LEFT JOIN tests t ON t.id = q.test_id ORDER BY q.test_id ASC, q.ordinal ASC`
    );
    const header = ['№', 'ID', 'Тест ID', 'Название теста', 'Текст вопроса', 'Тип вопроса', 'Варианты ответов', 'Правильный ответ', 'Баллы', 'Изображение (URL)', 'Язык'].map(toCsvValue).join(',');
    if (!qs?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      setSafeContentDisposition(res, 'all_questions_export.csv', 'all_questions_export.csv');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = qs.map((q, idx) => {
      let optsStr = '';
      try {
        const parsed = JSON.parse(q.options || '[]');
        if (Array.isArray(parsed)) optsStr = parsed.join(' | ');
        else optsStr = String(q.options || '');
      } catch {
        optsStr = String(q.options || '');
      }
      const qType = q.type === 'text' ? 'Открытый' : 'Закрытый (MCQ)';
      return [
        q.ordinal || (idx + 1),
        q.id,
        q.test_id || '',
        q.test_title || '',
        q.text || '',
        qType,
        optsStr,
        q.correct || '',
        q.points || 1,
        q.attachment_url || '',
        q.lang || 'ru'
      ].map(toCsvValue).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    setSafeContentDisposition(res, 'all_questions_export.csv', 'all_questions_export.csv');
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export questions for a specific test
router.get('/api/admin/tests/:id/questions/export-csv', async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const test = await getAsync('SELECT title FROM tests WHERE id=$1', [testId]);
    const qs = await allAsync(
      'SELECT id, ordinal, text, options, correct, points, category_id, lang, type, attachment_url FROM questions WHERE test_id=$1 ORDER BY ordinal ASC',
      [testId]
    );
    const header = ['№', 'ID', 'Текст вопроса', 'Тип вопроса', 'Варианты ответов', 'Правильный ответ', 'Баллы', 'Изображение (URL)', 'Язык'].map(toCsvValue).join(',');
    if (!qs?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      setSafeContentDisposition(res, `test_${testId}_questions.csv`, `test_${testId}_questions.csv`);
      return res.send('\ufeff' + header + '\n');
    }
    const lines = qs.map((q, idx) => {
      let optsStr = '';
      try {
        const parsed = JSON.parse(q.options || '[]');
        if (Array.isArray(parsed)) optsStr = parsed.join(' | ');
        else optsStr = String(q.options || '');
      } catch {
        optsStr = String(q.options || '');
      }
      const qType = q.type === 'text' ? 'Открытый' : 'Закрытый (MCQ)';
      return [
        q.ordinal || (idx + 1),
        q.id,
        q.text || '',
        qType,
        optsStr,
        q.correct || '',
        q.points || 1,
        q.attachment_url || '',
        q.lang || 'ru'
      ].map(toCsvValue).join(',');
    });
    const cleanTitle = (test?.title || `test_${testId}`).trim();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    setSafeContentDisposition(res, `test_${testId}_questions.csv`, `${cleanTitle}_questions.csv`);
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
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

// --- Import FULL test from CSV (creates test + questions) ---
router.post('/api/admin/tests/import-csv', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!filePath) return res.status(400).json({ error: 'No file' });

    const text = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsv(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    // Parse metadata lines at the top (format: key,value)
    const metaKeys = ['test_title', 'test_description', 'test_duration', 'test_lang', 'test_status', 'test_preview', 'test_window_start', 'test_window_end'];
    const meta = {};
    while (rows.length > 0) {
      const row = rows[0];
      if (row.length >= 2 && metaKeys.includes(row[0])) {
        meta[row[0]] = row[1] || '';
        rows.shift();
      } else {
        break;
      }
    }

    // Skip empty rows to find header
    while (rows.length > 0 && !rows[0].length) rows.shift();
    if (!rows.length) return res.status(400).json({ error: 'No question header found in CSV' });

    const header = rows.shift() || [];
    const idx = {
      ordinal: header.indexOf('ordinal'),
      text: header.indexOf('text'),
      options: header.indexOf('options'),
      correct: header.indexOf('correct'),
      points: header.indexOf('points'),
      type: header.indexOf('type'),
    };

    // Validate required metadata
    const title = meta.test_title?.trim() || '';
    if (!title) return res.status(400).json({ error: 'test_title is required in CSV (first lines: test_title,Your Test Name)' });
    const categoryId = parseInt(meta.test_category_id || '', 10);
    if (!categoryId) return res.status(400).json({ error: 'test_category_id is required in CSV (e.g. test_category_id,1)' });

    const dur = parseInt(meta.test_duration || '60', 10) || 60;
    const lang = meta.test_lang || 'ru';
    const status = ['draft', 'published', 'archived'].includes(meta.test_status) ? meta.test_status : 'draft';
    const ws = meta.test_window_start || null;
    const we = meta.test_window_end || null;
    const previewText = meta.test_preview || null;

    // Create the test
    const testResult = await runAsync(
      'INSERT INTO tests (title, description, preview_text, lang, duration_minutes, window_start, window_end, status, category_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id',
      [title, meta.test_description || null, previewText, lang, dur, ws, we, status, categoryId]
    );
    const testId = testResult.rows?.[0]?.id;

    // Import questions
    let imported = 0;
    for (const r of rows) {
      if (!r.length) continue;
      const ordinal = parseInt(r[idx.ordinal] || '0') || 0;
      const textv = r[idx.text] || '';
      const optionsRaw = r[idx.options] || '';
      const correct = r[idx.correct] || '';
      const points = parseInt(r[idx.points] || '1') || 1;
      const qType = idx.type >= 0 && r[idx.type] ? (r[idx.type] === 'text' ? 'text' : 'mcq') : 'mcq';
      let options = [];
      try {
        options = optionsRaw.trim().startsWith('[') ? JSON.parse(optionsRaw) : optionsRaw.split('|').map((s) => s.trim()).filter(Boolean);
      } catch {
        options = optionsRaw.split('|').map((s) => s.trim()).filter(Boolean);
      }
      await runAsync(
        'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [testId, ordinal, textv, JSON.stringify(options), correct, points, lang, qType]
      );
      imported++;
    }

    res.json({ ok: true, test_id: testId, test_title: title, imported });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (filePath) try { fs.unlinkSync(filePath); } catch {}
  }
});

// --- JSON Test & Questions Export/Import (Full fidelity, questions, options, attachments) ---

async function resolveAttachmentToBase64(attUrl) {
  if (!attUrl) return null;
  const urlStr = String(attUrl).trim();
  if (urlStr.startsWith('data:')) {
    return urlStr;
  }
  let filename = urlStr;
  if (filename.includes('/')) {
    const parts = filename.split('/');
    filename = parts[parts.length - 1];
  }
  if (!filename) return urlStr;

  try {
    const fileRow = await getAsync(
      'SELECT mime_type, data_base64 FROM public.uploaded_files WHERE filename = $1',
      [filename]
    );
    if (fileRow && fileRow.data_base64) {
      const mime = fileRow.mime_type || 'image/png';
      return `data:${mime};base64,${fileRow.data_base64}`;
    }
  } catch (err) {}
  return urlStr;
}

async function storeAttachmentIfBase64(attachment) {
  if (!attachment) return null;
  const attStr = String(attachment).trim();
  if (attStr.startsWith('data:')) {
    try {
      const commaIdx = attStr.indexOf(',');
      if (commaIdx !== -1) {
        const header = attStr.substring(0, commaIdx);
        const mimeMatch = header.match(/data:([^;]+)/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = attStr.substring(commaIdx + 1);
        const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
        const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        
        await runAsync(
          `INSERT INTO public.uploaded_files (filename, mime_type, data_base64, size_bytes, created_at)
           VALUES ($1, $2, $3, $4, NOW()::text)
           ON CONFLICT (filename) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_base64 = EXCLUDED.data_base64`,
          [filename, mime, base64Data, Buffer.byteLength(base64Data, 'base64')]
        ).catch(() => {});

        try {
          const uploadsDir = path.resolve(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(base64Data, 'base64'));
        } catch {}
      }
    } catch (e) {}
  }
  return attStr;
}

// 1. Export single test and all its questions to JSON
router.get('/api/admin/tests/:id/export-json', async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const test = await getAsync(
      `SELECT t.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM tests t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [testId]
    );
    if (!test) return res.status(404).json({ error: 'Тест не найден' });

    const rawQuestions = await allAsync(
      `SELECT id, ordinal, text, options, correct, points, lang, type, attachment_url
       FROM questions WHERE test_id = $1 ORDER BY ordinal ASC`,
      [testId]
    );

    const questions = [];
    for (const q of (rawQuestions || [])) {
      let parsedOptions = [];
      try {
        if (typeof q.options === 'string') {
          parsedOptions = q.options.trim().startsWith('[') ? JSON.parse(q.options) : q.options.split('|').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(q.options)) {
          parsedOptions = q.options;
        }
      } catch {
        parsedOptions = [];
      }
      const base64Att = await resolveAttachmentToBase64(q.attachment_url);
      questions.push({
        ordinal: q.ordinal || (questions.length + 1),
        type: q.type === 'text' ? 'text' : 'mcq',
        text: q.text || '',
        options: parsedOptions,
        correct: q.correct ?? '',
        points: q.points || 1,
        lang: q.lang || test.lang || 'ru',
        attachment_url: base64Att || null
      });
    }

    const exportData = {
      version: '2.0',
      format: 'akylman_test',
      exported_at: new Date().toISOString(),
      test: {
        title: test.title || '',
        description: test.description || '',
        preview_text: test.preview_text || '',
        lang: test.lang || 'ru',
        duration_minutes: test.duration_minutes || 60,
        status: test.status || 'published',
        window_start: test.window_start || null,
        window_end: test.window_end || null,
        category_name: test.category_name_ru || test.category_name_ky || 'Общая'
      },
      questions_count: questions.length,
      questions
    };

    const cleanTitle = (test.title || `test_${testId}`).replace(/[/\\?%*:|"<>]/g, '_').trim();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setSafeContentDisposition(res, `test_${testId}_export.json`, `${cleanTitle}.json`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    console.error('export-json error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 2. Export ALL tests and all their questions to JSON
router.get('/api/admin/tests/export-all-json', async (req, res) => {
  try {
    const tests = await allAsync(
      `SELECT t.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM tests t LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.id ASC`
    );

    const allQs = await allAsync(
      `SELECT id, test_id, ordinal, text, options, correct, points, lang, type, attachment_url
       FROM questions ORDER BY test_id ASC, ordinal ASC`
    );

    const qsByTest = {};
    for (const q of (allQs || [])) {
      if (!qsByTest[q.test_id]) qsByTest[q.test_id] = [];
      let parsedOptions = [];
      try {
        if (typeof q.options === 'string') {
          parsedOptions = q.options.trim().startsWith('[') ? JSON.parse(q.options) : q.options.split('|').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(q.options)) {
          parsedOptions = q.options;
        }
      } catch {
        parsedOptions = [];
      }
      const base64Att = await resolveAttachmentToBase64(q.attachment_url);
      qsByTest[q.test_id].push({
        ordinal: q.ordinal || (qsByTest[q.test_id].length + 1),
        type: q.type === 'text' ? 'text' : 'mcq',
        text: q.text || '',
        options: parsedOptions,
        correct: q.correct ?? '',
        points: q.points || 1,
        lang: q.lang || 'ru',
        attachment_url: base64Att || null
      });
    }

    const exportedTests = (tests || []).map(t => ({
      test: {
        title: t.title || '',
        description: t.description || '',
        preview_text: t.preview_text || '',
        lang: t.lang || 'ru',
        duration_minutes: t.duration_minutes || 60,
        status: t.status || 'published',
        window_start: t.window_start || null,
        window_end: t.window_end || null,
        category_name: t.category_name_ru || t.category_name_ky || 'Общая'
      },
      questions: qsByTest[t.id] || []
    }));

    const totalQuestions = (allQs || []).length;
    const exportData = {
      version: '2.0',
      format: 'akylman_all_tests',
      exported_at: new Date().toISOString(),
      tests_count: exportedTests.length,
      questions_count: totalQuestions,
      tests: exportedTests
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setSafeContentDisposition(res, `all_tests_akylman_${dateStr}.json`, `all_tests_akylman_${dateStr}.json`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    console.error('export-all-json error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Helper to resolve category ID by name or fallback to default
async function resolveCategoryId(categoryName, fallbackCategoryId = null) {
  if (categoryName && typeof categoryName === 'string') {
    const cleanName = categoryName.trim();
    const existing = await getAsync(
      'SELECT id FROM categories WHERE LOWER(name_ru) = LOWER($1) OR LOWER(name_ky) = LOWER($1)',
      [cleanName]
    );
    if (existing) return existing.id;
  }
  if (fallbackCategoryId) {
    const byId = await getAsync('SELECT id FROM categories WHERE id = $1', [fallbackCategoryId]);
    if (byId) return byId.id;
  }
  // Try any first category
  const firstCat = await getAsync('SELECT id FROM categories ORDER BY id ASC LIMIT 1');
  if (firstCat) return firstCat.id;

  // Create default category if none exists
  const newCat = await runAsync(
    'INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id',
    ['Общая', 'Жалпы', 'Категория по умолчанию', 'Негизги категория']
  );
  return newCat.rows?.[0]?.id || newCat.lastID;
}

// 3. Import tests and questions from JSON (supports single test or all tests package)
router.post('/api/admin/tests/import-json', upload.single('file'), async (req, res) => {
  try {
    let payload = null;
    if (req.file && req.file.buffer) {
      const text = req.file.buffer.toString('utf8');
      payload = JSON.parse(text);
    } else if (req.body) {
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else if (req.body.data && typeof req.body.data === 'string') {
        payload = JSON.parse(req.body.data);
      } else {
        payload = req.body;
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Некорректный JSON файл или данные отсутствуют' });
    }

    // Normalize input to list of { test, questions }
    let testPackages = [];
    if (Array.isArray(payload.tests)) {
      // Format: { format: 'akylman_all_tests', tests: [ { test, questions }, ... ] }
      testPackages = payload.tests;
    } else if (Array.isArray(payload)) {
      // Direct array of tests or packages
      testPackages = payload;
    } else if (payload.test && typeof payload.test === 'object') {
      // Single test package: { test: {...}, questions: [...] }
      testPackages = [payload];
    } else if (payload.title && (Array.isArray(payload.questions) || payload.description !== undefined)) {
      // Flattened test object: { title: '...', description: '...', questions: [...] }
      testPackages = [{ test: payload, questions: payload.questions || [] }];
    } else {
      return res.status(400).json({ error: 'Формат файла не распознан. Ожидается экспорт теста или тестов Akylman.' });
    }

    let createdTests = 0;
    let createdQuestions = 0;
    const createdList = [];

    for (const pkg of testPackages) {
      const tData = pkg.test || pkg;
      const title = (tData.title || 'Импортированный тест').trim();
      const desc = tData.description || '';
      const preview = tData.preview_text || '';
      const lang = (tData.lang === 'ky') ? 'ky' : 'ru';
      const duration = parseInt(tData.duration_minutes || tData.duration || 60, 10) || 60;
      const status = tData.status || 'published';
      const winStart = tData.window_start || null;
      const winEnd = tData.window_end || null;
      const catName = tData.category_name || tData.category_name_ru || tData.category || null;

      const categoryId = await resolveCategoryId(catName, tData.category_id);

      const insTest = await runAsync(
        `INSERT INTO tests (title, description, preview_text, lang, duration_minutes, status, window_start, window_end, category_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()::text) RETURNING id`,
        [title, desc, preview, lang, duration, status, winStart, winEnd, categoryId]
      );
      const testId = insTest.rows?.[0]?.id || insTest.lastID;
      createdTests++;

      const rawQs = pkg.questions || tData.questions || [];
      let qOrdinal = 1;
      for (const q of rawQs) {
        if (!q) continue;
        const qText = (q.text || '').trim();
        const qType = (q.type === 'text') ? 'text' : 'mcq';
        let options = [];
        if (Array.isArray(q.options)) {
          options = q.options;
        } else if (typeof q.options === 'string') {
          try {
            options = q.options.trim().startsWith('[') ? JSON.parse(q.options) : q.options.split('|').map(s => s.trim()).filter(Boolean);
          } catch {
            options = [];
          }
        }
        const correct = q.correct !== undefined && q.correct !== null ? String(q.correct).trim() : '';
        const points = parseInt(q.points || 1, 10) || 1;
        const qLang = q.lang || lang;
        const rawAttachment = (q.attachment_url || q.image_url || '').trim() || null;
        const attachment = await storeAttachmentIfBase64(rawAttachment);
        const ord = parseInt(q.ordinal, 10) || qOrdinal;

        await runAsync(
          `INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id, type, attachment_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [testId, ord, qText, JSON.stringify(options), correct, points, qLang, categoryId, qType, attachment]
        );
        createdQuestions++;
        qOrdinal++;
      }

      createdList.push({ id: testId, title, questions_count: rawQs.length });
    }

    res.json({
      ok: true,
      imported_tests: createdTests,
      imported_questions: createdQuestions,
      tests: createdList
    });
  } catch (e) {
    console.error('import-json error:', e);
    res.status(500).json({ error: e.message || 'Ошибка обработки JSON файла' });
  }
});

// 4. Import questions into an existing test
router.post('/api/admin/tests/:id/import-questions-json', upload.single('file'), async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const test = await getAsync('SELECT id, lang, category_id FROM tests WHERE id = $1', [testId]);
    if (!test) return res.status(404).json({ error: 'Тест не найден' });

    let payload = null;
    if (req.file && req.file.buffer) {
      payload = JSON.parse(req.file.buffer.toString('utf8'));
    } else if (req.body) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    if (!payload) {
      return res.status(400).json({ error: 'Нет данных для импорта' });
    }

    const mode = (payload.mode === 'replace' || req.query.mode === 'replace') ? 'replace' : 'append';
    const rawQs = Array.isArray(payload.questions) ? payload.questions
      : Array.isArray(payload) ? payload
      : (payload.test && Array.isArray(payload.test.questions)) ? payload.test.questions
      : [];

    if (!rawQs.length) {
      return res.status(400).json({ error: 'В файле не найдено вопросов для импорта' });
    }

    if (mode === 'replace') {
      await runAsync('DELETE FROM questions WHERE test_id = $1', [testId]);
    }

    const maxRow = await getAsync('SELECT COALESCE(MAX(ordinal), 0) AS max_ord FROM questions WHERE test_id = $1', [testId]);
    let nextOrd = (parseInt(maxRow?.max_ord, 10) || 0) + 1;

    let imported = 0;
    for (const q of rawQs) {
      if (!q) continue;
      const qText = (q.text || '').trim();
      const qType = (q.type === 'text') ? 'text' : 'mcq';
      let options = [];
      if (Array.isArray(q.options)) {
        options = q.options;
      } else if (typeof q.options === 'string') {
        try {
          options = q.options.trim().startsWith('[') ? JSON.parse(q.options) : q.options.split('|').map(s => s.trim()).filter(Boolean);
        } catch {
          options = [];
        }
      }
      const correct = q.correct !== undefined && q.correct !== null ? String(q.correct).trim() : '';
      const points = parseInt(q.points || 1, 10) || 1;
      const qLang = q.lang || test.lang || 'ru';
      const rawAttachment = (q.attachment_url || q.image_url || '').trim() || null;
      const attachment = await storeAttachmentIfBase64(rawAttachment);
      const ord = (mode === 'replace' && q.ordinal) ? parseInt(q.ordinal, 10) : nextOrd;

      await runAsync(
        `INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id, type, attachment_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [testId, ord, qText, JSON.stringify(options), correct, points, qLang, test.category_id, qType, attachment]
      );
      imported++;
      nextOrd++;
    }

    res.json({ ok: true, test_id: testId, imported_questions: imported, mode });
  } catch (e) {
    console.error('import-questions-json error:', e);
    res.status(500).json({ error: e.message || 'Ошибка импорта вопросов' });
  }
});

// --- Categories CRUD ---
router.get('/api/admin/categories', async (req, res) => {
  try {
    const rows = await allAsync('SELECT * FROM categories ORDER BY id ASC');
    const tests = await allAsync('SELECT category_id FROM tests').catch(() => []);
    const teams = await allAsync('SELECT category_id FROM teams').catch(() => []);
    const testCounts = {};
    const teamCounts = {};
    (tests || []).forEach(t => { if (t.category_id) testCounts[t.category_id] = (testCounts[t.category_id] || 0) + 1; });
    (teams || []).forEach(t => { if (t.category_id) teamCounts[t.category_id] = (teamCounts[t.category_id] || 0) + 1; });

    const enriched = (rows || []).map(c => ({
      ...c,
      tests_count: testCounts[c.id] || 0,
      teams_count: teamCounts[c.id] || 0
    }));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/categories', async (req, res) => {
  try {
    const { name_ru, name_ky, desc_ru, desc_ky } = req.body || {};
    const cleanRu = sanitizeString(name_ru || '', 150);
    const cleanKy = sanitizeString(name_ky || '', 150);

    if (!cleanRu) {
      return res.status(400).json({ error: 'Название категории на русском обязательно' });
    }
    if (!cleanKy) {
      return res.status(400).json({ error: 'Название категории на кыргызском обязательно' });
    }

    const result = await runAsync(
      'INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id',
      [cleanRu, cleanKy, sanitizeString(desc_ru || '', 1000), sanitizeString(desc_ky || '', 1000)]
    );
    res.json({ ok: true, id: result.rows?.[0]?.id || result.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/categories/:id', async (req, res) => {
  try {
    const catId = parseInt(req.params.id, 10);
    if (!catId) return res.status(400).json({ error: 'Некорректный ID категории' });

    const { name_ru, name_ky, desc_ru, desc_ky } = req.body || {};
    const cleanRu = sanitizeString(name_ru || '', 150);
    const cleanKy = sanitizeString(name_ky || '', 150);

    if (!cleanRu) {
      return res.status(400).json({ error: 'Название категории на русском обязательно' });
    }
    if (!cleanKy) {
      return res.status(400).json({ error: 'Название категории на кыргызском обязательно' });
    }

    await runAsync(
      'UPDATE categories SET name_ru=$1, name_ky=$2, desc_ru=$3, desc_ky=$4 WHERE id=$5',
      [cleanRu, cleanKy, sanitizeString(desc_ru || '', 1000), sanitizeString(desc_ky || '', 1000), catId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    const catId = parseInt(req.params.id, 10);
    if (!catId) return res.status(400).json({ error: 'Некорректный ID категории' });

    const testsUsing = await allAsync('SELECT id, title FROM tests WHERE category_id = $1', [catId]).catch(() => []);
    const force = req.query.force === 'true' || req.query.unbind === 'true';

    if (testsUsing && testsUsing.length > 0 && !force) {
      const titles = testsUsing.map((t) => `«${t.title}»`).slice(0, 3).join(', ');
      return res.status(400).json({
        error: `Категория используется в ${testsUsing.length} тест(ах): ${titles}.`,
        hasTests: true,
        testsCount: testsUsing.length,
        testTitles: testsUsing.map((t) => t.title),
      });
    }

    if (testsUsing && testsUsing.length > 0 && force) {
      await runAsync('UPDATE tests SET category_id = NULL WHERE category_id = $1', [catId]).catch(() => {});
    }

    await runAsync('UPDATE teams SET category_id = NULL WHERE category_id = $1', [catId]).catch(() => {});
    await runAsync('UPDATE questions SET category_id = NULL WHERE category_id = $1', [catId]).catch(() => {});

    await runAsync('DELETE FROM categories WHERE id=$1', [catId]);
    res.json({ ok: true, unlinkedTests: force ? testsUsing.length : 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Storage & Backup endpoints ---
router.get('/api/admin/storage/status', async (req, res) => {
  try {
    const participants = await allAsync('SELECT COUNT(*) AS cnt FROM participants').catch(() => [{ cnt: 0 }]);
    const teams = await allAsync('SELECT COUNT(*) AS cnt FROM teams').catch(() => [{ cnt: 0 }]);
    const categories = await allAsync('SELECT COUNT(*) AS cnt FROM categories').catch(() => [{ cnt: 0 }]);
    const tests = await allAsync('SELECT COUNT(*) AS cnt FROM tests').catch(() => [{ cnt: 0 }]);
    const results = await allAsync('SELECT COUNT(*) AS cnt FROM results').catch(() => [{ cnt: 0 }]);

    res.json({
      ok: true,
      persisted: true,
      storage_type: 'postgres',
      store_file: 'Cloud SQL PostgreSQL Database',
      counts: {
        participants: parseInt(participants[0]?.cnt || 0, 10),
        teams: parseInt(teams[0]?.cnt || 0, 10),
        categories: parseInt(categories[0]?.cnt || 0, 10),
        tests: parseInt(tests[0]?.cnt || 0, 10),
        results: parseInt(results[0]?.cnt || 0, 10),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/storage/backup', async (req, res) => {
  try {
    const rawQuestions = await allAsync('SELECT id, test_id, ordinal, text, options, correct, points, category_id, lang, type, attachment_url FROM questions ORDER BY id ASC').catch(() => []);
    
    // Embed question image files as base64 so backup is completely portable
    const imagesMap = {};
    for (const q of rawQuestions) {
      const att = (q.attachment_url || '').trim();
      if (att && att.startsWith('/uploads/')) {
        const filename = path.basename(att);
        try {
          const fileData = await getFileFromDb(filename);
          if (fileData && fileData.buffer) {
            const mime = fileData.mimeType || 'image/png';
            const dataUrl = `data:${mime};base64,` + fileData.buffer.toString('base64');
            imagesMap[filename] = dataUrl;
            q.image_base64 = dataUrl;
          }
        } catch (imgErr) {
          console.warn('Could not encode image into backup:', filename, imgErr.message);
        }
      }
    }

    const tables = {
      categories: await allAsync('SELECT id, name_ru, name_ky, desc_ru, desc_ky, created_at FROM categories ORDER BY id ASC').catch(() => []),
      settings: await allAsync('SELECT id, day1_date, day2_date, day3_date, final_place_ru, final_place_ky, results_published, one_submission_allowed, updated_at FROM settings ORDER BY id ASC').catch(() => []),
      participants: await allAsync('SELECT id, full_name, email, phone, grade, school, city, team_id, category_id, category_confirmed, created_at FROM participants ORDER BY id ASC').catch(() => []),
      teams: await allAsync('SELECT id, team_name, login, password, team_email, email, phone, members, school, city, category_id, created_at FROM teams ORDER BY id ASC').catch(() => []),
      tests: await allAsync('SELECT id, title, description, preview_text, lang, duration_minutes, window_start, window_end, status, category_id, created_at FROM tests ORDER BY id ASC').catch(() => []),
      questions: rawQuestions,
      results: await allAsync('SELECT id, team_id, test_id, score, answers, taken_at, started_at, time_taken_sec FROM results ORDER BY id ASC').catch(() => []),
      test_sessions: await allAsync('SELECT id, team_id, test_id, started_at, status, expires_at FROM test_sessions ORDER BY id ASC').catch(() => []),
      homepage_blocks: await allAsync('SELECT id, block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at FROM homepage_blocks ORDER BY id ASC').catch(() => []),
    };

    const dump = {
      ...tables,
      tables,
      images: imagesMap,
      version: 2,
      database: 'Cloud SQL PostgreSQL',
      exported_at: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="akylman-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeBackupPayload(dump) {
  if (!dump) return null;

  const tables = {
    categories: null,
    settings: null,
    teams: null,
    tests: null,
    questions: null,
    test_sessions: null,
    results: null,
  };

  const mapTableKey = (key) => {
    const k = String(key || '').toLowerCase().trim().replace(/[-_]/g, '');
    if (['categories', 'category', 'cats', 'cat', 'категории', 'категория'].includes(k)) return 'categories';
    if (['settings', 'setting', 'config', 'configuration', 'настройки', 'настройка'].includes(k)) return 'settings';
    if (['teams', 'team', 'commandes', 'commands', 'users', 'participants', 'команды', 'команда'].includes(k)) return 'teams';
    if (['tests', 'test', 'quizzes', 'quiz', 'exams', 'exam', 'тесты', 'тест'].includes(k)) return 'tests';
    if (['questions', 'question', 'quizquestions', 'tasks', 'items', 'вопросы', 'вопрос'].includes(k)) return 'questions';
    if (['testsessions', 'testsession', 'sessions', 'session', 'сессии', 'сессия'].includes(k)) return 'test_sessions';
    if (['results', 'result', 'scores', 'score', 'submissions', 'результаты', 'результат'].includes(k)) return 'results';
    return null;
  };

  // Case 1: dump is an Array of items
  if (Array.isArray(dump)) {
    let handledAsTablesList = false;
    for (const item of dump) {
      if (item && typeof item === 'object') {
        const tblName = (item.table || item.name || item.tableName || '').toLowerCase().trim();
        const rows = item.data || item.rows || item.items || item.records || item.values;
        if (tblName && Array.isArray(rows)) {
          handledAsTablesList = true;
          const mappedKey = mapTableKey(tblName);
          if (mappedKey) tables[mappedKey] = rows;
        }
      }
    }

    if (!handledAsTablesList) {
      const first = dump.find(x => x && typeof x === 'object');
      if (first) {
        if (first.question !== undefined || first.options !== undefined || first.test_id !== undefined || first.choices !== undefined) {
          tables.questions = dump;
        } else if (first.title !== undefined || first.duration_minutes !== undefined || first.preview_text !== undefined || Array.isArray(first.questions)) {
          tables.tests = dump;
        } else if (first.team_name !== undefined || first.team_email !== undefined || first.members !== undefined) {
          tables.teams = dump;
        } else if (first.name_ru !== undefined || first.name_ky !== undefined || first.ru !== undefined || first.ky !== undefined) {
          tables.categories = dump;
        } else if (first.score !== undefined && first.answers !== undefined) {
          tables.results = dump;
        } else if (first.block_key !== undefined) {
          tables.homepage_blocks = dump;
        }
      }
    }
  } else if (typeof dump === 'object') {
    // Case 2: Object wrapper
    let candidate = dump;
    if (candidate.tables && typeof candidate.tables === 'object' && !Array.isArray(candidate.tables)) {
      candidate = candidate.tables;
    } else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) {
      candidate = candidate.data.tables || candidate.data;
    } else if (candidate.backup && typeof candidate.backup === 'object' && !Array.isArray(candidate.backup)) {
      candidate = candidate.backup.tables || candidate.backup;
    } else if (candidate.store && typeof candidate.store === 'object' && !Array.isArray(candidate.store)) {
      candidate = candidate.store.tables || candidate.store;
    } else if (candidate.export && typeof candidate.export === 'object' && !Array.isArray(candidate.export)) {
      candidate = candidate.export.tables || candidate.export;
    } else if (candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)) {
      candidate = candidate.payload.tables || candidate.payload;
    }

    // Direct single test object e.g. { title: "Test 1", questions: [...] }
    if (!candidate.categories && !candidate.tests && !candidate.teams && !candidate.questions && candidate.title && (candidate.questions || candidate.description)) {
      tables.tests = [candidate];
    } else {
      for (const [k, v] of Object.entries(candidate)) {
        const mappedKey = mapTableKey(k);
        if (mappedKey) {
          tables[mappedKey] = v;
        }
      }
    }
  }

  // Extract nested questions from tests if present (e.g. test.questions)
  if (Array.isArray(tables.tests)) {
    const extractedQuestions = [];
    tables.tests.forEach((t, tIdx) => {
      if (t && Array.isArray(t.questions) && t.questions.length > 0) {
        const testId = (t.id !== undefined && !isNaN(parseInt(t.id, 10))) ? parseInt(t.id, 10) : (tIdx + 1);
        t.questions.forEach((q, qIdx) => {
          if (q && typeof q === 'object') {
            extractedQuestions.push({
              ...q,
              test_id: q.test_id || testId,
              ordinal: q.ordinal !== undefined ? q.ordinal : (qIdx + 1),
            });
          }
        });
      }
    });

    if (extractedQuestions.length > 0) {
      if (!Array.isArray(tables.questions)) {
        tables.questions = extractedQuestions;
      } else {
        tables.questions = [...tables.questions, ...extractedQuestions];
      }
    }
  }

  // Extract nested tests from categories if present
  if (Array.isArray(tables.categories)) {
    const extractedTests = [];
    tables.categories.forEach((c, cIdx) => {
      if (c && Array.isArray(c.tests) && c.tests.length > 0) {
        const catId = (c.id !== undefined && !isNaN(parseInt(c.id, 10))) ? parseInt(c.id, 10) : (cIdx + 1);
        c.tests.forEach((t) => {
          if (t && typeof t === 'object') {
            extractedTests.push({
              ...t,
              category_id: t.category_id || catId,
            });
          }
        });
      }
    });

    if (extractedTests.length > 0) {
      if (!Array.isArray(tables.tests)) {
        tables.tests = extractedTests;
      } else {
        tables.tests = [...tables.tests, ...extractedTests];
      }
    }
  }

  const hasAny = Object.values(tables).some(v => v !== null && (Array.isArray(v) || typeof v === 'object'));
  if (!hasAny) return null;
  return tables;
}

router.post('/api/admin/storage/restore', upload.single('file'), async (req, res) => {
  let tempFilePath = req.file?.path;
  try {
    let dump = null;

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        const fileContent = fs.readFileSync(tempFilePath, 'utf8');
        const cleanContent = fileContent.trim().replace(/^\uFEFF/, '');
        dump = JSON.parse(cleanContent);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Не удалось прочитать JSON из загруженного файла: ' + parseErr.message });
      }
    } else if (req.body) {
      if (typeof req.body === 'string') {
        try {
          dump = JSON.parse(req.body.trim().replace(/^\uFEFF/, ''));
        } catch (e) {
          return res.status(400).json({ error: 'Некорректный JSON в теле запроса: ' + e.message });
        }
      } else if (typeof req.body === 'object') {
        dump = req.body;
      }
    }

    if (!dump || typeof dump !== 'object') {
      return res.status(400).json({ error: 'Некорректный формат файла бэкапа: файл пустой' });
    }

    const tables = normalizeBackupPayload(dump);
    if (!tables) {
      return res.status(400).json({ error: 'Некорректный формат файла бэкапа: не найдены таблицы данных (категории, тесты, вопросы, команды или настройки)' });
    }

    // Overwrite mode is default true unless explicitly set to false
    const shouldOverwrite = dump.overwrite !== false && dump.mode !== 'merge' && req.body?.overwrite !== 'false';

    if (shouldOverwrite) {
      // Clear tables in reverse dependency order to prevent FK and unique constraint collisions
      if (tables.results) await runAsync('DELETE FROM results').catch(() => {});
      if (tables.test_sessions) await runAsync('DELETE FROM test_sessions').catch(() => {});
      if (tables.questions) await runAsync('DELETE FROM questions').catch(() => {});
      if (tables.tests) {
        await runAsync('DELETE FROM results').catch(() => {});
        await runAsync('DELETE FROM test_sessions').catch(() => {});
        await runAsync('DELETE FROM questions').catch(() => {});
        await runAsync('DELETE FROM tests').catch(() => {});
      }
      if (tables.teams) {
        await runAsync('DELETE FROM results').catch(() => {});
        await runAsync('DELETE FROM test_sessions').catch(() => {});
        await runAsync('DELETE FROM teams').catch(() => {});
      }
      if (tables.categories) {
        if (!tables.tests) await runAsync('UPDATE tests SET category_id = NULL').catch(() => {});
        if (!tables.teams) await runAsync('UPDATE teams SET category_id = NULL').catch(() => {});
        await runAsync('DELETE FROM categories').catch(() => {});
      }
    }

    // Restore any embedded images to uploads/ directory
    if (dump.images && typeof dump.images === 'object') {
      for (const [filename, dataUrl] of Object.entries(dump.images)) {
        if (!filename || !dataUrl) continue;
        try {
          const match = String(dataUrl).match(/^data:image\/[a-zA-Z0-9+]+;base64,(.+)$/);
          const raw = match ? match[1] : dataUrl;
          const buf = Buffer.from(raw, 'base64');
          const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
          if (buf.length > 0) {
            await saveFileToDb({
              filename: safeName,
              mimeType: 'image/png',
              dataBase64: buf.toString('base64'),
              sizeBytes: buf.length
            }).catch(() => {});
          }
        } catch (imgRestoreErr) {
          console.warn('Failed restoring image from dump:', filename, imgRestoreErr.message);
        }
      }
    }

    const counts = {
      categories: 0,
      settings: 0,
      teams: 0,
      tests: 0,
      questions: 0,
      test_sessions: 0,
      results: 0,
    };
    const warnings = [];

    // Helper to safely reset serial sequences
    const resetSeq = async (tbl) => {
      try {
        const seqRow = await getAsync(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [tbl]);
        if (seqRow && seqRow.seq) {
          await runAsync(
            `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${tbl}), 1), (SELECT COUNT(*) > 0 FROM ${tbl}))`,
            [seqRow.seq]
          );
        }
      } catch (e) {
        console.warn(`Could not reset sequence for ${tbl}:`, e.message);
      }
    };

    // 1. Categories
    if (Array.isArray(tables.categories) && tables.categories.length > 0) {
      for (const c of tables.categories) {
        if (!c) continue;
        const id = (c.id !== undefined && !isNaN(parseInt(c.id, 10))) ? parseInt(c.id, 10) : null;
        const nameRu = String(c.name_ru || c.name || c.title || c.ru || c.category_name || '').trim();
        const nameKy = String(c.name_ky || c.ky || nameRu).trim();
        const descRu = String(c.desc_ru || c.desc || c.description || '').trim();
        const descKy = String(c.desc_ky || '').trim();
        if (!nameRu) continue;
        const createdAt = c.created_at || new Date().toISOString();

        try {
          if (id) {
            await runAsync(
              `INSERT INTO categories (id, name_ru, name_ky, desc_ru, desc_ky, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE SET name_ru=$2, name_ky=$3, desc_ru=$4, desc_ky=$5`,
              [id, nameRu, nameKy, descRu, descKy, createdAt]
            );
          } else {
            await runAsync(
              `INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [nameRu, nameKy, descRu, descKy, createdAt]
            );
          }
          counts.categories++;
        } catch (err) {
          warnings.push(`Категория "${nameRu}": ${err.message}`);
        }
      }
      await resetSeq('categories');
    }

    // 2. Settings (Cleaned without badges)
    const settingsArr = Array.isArray(tables.settings) ? tables.settings : (tables.settings ? [tables.settings] : []);
    if (settingsArr.length > 0 && settingsArr[0]) {
      const s = settingsArr[0];
      try {
        await runAsync(
          `INSERT INTO settings (id, day1_date, day2_date, day3_date, final_place_ru, final_place_ky, results_published, one_submission_allowed, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW()::text)
           ON CONFLICT (id) DO UPDATE SET day1_date=$1, day2_date=$2, day3_date=$3, final_place_ru=$4, final_place_ky=$5, results_published=$6, one_submission_allowed=$7, updated_at=NOW()::text`,
          [
            s.day1_date || null, s.day2_date || null, s.day3_date || null,
            s.final_place_ru || null, s.final_place_ky || null,
            s.results_published ? 1 : 0, s.one_submission_allowed ? 1 : 0
          ]
        );
        counts.settings = 1;
      } catch (err) {
        warnings.push(`Настройки: ${err.message}`);
      }
    }

    // 3. Teams
    if (Array.isArray(tables.teams) && tables.teams.length > 0) {
      for (const t of tables.teams) {
        if (!t) continue;
        const teamName = String(t.team_name || t.name || t.team || t.title || '').trim();
        if (!teamName) continue;
        const id = (t.id !== undefined && !isNaN(parseInt(t.id, 10))) ? parseInt(t.id, 10) : null;
        let membersStr = '[]';
        if (typeof t.members === 'string') {
          membersStr = t.members;
        } else if (Array.isArray(t.members)) {
          membersStr = JSON.stringify(t.members.map(m => typeof m === 'string' ? { name: m, class: '' } : m));
        } else if (Array.isArray(t.participants)) {
          membersStr = JSON.stringify(t.participants.map(m => typeof m === 'string' ? { name: m, class: '' } : m));
        }
        const catId = (t.category_id !== undefined && !isNaN(parseInt(t.category_id, 10))) ? parseInt(t.category_id, 10) : null;
        const login = String(t.login || ('team_' + Math.random().toString(36).substring(2, 10))).trim();
        const rawEmail = String(t.team_email || t.email || t.mail || '').trim().toLowerCase();
        const teamEmail = rawEmail ? rawEmail : null;
        const teamPhone = String(t.phone || t.tel || '').trim();
        const school = t.school || t.branch || t.organization || null;
        const city = t.city || t.region || t.location || null;
        const createdAt = t.created_at || new Date().toISOString();

        try {
          if (id) {
            await runAsync(
              `INSERT INTO teams (id, team_name, login, password, team_email, email, phone, members, school, city, category_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (id) DO UPDATE SET team_name=$2, login=$3, password=$4, team_email=$5, email=$6, phone=$7, members=$8, school=$9, city=$10, category_id=$11`,
              [id, teamName, login, t.password || null, teamEmail, teamEmail, teamPhone || null, membersStr, school, city, catId, createdAt]
            );
          } else {
            await runAsync(
              `INSERT INTO teams (team_name, login, password, team_email, email, phone, members, school, city, category_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [teamName, login, t.password || null, teamEmail, teamEmail, teamPhone || null, membersStr, school, city, catId, createdAt]
            );
          }
          counts.teams++;
        } catch (err) {
          warnings.push(`Команда "${teamName}": ${err.message}`);
        }
      }
      await resetSeq('teams');
    }

    // 4. Tests
    if (Array.isArray(tables.tests) && tables.tests.length > 0) {
      for (const t of tables.tests) {
        if (!t) continue;
        const title = String(t.title || t.name || t.test_name || '').trim();
        if (!title) continue;
        const id = (t.id !== undefined && !isNaN(parseInt(t.id, 10))) ? parseInt(t.id, 10) : null;
        const catId = (t.category_id !== undefined && !isNaN(parseInt(t.category_id, 10))) ? parseInt(t.category_id, 10) : null;
        const dur = (t.duration_minutes !== undefined && !isNaN(parseInt(t.duration_minutes, 10))) ? parseInt(t.duration_minutes, 10) : 60;
        const createdAt = t.created_at || new Date().toISOString();

        try {
          if (id) {
            await runAsync(
              `INSERT INTO tests (id, title, description, preview_text, lang, duration_minutes, window_start, window_end, status, category_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE SET title=$2, description=$3, preview_text=$4, lang=$5, duration_minutes=$6, window_start=$7, window_end=$8, status=$9, category_id=$10`,
              [id, title, t.description || t.desc || '', t.preview_text || t.preview || '', t.lang || 'ru', dur, t.window_start || null, t.window_end || null, t.status || 'published', catId, createdAt]
            );
          } else {
            await runAsync(
              `INSERT INTO tests (title, description, preview_text, lang, duration_minutes, window_start, window_end, status, category_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [title, t.description || t.desc || '', t.preview_text || t.preview || '', t.lang || 'ru', dur, t.window_start || null, t.window_end || null, t.status || 'published', catId, createdAt]
            );
          }
          counts.tests++;
        } catch (err) {
          warnings.push(`Тест "${title}": ${err.message}`);
        }
      }
      await resetSeq('tests');
    }

    // 5. Questions
    if (Array.isArray(tables.questions) && tables.questions.length > 0) {
      for (const q of tables.questions) {
        if (!q) continue;
        const testId = (q.test_id !== undefined && !isNaN(parseInt(q.test_id, 10))) ? parseInt(q.test_id, 10) : 1;
        const text = String(q.text || q.question || q.title || q.prompt || '').trim();
        if (!text) continue;
        const id = (q.id !== undefined && !isNaN(parseInt(q.id, 10))) ? parseInt(q.id, 10) : null;
        const ord = (q.ordinal !== undefined && !isNaN(parseInt(q.ordinal, 10))) ? parseInt(q.ordinal, 10) : (counts.questions + 1);

        let optsArr = [];
        if (Array.isArray(q.options)) {
          optsArr = q.options;
        } else if (Array.isArray(q.variants)) {
          optsArr = q.variants;
        } else if (Array.isArray(q.choices)) {
          optsArr = q.choices;
        } else if (Array.isArray(q.answers)) {
          optsArr = q.answers.map(a => (a && typeof a === 'object') ? (a.text || a.answer || a.variant || '') : String(a || ''));
        } else if (q.options && typeof q.options === 'object') {
          optsArr = Object.values(q.options);
        } else if (typeof q.options === 'string') {
          try {
            const parsed = JSON.parse(q.options);
            if (Array.isArray(parsed)) optsArr = parsed;
            else optsArr = [q.options];
          } catch {
            optsArr = q.options.split('|').map(s => s.trim()).filter(Boolean);
          }
        }
        const optsStr = JSON.stringify(optsArr);

        let correct = q.correct !== undefined ? String(q.correct)
          : (q.answer !== undefined ? String(q.answer)
          : (q.correct_answer !== undefined ? String(q.correct_answer)
          : (q.right_answer !== undefined ? String(q.right_answer) : '0')));

        // If correct is a letter like 'A', 'B', 'C', 'D'
        if (/^[A-D]$/i.test(correct)) {
          correct = String(correct.toUpperCase().charCodeAt(0) - 65);
        }

        const pts = (q.points !== undefined && !isNaN(parseInt(q.points, 10))) ? parseInt(q.points, 10) : 1;
        const catId = (q.category_id !== undefined && !isNaN(parseInt(q.category_id, 10))) ? parseInt(q.category_id, 10) : null;
        
        // Handle embedded image in question
        let attachmentUrl = (q.attachment_url || q.image_url || q.image || q.img || q.photo || '').trim() || null;
        if (q.image_base64 || q.image_data) {
          try {
            const dataUrl = q.image_base64 || q.image_data;
            const match = String(dataUrl).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            const ext = match ? (match[1].toLowerCase() === 'jpeg' ? '.jpg' : '.' + match[1].toLowerCase()) : '.png';
            const raw = match ? match[2] : dataUrl;
            const buf = Buffer.from(raw, 'base64');
            const safeName = 'qimg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;
            if (buf.length > 0) {
              await saveFileToDb({
                filename: safeName,
                mimeType: ext === '.jpg' ? 'image/jpeg' : 'image/' + ext.replace('.', ''),
                dataBase64: buf.toString('base64'),
                sizeBytes: buf.length
              }).catch(() => {});
              attachmentUrl = '/uploads/' + safeName;
            }
          } catch (e) {
            console.warn('Failed saving question base64 image on restore:', e.message);
          }
        }

        const qType = (q.type === 'text' || (optsArr.length === 0 && (!q.options || q.options.length === 0))) ? 'text' : 'mcq';

        try {
          if (id) {
            await runAsync(
              `INSERT INTO questions (id, test_id, ordinal, text, options, correct, points, lang, type, attachment_url, category_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE SET test_id=$2, ordinal=$3, text=$4, options=$5, correct=$6, points=$7, lang=$8, type=$9, attachment_url=$10, category_id=$11`,
              [id, testId, ord, text, optsStr, correct, pts, q.lang || 'ru', qType, attachmentUrl, catId]
            );
          } else {
            await runAsync(
              `INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, type, attachment_url, category_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [testId, ord, text, optsStr, correct, pts, q.lang || 'ru', qType, attachmentUrl, catId]
            );
          }
          counts.questions++;
        } catch (err) {
          warnings.push(`Вопрос ID ${id || 'новый'} (тест ${testId}): ${err.message}`);
        }
      }
      await resetSeq('questions');
    }

    // 7. Test Sessions
    if (Array.isArray(tables.test_sessions) && tables.test_sessions.length > 0) {
      for (const s of tables.test_sessions) {
        if (!s) continue;
        const teamId = (s.team_id !== undefined && !isNaN(parseInt(s.team_id, 10))) ? parseInt(s.team_id, 10) : null;
        const testId = (s.test_id !== undefined && !isNaN(parseInt(s.test_id, 10))) ? parseInt(s.test_id, 10) : null;
        if (!teamId || !testId) continue;
        const id = (s.id !== undefined && !isNaN(parseInt(s.id, 10))) ? parseInt(s.id, 10) : null;

        try {
          if (id) {
            await runAsync(
              `INSERT INTO test_sessions (id, team_id, test_id, started_at, status, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE SET team_id=$2, test_id=$3, started_at=$4, status=$5, expires_at=$6`,
              [id, teamId, testId, s.started_at || null, s.status || 'in_progress', s.expires_at || null]
            );
          } else {
            await runAsync(
              `INSERT INTO test_sessions (team_id, test_id, started_at, status, expires_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [teamId, testId, s.started_at || null, s.status || 'in_progress', s.expires_at || null]
            );
          }
          counts.test_sessions++;
        } catch (err) {
          warnings.push(`Сессия ${id || teamId}: ${err.message}`);
        }
      }
      await resetSeq('test_sessions');
    }

    // 8. Results
    if (Array.isArray(tables.results) && tables.results.length > 0) {
      for (const r of tables.results) {
        if (!r) continue;
        const teamId = (r.team_id !== undefined && !isNaN(parseInt(r.team_id, 10))) ? parseInt(r.team_id, 10) : null;
        const testId = (r.test_id !== undefined && !isNaN(parseInt(r.test_id, 10))) ? parseInt(r.test_id, 10) : null;
        if (!teamId || !testId) continue;
        const id = (r.id !== undefined && !isNaN(parseInt(r.id, 10))) ? parseInt(r.id, 10) : null;
        const score = (r.score !== undefined && !isNaN(parseInt(r.score, 10))) ? parseInt(r.score, 10) : 0;
        const ansStr = typeof r.answers === 'string' ? r.answers : JSON.stringify(r.answers || []);
        const timeSec = (r.time_taken_sec !== undefined && !isNaN(parseInt(r.time_taken_sec, 10))) ? parseInt(r.time_taken_sec, 10) : null;
        const takenAt = r.taken_at || new Date().toISOString();

        try {
          if (id) {
            await runAsync(
              `INSERT INTO results (id, team_id, test_id, score, answers, taken_at, started_at, time_taken_sec)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO UPDATE SET team_id=$2, test_id=$3, score=$4, answers=$5, taken_at=$6, started_at=$7, time_taken_sec=$8`,
              [id, teamId, testId, score, ansStr, takenAt, r.started_at || null, timeSec]
            );
          } else {
            await runAsync(
              `INSERT INTO results (team_id, test_id, score, answers, taken_at, started_at, time_taken_sec)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [teamId, testId, score, ansStr, takenAt, r.started_at || null, timeSec]
            );
          }
          counts.results++;
        } catch (err) {
          warnings.push(`Результат ${id || teamId}: ${err.message}`);
        }
      }
      await resetSeq('results');
    }

    // 9. Homepage Blocks
    if (Array.isArray(tables.homepage_blocks) && tables.homepage_blocks.length > 0) {
      await runAsync(`CREATE TABLE IF NOT EXISTS homepage_blocks (
        id SERIAL PRIMARY KEY,
        block_key TEXT UNIQUE,
        badge_en TEXT DEFAULT '',
        badge_ky TEXT DEFAULT '',
        badge_ru TEXT DEFAULT '',
        title_en TEXT DEFAULT '',
        title_ky TEXT DEFAULT '',
        title_ru TEXT DEFAULT '',
        content_en TEXT DEFAULT '',
        content_ky TEXT DEFAULT '',
        content_ru TEXT DEFAULT '',
        updated_at TEXT
      )`).catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_en TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ky TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ru TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_en TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ky TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ru TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_en TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ky TEXT DEFAULT \'\'').catch(() => {});
      await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ru TEXT DEFAULT \'\'').catch(() => {});

      for (const b of tables.homepage_blocks) {
        if (!b || !b.block_key) continue;
        try {
          const badge_en = b.badge_en ?? b.badge_ru ?? '';
          const badge_ky = b.badge_ky ?? '';
          const badge_ru = b.badge_ru ?? b.badge_en ?? '';
          const title_en = b.title_en ?? b.title_ru ?? '';
          const title_ky = b.title_ky ?? '';
          const title_ru = b.title_ru ?? b.title_en ?? '';
          const content_en = b.content_en ?? b.content_ru ?? '';
          const content_ky = b.content_ky ?? '';
          const content_ru = b.content_ru ?? b.content_en ?? '';

          const exists = await getAsync('SELECT id FROM homepage_blocks WHERE block_key = $1', [b.block_key]);
          if (exists) {
            await runAsync(
              `UPDATE homepage_blocks
               SET badge_en = $1, badge_ky = $2, badge_ru = $3,
                   title_en = $4, title_ky = $5, title_ru = $6,
                   content_en = $7, content_ky = $8, content_ru = $9,
                   updated_at = NOW()
               WHERE block_key = $10`,
              [badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, b.block_key]
            );
          } else {
            await runAsync(
              `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
              [b.block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru]
            );
          }
          counts.homepage_blocks++;
        } catch (err) {
          warnings.push(`Блок сайта ${b.block_key}: ${err.message}`);
        }
      }
    }

    const summaryParts = [];
    if (counts.categories) summaryParts.push(`${counts.categories} категорий`);
    if (counts.tests) summaryParts.push(`${counts.tests} тестов`);
    if (counts.questions) summaryParts.push(`${counts.questions} вопросов`);
    if (counts.teams) summaryParts.push(`${counts.teams} команд`);
    if (counts.results) summaryParts.push(`${counts.results} результатов`);
    if (counts.homepage_blocks) summaryParts.push(`${counts.homepage_blocks} блоков сайта`);
    if (counts.settings) summaryParts.push(`настройки`);

    const summaryMsg = summaryParts.length > 0
      ? `Успешно восстановлено в Cloud SQL: ${summaryParts.join(', ')}`
      : 'База данных успешно обновлена из резервной копии';

    return res.json({ ok: true, message: summaryMsg, counts, warnings: warnings.slice(0, 10) });
  } catch (e) {
    console.error('Error restoring backup:', e);
    res.status(500).json({ error: e.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
});

// --- Participants ---
router.get('/api/admin/participants', async (req, res) => {
  try {
    const participants = await allAsync(
      `SELECT 
         p.id,
         p.full_name,
         p.email,
         p.phone,
         p.grade,
         p.school,
         p.city,
         p.team_id,
         p.category_id,
         p.category_confirmed,
         p.created_at,
         t.team_name,
         t.invite_code,
         t.school AS team_school,
         c.name_ru AS category_name_ru,
         c.name_ky AS category_name_ky
       FROM participants p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.id DESC`
    );

    const formatted = (participants || []).map((p) => {
      let createdAtFormatted = '';
      if (p.created_at) {
        try {
          const d = new Date(p.created_at);
          if (!isNaN(d.getTime())) {
            createdAtFormatted = d.toLocaleString('ru-RU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          } else {
            createdAtFormatted = String(p.created_at);
          }
        } catch {
          createdAtFormatted = String(p.created_at);
        }
      }

      return {
        ...p,
        branch: p.school || p.city || '—',
        grade: p.grade || '—',
        team_name: p.team_name || null,
        category_name: p.category_name_ru || (p.category_id ? `Категория #${p.category_id}` : 'Не выбрана'),
        category_name_ky: p.category_name_ky || '',
        created_at_formatted: createdAtFormatted || '—',
      };
    });

    res.json(formatted);
  } catch (e) {
    console.error('Error fetching participants:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/participants/:id', async (req, res) => {
  try {
    const participantId = parseInt(req.params.id, 10);
    if (!participantId) return res.status(400).json({ error: 'Неверный ID участника' });

    await runAsync('UPDATE results SET participant_id = NULL WHERE participant_id = $1', [participantId]).catch(() => {});
    await runAsync('DELETE FROM participants WHERE id = $1', [participantId]);

    console.log(`✓ Participant ${participantId} deleted successfully`);
    res.json({ ok: true, message: 'Участник успешно удален' });
  } catch (e) {
    console.error('Error deleting participant:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/reset-participants', async (req, res) => {
  try {
    await runAsync('UPDATE results SET participant_id = NULL').catch(() => {});
    await runAsync('DELETE FROM participants');
    const pool = getDbPool();
    if (pool) {
      await pool.query("SELECT setval(pg_get_serial_sequence('participants', 'id'), 1, false)").catch(() => {});
      await pool.query("SELECT setval('participants_id_seq', 1, false)").catch(() => {});
    } else {
      await runAsync("SELECT setval('participants_id_seq', 1, false)", []).catch(() => {});
    }
    console.log('✓ All participants reset successfully');
    res.json({ ok: true, message: 'Все участники удалены. Нумерация сброшена с 1.' });
  } catch (e) {
    console.error('Error resetting participants:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/participants/export-csv', async (req, res) => {
  try {
    const participants = await allAsync(
      `SELECT 
         p.id,
         p.full_name,
         p.email,
         p.phone,
         p.grade,
         p.school,
         p.city,
         p.team_id,
         p.category_id,
         p.category_confirmed,
         p.created_at,
         t.team_name,
         c.name_ru AS category_name_ru
       FROM participants p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.id ASC`
    );

    const header = [
      '№',
      'ID',
      'ФИО участника',
      'Email',
      'Телефон',
      'Филиал / Школа',
      'Класс',
      'Команда',
      'Категория',
      'Статус категории',
      'Дата регистрации'
    ].map(toCsvValue).join(',');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    setSafeContentDisposition(res, 'participants_export.csv', 'Участники_Akylman.csv');

    if (!participants?.length) {
      return res.send('\ufeff' + header + '\n');
    }

    const lines = participants.map((p, i) => {
      let createdAtStr = '';
      if (p.created_at) {
        try {
          const d = new Date(p.created_at);
          createdAtStr = isNaN(d.getTime()) ? String(p.created_at) : d.toLocaleString('ru-RU');
        } catch {
          createdAtStr = String(p.created_at);
        }
      }

      return [
        i + 1,
        p.id,
        p.full_name || '',
        p.email || '',
        p.phone || '',
        p.school || p.city || '',
        p.grade ? `${p.grade} класс` : '',
        p.team_name || 'Без команды',
        p.category_name_ru || (p.category_id ? `ID #${p.category_id}` : 'Не выбрана'),
        p.category_confirmed ? 'Подтверждена' : 'Не подтверждена',
        createdAtStr
      ].map(toCsvValue).join(',');
    });

    res.send('\ufeff' + header + '\n' + lines.join('\n'));
  } catch (e) {
    console.error('Error exporting participants CSV:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Teams ---
router.get('/api/admin/teams', async (req, res) => {
  try {
    const teams = await allAsync(
      `SELECT t.id, t.team_name, t.team_email, t.email, t.phone, t.members, t.school, t.city, t.category_id, t.created_at, c.name_ru AS category_name_ru
       FROM teams t
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.id DESC`
    );
    const formatted = (teams || []).map((t) => {
      let membersList = [];
      try { membersList = JSON.parse(t.members || '[]'); } catch { membersList = []; }
      if (!Array.isArray(membersList)) membersList = [];
      const membersStr = membersList.map(m => m.name ? (m.class ? `${m.name} (${m.class})` : m.name) : '').filter(Boolean).join(', ');
      return {
        ...t,
        team_email: t.team_email || t.email || '',
        email: t.team_email || t.email || '',
        members: membersList,
        members_str: membersStr,
        branch: t.school || t.city || 'Талас',
        category_name: t.category_name_ru || 'Основная',
      };
    });
    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/reset-teams', async (req, res) => {
  try {
    const pool = getDbPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM test_sessions');
        await client.query('DELETE FROM results');
        await client.query('DELETE FROM password_reset_codes');
        await client.query('DELETE FROM teams');
        await client.query('COMMIT');

        // Reset sequences AFTER commit using setval, avoiding ALTER SEQUENCE ownership errors
        try {
          await client.query("SELECT setval(pg_get_serial_sequence('teams', 'id'), 1, false)").catch(() => {});
          await client.query("SELECT setval('teams_id_seq', 1, false)").catch(() => {});
          await client.query("SELECT setval(pg_get_serial_sequence('results', 'id'), 1, false)").catch(() => {});
          await client.query("SELECT setval('results_id_seq', 1, false)").catch(() => {});
          await client.query("SELECT setval(pg_get_serial_sequence('test_sessions', 'id'), 1, false)").catch(() => {});
          await client.query("SELECT setval('test_sessions_id_seq', 1, false)").catch(() => {});
        } catch (seqErr) {
          console.warn('Notice resetting sequences:', seqErr.message);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      await runAsync('DELETE FROM test_sessions', []);
      await runAsync('DELETE FROM results', []);
      await runAsync('DELETE FROM password_reset_codes', []);
      await runAsync('DELETE FROM teams', []);
      await runAsync("SELECT setval('teams_id_seq', 1, false)", []).catch(() => {});
    }
    console.log('✓ All teams, test_sessions, and results reset successfully in Cloud SQL');
    res.json({ ok: true, message: 'Все команды и их результаты удалены. Нумерация сброшена с 1.' });
  } catch (e) {
    console.error('Error resetting teams:', e);
    res.status(500).json({ error: e.message });
  }
});

// Reset categories only
router.post('/api/admin/reset-categories', async (req, res) => {
  try {
    const pool = getDbPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE tests SET category_id = NULL');
        await client.query('UPDATE questions SET category_id = NULL');
        await client.query('UPDATE teams SET category_id = NULL');
        await client.query('DELETE FROM categories');
        await client.query('COMMIT');

        try {
          await client.query("SELECT setval(pg_get_serial_sequence('categories', 'id'), 1, false)").catch(() => {});
          await client.query("SELECT setval('categories_id_seq', 1, false)").catch(() => {});
        } catch (seqErr) {
          console.warn('Notice resetting categories sequence:', seqErr.message);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      await runAsync('UPDATE tests SET category_id = NULL', []);
      await runAsync('UPDATE questions SET category_id = NULL', []);
      await runAsync('UPDATE teams SET category_id = NULL', []);
      await runAsync('DELETE FROM categories', []);
      await runAsync("SELECT setval('categories_id_seq', 1, false)", []).catch(() => {});
    }
    console.log('✓ All categories reset successfully in Cloud SQL');
    res.json({ ok: true, message: 'Все категории удалены. Нумерация категорий сброшена с 1.' });
  } catch (e) {
    console.error('Error resetting categories:', e);
    res.status(500).json({ error: e.message });
  }
});

// Danger Zone: Complete system wipe (teams, categories, tests, questions, results)
router.post('/api/admin/danger/wipe-all', async (req, res) => {
  try {
    const pool = getDbPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM test_sessions');
        await client.query('DELETE FROM results');
        await client.query('DELETE FROM questions');
        await client.query('DELETE FROM tests');
        await client.query('DELETE FROM password_reset_codes');
        await client.query('DELETE FROM teams');
        await client.query('DELETE FROM categories');
        await client.query('COMMIT');

        // Safe sequence resets using setval done AFTER commit so they never fail the wipe
        try {
          const seqs = [
            'teams_id_seq', 'categories_id_seq', 'tests_id_seq',
            'questions_id_seq', 'results_id_seq', 'test_sessions_id_seq',
            'password_reset_codes_id_seq'
          ];
          for (const s of seqs) {
            await client.query(`SELECT setval('${s}', 1, false)`).catch(() => {});
          }
        } catch (seqErr) {
          console.warn('Notice resetting sequences:', seqErr.message);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      await runAsync('DELETE FROM test_sessions', []);
      await runAsync('DELETE FROM results', []);
      await runAsync('DELETE FROM questions', []);
      await runAsync('DELETE FROM tests', []);
      await runAsync('DELETE FROM password_reset_codes', []);
      await runAsync('DELETE FROM teams', []);
      await runAsync('DELETE FROM categories', []);
      await runAsync("SELECT setval('teams_id_seq', 1, false)", []).catch(() => {});
      await runAsync("SELECT setval('categories_id_seq', 1, false)", []).catch(() => {});
    }
    console.log('✓ Danger zone wipe-all executed: all tables cleared and sequences reset');
    res.json({ ok: true, message: 'Вся система очищена: команды, категории, тесты, вопросы и результаты удалены. База данных полностью чиста.' });
  } catch (e) {
    console.error('Error wiping system:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/teams/:id', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    if (!teamId) return res.status(400).json({ error: 'Неверный ID команды' });
    const pool = getDbPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE team_id = $1)', [teamId]);
        await client.query('DELETE FROM support_tickets WHERE team_id = $1', [teamId]);
        await client.query('DELETE FROM test_sessions WHERE team_id = $1', [teamId]);
        await client.query('DELETE FROM results WHERE team_id = $1', [teamId]);
        await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      await runAsync('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE team_id = $1)', [teamId]);
      await runAsync('DELETE FROM support_tickets WHERE team_id = $1', [teamId]);
      await runAsync('DELETE FROM test_sessions WHERE team_id = $1', [teamId]);
      await runAsync('DELETE FROM results WHERE team_id = $1', [teamId]);
      await runAsync('DELETE FROM teams WHERE id = $1', [teamId]);
    }
    console.log(`✓ Team ${teamId} and associated records deleted successfully from Cloud SQL`);
    res.json({ ok: true, message: 'Команда успешно удалена' });
  } catch (e) {
    console.error('Error deleting team:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/results/:id', async (req, res) => {
  try {
    const resId = parseInt(req.params.id, 10);
    if (!resId) return res.status(400).json({ error: 'Неверный ID результата' });
    await runAsync('DELETE FROM results WHERE id = $1', [resId]);
    res.json({ ok: true, message: 'Результат удален' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/teams/export-csv', async (req, res) => {
  try {
    const teams = await allAsync(
      `SELECT t.id, t.team_name, t.team_email, t.email, t.phone, t.members, t.school, t.city, t.created_at, c.name_ru AS category_name_ru
       FROM teams t LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.id ASC`
    );
    const header = ['№', 'ID', 'Название команды', 'Email команды', 'Участники', 'Школа / Организация', 'Город / Регион', 'Категория', 'Дата регистрации'].map(toCsvValue).join(',');
    if (!teams?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="teams_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = teams.map((t, i) => {
      let membersList = [];
      try { membersList = JSON.parse(t.members || '[]'); } catch { membersList = []; }
      if (!Array.isArray(membersList)) membersList = [];
      const membersStr = membersList.map(m => m.name ? (m.class ? `${m.name} (${m.class})` : m.name) : '').filter(Boolean).join(', ');
      return [
        i + 1,
        t.id,
        t.team_name || '',
        t.team_email || t.email || '',
        membersStr,
        t.school || '',
        t.city || '',
        t.category_name_ru || 'Без категории',
        t.created_at || ''
      ].map(toCsvValue).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="teams_export.csv"');
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import Teams from CSV (No captain column, uses Участники)
router.post('/api/admin/teams/import-csv', upload.single('file'), async (req, res) => {
  try {
    const fileBuffer = req.file?.buffer;
    const rawContent = fileBuffer ? fileBuffer.toString('utf-8') : (req.body?.csv_data || '');
    if (!rawContent || !rawContent.trim()) {
      return res.status(400).json({ error: 'Файл CSV пуст или не передан' });
    }

    const rows = parseCsv(rawContent);
    if (!rows || rows.length < 2) {
      return res.status(400).json({ error: 'Файл CSV не содержит строк с данными' });
    }

    const header = rows.shift().map(h => String(h || '').trim().toLowerCase());
    
    // Find column indexes
    const findCol = (...keywords) => {
      return header.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const idxName = findCol('название', 'команда', 'team_name', 'name');
    const idxEmail = findCol('email', 'почта', 'mail');
    const idxPhone = findCol('телефон', 'phone', 'номер', 'тел');
    const idxMembers = findCol('участник', 'состав', 'members', 'катышуучу');
    const idxSchool = findCol('школа', 'организац', 'филиал', 'school', 'branch');
    const idxCity = findCol('город', 'регион', 'city');
    const idxCategory = findCol('категори', 'category');
    const idxPassword = findCol('пароль', 'password');

    if (idxName === -1 && idxEmail === -1) {
      return res.status(400).json({ error: 'В CSV не найдены обязательные колонки: Название команды или Email команды' });
    }

    const bcrypt = require('bcryptjs');
    const existingCategories = await allAsync('SELECT id, name_ru FROM categories');
    let imported = 0;
    const warnings = [];

    for (let rIndex = 0; rIndex < rows.length; rIndex++) {
      const row = rows[rIndex];
      if (!row || !row.length || row.every(c => !String(c || '').trim())) continue;

      const teamName = String(row[idxName] || '').trim();
      const teamEmail = String(row[idxEmail] || '').trim().toLowerCase();
      if (!teamName && !teamEmail) continue;

      const phone = idxPhone !== -1 ? String(row[idxPhone] || '').trim() : '';
      const membersRaw = idxMembers !== -1 ? String(row[idxMembers] || '').trim() : '';
      const school = idxSchool !== -1 ? String(row[idxSchool] || '').trim() : '';
      const city = idxCity !== -1 ? String(row[idxCity] || '').trim() : school;
      const catRaw = idxCategory !== -1 ? String(row[idxCategory] || '').trim() : '';
      const passRaw = idxPassword !== -1 ? String(row[idxPassword] || '').trim() : 'Quiz2025!';

      // Parse members list from string
      // Supports formats: "Асанов Асан (10-А), Бакиров Бакыт (10-Б)" or "Асанов Асан, Бакиров Бакыт"
      const membersList = [];
      if (membersRaw) {
        const parts = membersRaw.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          const match = p.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
          if (match) {
            membersList.push({ name: match[1].trim(), class: (match[2] || '').trim() });
          } else {
            membersList.push({ name: p, class: '' });
          }
        }
      }

      // Match category
      let categoryId = null;
      if (catRaw) {
        const found = existingCategories.find(c =>
          c.name_ru.toLowerCase().includes(catRaw.toLowerCase()) ||
          catRaw.toLowerCase().includes(c.name_ru.toLowerCase()) ||
          String(c.id) === catRaw
        );
        if (found) categoryId = found.id;
      }

      const randomLogin = 'team_' + Math.random().toString(36).substring(2, 12);
      const effectiveEmail = teamEmail || (`team_${Date.now()}_${Math.floor(Math.random()*1000)}@quiz.local`);
      const hashedPassword = await bcrypt.hash(passRaw || 'Quiz2025!', 10);

      try {
        await runAsync(
          `INSERT INTO teams (team_name, login, password, team_email, email, phone, members, school, city, category_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
          [
            teamName || 'Команда',
            randomLogin,
            hashedPassword,
            effectiveEmail,
            effectiveEmail,
            phone,
            JSON.stringify(membersList),
            school,
            city,
            categoryId
          ]
        );
        imported++;
      } catch (insertErr) {
        warnings.push(`Строка ${rIndex + 2} (${teamName}): ${insertErr.message}`);
      }
    }

    res.json({ ok: true, imported, warnings });
  } catch (err) {
    console.error('Import teams CSV error:', err);
    res.status(500).json({ error: err.message });
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
    setSafeContentDisposition(res, `results_team_${teamId}.csv`, `results_${team.team_name}.csv`);
    res.send('\ufeff' + header + '\n' + rows.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export ALL questions across all tests to CSV
router.get('/api/admin/tests/questions/export-all-csv', async (req, res) => {
  try {
    const qs = await allAsync(
      `SELECT q.id, q.test_id, t.title AS test_title, q.ordinal, q.text, q.options, q.correct, q.points, q.type, q.attachment_url, q.lang, c.name_ru AS category_name
       FROM questions q
       LEFT JOIN tests t ON t.id = q.test_id
       LEFT JOIN categories c ON c.id = q.category_id OR c.id = t.category_id
       ORDER BY q.test_id ASC, q.ordinal ASC`
    );
    const header = ['ID вопроса', 'ID теста', 'Название теста', '№', 'Текст вопроса', 'Тип вопроса', 'Варианты ответов', 'Правильный ответ', 'Баллы', 'Изображение (URL)', 'Категория', 'Язык'].map(toCsvValue).join(',');
    if (!qs?.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="all_questions_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = qs.map((q) => {
      let optsStr = '';
      try {
        const parsed = JSON.parse(q.options || '[]');
        if (Array.isArray(parsed)) optsStr = parsed.join(' | ');
        else optsStr = String(q.options || '');
      } catch {
        optsStr = String(q.options || '');
      }
      const qType = q.type === 'text' ? 'Открытый' : 'Закрытый (MCQ)';
      return [
        q.id,
        q.test_id || '',
        q.test_title || '',
        q.ordinal || 1,
        q.text || '',
        qType,
        optsStr,
        q.correct || '',
        q.points || 1,
        q.attachment_url || '',
        q.category_name || '',
        q.lang || 'ru'
      ].map(toCsvValue).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="all_questions_export.csv"');
    res.send('\ufeff' + header + '\n' + lines.join('\n'));
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

function setSafeContentDisposition(res, defaultFilename, utf8Filename) {
  const asciiFallback = (defaultFilename || 'export.csv').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  const encodedUtf8 = encodeURIComponent(utf8Filename || defaultFilename);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`);
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

// --- Homepage Blocks Management ---
const DEFAULT_HOMEPAGE_BLOCKS = [
  {
    block_key: 'stage_1',
    badge_en: 'Round 1',
    badge_ky: 'Раунд 1',
    badge_ru: 'Раунд 1',
    title_en: 'Preliminary Round',
    title_ky: 'Алгачкы раунд',
    title_ru: 'Предварительный раунд',
    content_en: 'Online test: multiple choice and short answer questions',
    content_ky: 'Онлайн-тест: бир нече тандоо жана кыска жооп',
    content_ru: 'Онлайн-тест: множественный выбор и короткий ответ'
  },
  {
    block_key: 'stage_2',
    badge_en: 'Round 2',
    badge_ky: 'Раунд 2',
    badge_ru: 'Раунд 2',
    title_en: 'Semifinal',
    title_ky: 'Жарым финал',
    title_ru: 'Полуфинал',
    content_en: 'Live blitz questions in real time',
    content_ky: 'Реалдуу убакыт режиминде түз блиц-суроолор',
    content_ru: 'Живые блиц-вопросы в режиме реального времени'
  },
  {
    block_key: 'stage_3',
    badge_en: 'Grand Final',
    badge_ky: 'Гранд-Финал',
    badge_ru: 'Гранд-Финал',
    title_en: 'Final',
    title_ky: 'Финал',
    title_ru: 'Финал',
    content_en: 'Final concluding round with top qualifying teams',
    content_ky: 'Эң мыкты командалар менен финалдык раунд',
    content_ru: 'Финальный раунд с лучшими командами'
  },
  {
    block_key: 'team_composition',
    badge_en: '01',
    badge_ky: '01',
    badge_ru: '01',
    title_en: 'Team Roster',
    title_ky: 'Команданын курамы',
    title_ru: 'О составе команды',
    content_en: '2–4 students from the same school',
    content_ky: 'Бир мектептен 2–4 адам',
    content_ru: '2–4 человека из одной школы'
  },
  {
    block_key: 'categories_info',
    badge_en: '02',
    badge_ky: '02',
    badge_ru: '02',
    title_en: 'Categories',
    title_ky: 'Категориялар',
    title_ru: 'Категории',
    content_en: 'Olympiad disciplines across subjects and academic tracks',
    content_ky: 'Предметтер жана багыттар боюнча олимпиадалык сабактар',
    content_ru: 'Дисциплины олимпиады по предметам и направлениям'
  },
  {
    block_key: 'format_info',
    badge_en: '03',
    badge_ky: '03',
    badge_ru: '03',
    title_en: 'Tournament Format',
    title_ky: 'Форматы',
    title_ru: 'Формат',
    content_en: 'Stages 1 and 2 are held online. Stage 3 (Final) is held offline at Akylman Presidential Lyceum.',
    content_ky: '1 жана 2-этаптар онлайн форматта өткөрүлөт. Үчүнчү этап оффлайн форматта өтөт.',
    content_ru: 'Этапы 1 и 2 проводятся в онлайн-формате. Третий этап проводится в оффлайн-формате.'
  },
  {
    block_key: 'timeline_stage1',
    badge_en: '🌐 Online Round',
    badge_ky: '🌐 Онлайн-тур',
    badge_ru: '🌐 Онлайн-тур',
    title_en: 'Stage 1 - Preliminary Round',
    title_ky: '1-этап - Тандоо туру',
    title_ru: 'Этап 1 - Отборочный тур',
    content_en: 'Teams take an online test in selected categories with multiple-choice and short-answer questions. Results determine teams advancing to the next round.',
    content_ky: 'Бул этапта командалар тандалган категориялар боюнча онлайн тестирлөөдөн өтүшөт. Катышуучулар бир нече тандоо жана кыска жооптуу суроолорго жооп беришет. Бул этаптын жыйынтыгы боюнча кийинки раундга чыга турган командалар аныкталат.',
    content_ru: 'На этом этапе команды проходят онлайн-тестирование по выбранным категориям. Участники отвечают на вопросы с множественным выбором и короткими ответами. По результатам этого этапа определяются команды, которые пройдут в следующий раунд.'
  },
  {
    block_key: 'timeline_stage2',
    badge_en: '⚡ Semifinal • Online',
    badge_ky: '⚡ Жарым финал • Онлайн',
    badge_ru: '⚡ Полуфинал • Онлайн',
    title_en: 'Stage 2 - Semifinal',
    title_ky: '2-этап - Жарым финал',
    title_ru: 'Этап 2 - Полуфинал',
    content_en: 'This stage highlights the best teams among successful qualifiers. Teams compete in real time with challenging blitz questions across various domains.',
    content_ky: 'Бул этап ийгиликтүү командалардын арасынан эң мыктыларды аныктайт. Бул этапта татаалыраак суроолор камтылган онлайн тестирлөө өткөрүлөт. Командалар билимдин ар кандай категориялары боюнча блиц-суроолорго реалдуу убакытта жооп берип күч сынашышат.',
    content_ru: 'Этап выявляет лучшие команды среди уже успешных. На этом этапе проводится онлайн-тестирование с более сложными вопросами. Команды соревнуются в режиме реального времени, отвечая на блиц-вопросы по различным категориям знаний.'
  },
  {
    block_key: 'timeline_stage3',
    badge_en: '🏆 Grand Final • Offline',
    badge_ky: '🏆 Гранд-Финал • Оффлайн',
    badge_ru: '🏆 Гранд-Финал • Оффлайн',
    title_en: 'Stage 3 - Final',
    title_ky: '3-этап - Финал',
    title_ru: 'Этап 3 - Финал',
    content_en: 'The Final is held offline at Akylman Presidential Lyceum (Cholpon-Ata). Concluding test among top teams from semifinals determines winners by total score.',
    content_ky: 'Финал «Акылман» Президенттик лицейинде (Чолпон-Ата ш.) оффлайн форматта өткөрүлөт. Жарым финалдын жыйынтыгы боюнча эң мыкты командалардын ортосунда жыйынтыктоочу тест. Жеңүүчүлөр топтолгон жалпы упайлардын саны боюнча аныкталат.',
    content_ru: 'Финал проводится в оффлайн формате в Президентском лицее «Акылман» (Чолпон-Ата). Итоговый тест между лучшими командами по результатам полуфинала. Победители определяются по общему количеству набранных баллов.'
  },
  {
    block_key: 'hero_subtitle',
    badge_en: '',
    badge_ky: '',
    badge_ru: '',
    title_en: '',
    title_ky: '',
    title_ru: '',
    content_en: 'For middle and high school students',
    content_ky: 'Орто жана жогорку класстын окуучулары үчүн',
    content_ru: 'Для учеников средней и старшей школы'
  },
  {
    block_key: 'footer_desc',
    badge_en: '',
    badge_ky: '',
    badge_ru: '',
    title_en: '',
    title_ky: '',
    title_ru: '',
    content_en: 'Join the intellectual tournament for school students and unlock new opportunities for your team.',
    content_ky: 'Орто жана жогорку класстын окуучулары үчүн интеллектуалдык турнирге кошулуңуз жана командаңыз менен жаңы мүмкүнчүлүктөрдү ачкыла.',
    content_ru: 'Присоединяйтесь к интеллектуальному турниру для школьников и откройте новые возможности для своей команды.'
  }
];

async function ensureHomepageBlocksTable() {
  await runAsync(`CREATE TABLE IF NOT EXISTS homepage_blocks (
    id SERIAL PRIMARY KEY,
    block_key TEXT UNIQUE,
    badge_en TEXT DEFAULT '',
    badge_ky TEXT DEFAULT '',
    badge_ru TEXT DEFAULT '',
    title_en TEXT DEFAULT '',
    title_ky TEXT DEFAULT '',
    title_ru TEXT DEFAULT '',
    content_en TEXT DEFAULT '',
    content_ky TEXT DEFAULT '',
    content_ru TEXT DEFAULT '',
    updated_at TEXT
  )`).catch(() => {});
  const colsToAdd = ['badge_en', 'badge_ky', 'badge_ru', 'title_en', 'title_ky', 'title_ru', 'content_en', 'content_ky', 'content_ru'];
  for (const c of colsToAdd) {
    await runAsync(`ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT ''`).catch(() => {});
  }
}

async function getHomepageBlockColumns() {
  try {
    const rows = await allAsync("SELECT column_name FROM information_schema.columns WHERE table_name = 'homepage_blocks'");
    return new Set((rows || []).map(r => r.column_name));
  } catch {
    return new Set();
  }
}

router.get('/api/admin/homepage-blocks', async (req, res) => {
  try {
    await ensureHomepageBlocksTable();
    let cols = await getHomepageBlockColumns();

    const selectCols = ['id', 'block_key', 'updated_at'];
    ['badge_en', 'badge_ky', 'badge_ru', 'title_en', 'title_ky', 'title_ru', 'content_en', 'content_ky', 'content_ru'].forEach(col => {
      if (cols.has(col)) selectCols.push(col);
    });

    let blocks = await allAsync(`SELECT ${selectCols.join(', ')} FROM homepage_blocks ORDER BY id ASC`);

    if (!blocks || blocks.length === 0) {
      for (const b of DEFAULT_HOMEPAGE_BLOCKS) {
        await runAsync(
          `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (block_key) DO NOTHING`,
          [b.block_key, b.badge_en, b.badge_ky, b.badge_ru, b.title_en, b.title_ky, b.title_ru, b.content_en, b.content_ky, b.content_ru]
        ).catch(() => {});
      }
      blocks = await allAsync(`SELECT * FROM homepage_blocks ORDER BY id ASC`);
    }

    const normalized = (blocks || []).map(b => {
      const def = DEFAULT_HOMEPAGE_BLOCKS.find(d => d.block_key === b.block_key) || {};
      return {
        ...b,
        badge_en: b.badge_en || def.badge_en || '',
        badge_ky: b.badge_ky || def.badge_ky || '',
        badge_ru: b.badge_ru || def.badge_ru || '',
        title_en: b.title_en || def.title_en || '',
        title_ky: b.title_ky || def.title_ky || '',
        title_ru: b.title_ru || def.title_ru || '',
        content_en: b.content_en || def.content_en || '',
        content_ky: b.content_ky || def.content_ky || '',
        content_ru: b.content_ru || def.content_ru || '',
      };
    });

    res.json(normalized);
  } catch (e) {
    console.error('Homepage blocks get error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/homepage-blocks/:key', async (req, res) => {
  try {
    await ensureHomepageBlocksTable();
    const key = req.params.key;
    const body = req.body || {};
    const badge_en = body.badge_en ?? body.badge_ru ?? '';
    const badge_ky = body.badge_ky ?? '';
    const badge_ru = body.badge_ru ?? body.badge_en ?? '';
    const title_en = body.title_en ?? body.title_ru ?? '';
    const title_ky = body.title_ky ?? '';
    const title_ru = body.title_ru ?? body.title_en ?? '';
    const content_en = body.content_en ?? body.content_ru ?? '';
    const content_ky = body.content_ky ?? '';
    const content_ru = body.content_ru ?? body.content_en ?? '';

    const existing = await getAsync('SELECT id FROM homepage_blocks WHERE block_key = $1', [key]);

    if (existing) {
      await runAsync(
        `UPDATE homepage_blocks
         SET badge_en = $1, badge_ky = $2, badge_ru = $3,
             title_en = $4, title_ky = $5, title_ru = $6,
             content_en = $7, content_ky = $8, content_ru = $9,
             updated_at = NOW()
         WHERE block_key = $10`,
        [badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, key]
      );
    } else {
      await runAsync(
        `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru]
      );
    }
    
    const updated = await getAsync('SELECT * FROM homepage_blocks WHERE block_key = $1', [key]);
    res.json({
      ok: true,
      block: updated
    });
  } catch (e) {
    console.error('Homepage block put error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/homepage-blocks/batch', async (req, res) => {
  try {
    await ensureHomepageBlocksTable();

    const { blocks } = req.body || {};
    if (!Array.isArray(blocks)) {
      return res.status(400).json({ error: 'blocks array is required' });
    }

    for (const b of blocks) {
      if (!b.block_key) continue;
      const badge_en = b.badge_en ?? b.badge_ru ?? '';
      const badge_ky = b.badge_ky ?? '';
      const badge_ru = b.badge_ru ?? b.badge_en ?? '';
      const title_en = b.title_en ?? b.title_ru ?? '';
      const title_ky = b.title_ky ?? '';
      const title_ru = b.title_ru ?? b.title_en ?? '';
      const content_en = b.content_en ?? b.content_ru ?? '';
      const content_ky = b.content_ky ?? '';
      const content_ru = b.content_ru ?? b.content_en ?? '';

      const existing = await getAsync('SELECT id FROM homepage_blocks WHERE block_key = $1', [b.block_key]);
      if (existing) {
        await runAsync(
          `UPDATE homepage_blocks
           SET badge_en = $1, badge_ky = $2, badge_ru = $3,
               title_en = $4, title_ky = $5, title_ru = $6,
               content_en = $7, content_ky = $8, content_ru = $9,
               updated_at = NOW()
           WHERE block_key = $10`,
          [badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, b.block_key]
        );
      } else {
        await runAsync(
          `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [b.block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru]
        );
      }
    }

    const all = await allAsync(`SELECT * FROM homepage_blocks ORDER BY id ASC`);
    res.json({ ok: true, blocks: all || [] });
  } catch (e) {
    console.error('Homepage blocks batch error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/homepage-blocks/reset-defaults', async (req, res) => {
  try {
    await ensureHomepageBlocksTable();

    for (const b of DEFAULT_HOMEPAGE_BLOCKS) {
      const exists = await getAsync('SELECT id FROM homepage_blocks WHERE block_key = $1', [b.block_key]);
      if (exists) {
        await runAsync(
          `UPDATE homepage_blocks
           SET badge_en = $1, badge_ky = $2, badge_ru = $3,
               title_en = $4, title_ky = $5, title_ru = $6,
               content_en = $7, content_ky = $8, content_ru = $9,
               updated_at = NOW()
           WHERE block_key = $10`,
          [b.badge_en, b.badge_ky, b.badge_ru, b.title_en, b.title_ky, b.title_ru, b.content_en, b.content_ky, b.content_ru, b.block_key]
        );
      } else {
        await runAsync(
          `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [b.block_key, b.badge_en, b.badge_ky, b.badge_ru, b.title_en, b.title_ky, b.title_ru, b.content_en, b.content_ky, b.content_ru]
        );
      }
    }

    const all = await allAsync('SELECT * FROM homepage_blocks ORDER BY id ASC');
    res.json({ ok: true, blocks: all || [] });
  } catch (e) {
    console.error('Homepage blocks reset error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Admin Announcements ---
router.get('/api/admin/announcements', adminAuth, async (req, res) => {
  try {
    const list = await allAsync(
      `SELECT a.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM announcements a
       LEFT JOIN categories c ON c.id = a.target_category_id
       ORDER BY a.created_at DESC`
    );
    res.json({ ok: true, announcements: list || [] });
  } catch (e) {
    console.error('Admin announcements fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/announcements', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const titleRu = String(b.title_ru || '').trim();
    const titleKy = String(b.title_ky || '').trim();
    const titleEn = String(b.title_en || titleRu || '').trim();
    const contentRu = String(b.content_ru || '').trim();
    const contentKy = String(b.content_ky || '').trim();
    const contentEn = String(b.content_en || contentRu || '').trim();
    const targetType = b.target_type === 'category' ? 'category' : 'all';
    const targetCategoryId = targetType === 'category' ? (parseInt(b.target_category_id, 10) || null) : null;
    const priority = ['urgent', 'important', 'normal'].includes(b.priority) ? b.priority : 'normal';
    const isPublished = b.is_published === 0 || b.is_published === false ? 0 : 1;

    if (!titleRu && !titleKy) {
      return res.status(400).json({ error: 'Заголовок объявления обязателен (на русском или кыргызском)' });
    }
    if (!contentRu && !contentKy) {
      return res.status(400).json({ error: 'Текст объявления обязателен' });
    }

    const result = await runAsync(
      `INSERT INTO announcements (title_ru, title_ky, title_en, content_ru, content_ky, content_en, target_type, target_category_id, priority, is_published, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING id`,
      [titleRu, titleKy, titleEn, contentRu, contentKy, contentEn, targetType, targetCategoryId, priority, isPublished]
    );

    const newId = result.lastID || result.id || (result.rows && result.rows[0]?.id);
    res.json({ ok: true, id: newId, message: 'Объявление успешно создано' });
  } catch (e) {
    console.error('Admin announcement create error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/admin/announcements/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });

    const b = req.body || {};
    const titleRu = String(b.title_ru || '').trim();
    const titleKy = String(b.title_ky || '').trim();
    const titleEn = String(b.title_en || titleRu || '').trim();
    const contentRu = String(b.content_ru || '').trim();
    const contentKy = String(b.content_ky || '').trim();
    const contentEn = String(b.content_en || contentRu || '').trim();
    const targetType = b.target_type === 'category' ? 'category' : 'all';
    const targetCategoryId = targetType === 'category' ? (parseInt(b.target_category_id, 10) || null) : null;
    const priority = ['urgent', 'important', 'normal'].includes(b.priority) ? b.priority : 'normal';
    const isPublished = b.is_published === 0 || b.is_published === false ? 0 : 1;

    await runAsync(
      `UPDATE announcements
       SET title_ru = $1, title_ky = $2, title_en = $3,
           content_ru = $4, content_ky = $5, content_en = $6,
           target_type = $7, target_category_id = $8, priority = $9,
           is_published = $10, updated_at = NOW()
       WHERE id = $11`,
      [titleRu, titleKy, titleEn, contentRu, contentKy, contentEn, targetType, targetCategoryId, priority, isPublished, id]
    );

    res.json({ ok: true, message: 'Объявление обновлено' });
  } catch (e) {
    console.error('Admin announcement update error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/admin/announcements/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });

    await runAsync('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ ok: true, message: 'Объявление удалено' });
  } catch (e) {
    console.error('Admin announcement delete error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/api/admin/announcements/:id/toggle', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });

    await runAsync('UPDATE announcements SET is_published = CASE WHEN is_published = 1 THEN 0 ELSE 1 END, updated_at = NOW() WHERE id = $1', [id]);
    const item = await getAsync('SELECT is_published FROM announcements WHERE id = $1', [id]);
    res.json({ ok: true, is_published: item?.is_published });
  } catch (e) {
    console.error('Admin announcement toggle error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Admin Support Tickets ---
router.get('/api/admin/support/tickets', adminAuth, async (req, res) => {
  try {
    const statusFilter = req.query.status;
    let query = `
      SELECT t.*, 
        tm.team_name, tm.school, tm.city, tm.team_email, tm.email, tm.phone,
        c.name_ru AS category_name_ru, c.name_ky AS category_name_ky,
        (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
        (SELECT m.sender_type FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
      FROM support_tickets t
      LEFT JOIN teams tm ON tm.id = t.team_id
      LEFT JOIN categories c ON c.id = tm.category_id
    `;
    const params = [];

    if (statusFilter && ['open', 'in_progress', 'resolved'].includes(statusFilter)) {
      query += ` WHERE t.status = $1`;
      params.push(statusFilter);
    }

    query += ` ORDER BY 
      CASE WHEN t.status = 'open' THEN 1 WHEN t.status = 'in_progress' THEN 2 ELSE 3 END,
      t.updated_at DESC, t.id DESC`;

    const tickets = await allAsync(query, params);
    res.json({ ok: true, tickets: tickets || [] });
  } catch (e) {
    console.error('Admin support tickets fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/admin/support/tickets/:id', adminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Неверный ID' });

    const ticket = await getAsync(
      `SELECT t.*, tm.team_name, tm.school, tm.city, tm.team_email, tm.email, tm.phone,
              c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM support_tickets t
       LEFT JOIN teams tm ON tm.id = t.team_id
       LEFT JOIN categories c ON c.id = tm.category_id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' });

    const messages = await allAsync(
      'SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY id ASC',
      [ticketId]
    );

    res.json({ ok: true, ticket, messages: messages || [] });
  } catch (e) {
    console.error('Admin support ticket detail error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/admin/support/tickets/:id/reply', adminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { message, status } = req.body || {};

    if (!ticketId) return res.status(400).json({ error: 'Неверный ID' });
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Текст ответа не может быть пустым' });
    }

    const ticket = await getAsync('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' });

    const cleanMessage = String(message).trim();
    const newStatus = ['open', 'in_progress', 'resolved'].includes(status) ? status : 'in_progress';

    await runAsync(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_name, message, created_at)
       VALUES ($1, 'admin', 'Администрация турнира', $2, NOW())`,
      [ticketId, cleanMessage]
    );

    await runAsync(
      'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, ticketId]
    );

    res.json({ ok: true, message: 'Ответ отправлен' });
  } catch (e) {
    console.error('Admin support reply error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/api/admin/support/tickets/:id/status', adminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { status } = req.body || {};

    if (!ticketId) return res.status(400).json({ error: 'Неверный ID' });
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    await runAsync('UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, ticketId]);
    res.json({ ok: true, status, message: 'Статус обновлен' });
  } catch (e) {
    console.error('Admin support status error:', e);
    res.status(500).json({ error: e.message });
  }
});


router.delete('/api/admin/support/tickets/:id', adminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Неверный ID' });

    // Сначала удаляем сообщения обращения, затем сам тикет
    await runAsync('DELETE FROM support_messages WHERE ticket_id = $1', [ticketId]).catch(() => {});
    await runAsync('DELETE FROM support_tickets WHERE id = $1', [ticketId]);
    res.json({ ok: true, message: 'Обращение удалено' });
  } catch (e) {
    console.error('Admin support delete error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
