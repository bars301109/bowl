/* Public routes: tests, categories, settings */
const express = require('express');
const db = require('../../db');
const { teamAuth } = require('../../middleware/auth');

const router = express.Router();
const { allAsync, getAsync, runAsync } = db;

// Helper: compute auto-status based on time windows
function computeAutoStatus(test) {
  const now = Date.now();
  const start = test.window_start ? new Date(test.window_start).getTime() : null;
  const end = test.window_end ? new Date(test.window_end).getTime() : null;
  if (start && now < start) return 'scheduled';
  if (end && now > end) return 'closed';
  return 'active';
}

// List available tests (filtered by status=published, time windows, category)
router.get('/api/tests', async (req, res) => {
  try {
    const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) || null : null;
    let tests;
    if (categoryId) {
      tests = await allAsync(
        `SELECT t.id, t.title, t.description, t.preview_text, t.lang, t.duration_minutes, t.window_start, t.window_end, t.status, t.category_id,
                c.name_ru AS category_name_ru, c.name_ky AS category_name_ky, c.name_ru AS category_name
         FROM tests t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.category_id = $1
         ORDER BY t.id`,
        [categoryId]
      );
    } else {
      tests = await allAsync(
        `SELECT t.id, t.title, t.description, t.preview_text, t.lang, t.duration_minutes, t.window_start, t.window_end, t.status, t.category_id,
                c.name_ru AS category_name_ru, c.name_ky AS category_name_ky, c.name_ru AS category_name
         FROM tests t
         LEFT JOIN categories c ON c.id = t.category_id
         ORDER BY t.id`
      );
    }

    const now = Date.now();
    const filtered = tests
      .filter((t) => {
        // Only show published tests
        if (t.status !== 'published') return false;
        // Time window filter
        const start = t.window_start ? new Date(t.window_start).getTime() : null;
        const end = t.window_end ? new Date(t.window_end).getTime() : null;
        // Show scheduled tests too (with countdown), but not closed
        if (end && now > end) return false;
        return true;
      })
      .map((t) => {
        const autoStatus = computeAutoStatus(t);
        const startsIn = t.window_start && now < new Date(t.window_start).getTime()
          ? Math.max(0, Math.floor((new Date(t.window_start).getTime() - now) / 1000))
          : null;
        return {
          ...t,
          auto_status: autoStatus,
          countdown_sec: startsIn,
        };
      });

    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get questions for a test (DOES NOT return correct answers)
router.get('/api/tests/:id', async (req, res) => {
  try {
    const testId = req.params.id;

    // Check test exists and is published
    const test = await getAsync(
      'SELECT id, title, description, preview_text, lang, duration_minutes, window_start, window_end, status FROM tests WHERE id = $1',
      [testId]
    );
    if (!test) return res.status(404).json({ error: 'Test not found' });
    if (test.status !== 'published') return res.status(403).json({ error: 'Тест ещё не опубликован' });

    // Check time window
    const now = Date.now();
    const start = test.window_start ? new Date(test.window_start).getTime() : null;
    const end = test.window_end ? new Date(test.window_end).getTime() : null;
    if (start && now < start) return res.status(403).json({ error: 'Тест ещё недоступен' });
    if (end && now > end) return res.status(403).json({ error: 'Окно теста уже закрыто' });

    const rows = await allAsync(
      'SELECT id, ordinal, text, options, points, type, attachment_url, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [testId]
    );

    rows.forEach((r) => {
      try {
        r.options = JSON.parse(r.options || '[]');
      } catch {
        r.options = [];
      }
    });

    // Return test metadata + questions (NO correct field)
    res.json({
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        preview_text: test.preview_text,
        lang: test.lang,
        duration_minutes: test.duration_minutes,
        window_start: test.window_start,
        window_end: test.window_end,
      },
      questions: rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start test session (Server-side timer & anti-cheat tracker)
router.post('/api/tests/:id/start', teamAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const teamId = parseInt(req.team.id, 10);
    const now = Date.now();

    const test = await getAsync(
      'SELECT id, title, duration_minutes, window_start, window_end, status FROM tests WHERE id = $1',
      [testId]
    );
    if (!test) return res.status(404).json({ error: 'Тест не найден' });
    if (test.status !== 'published') return res.status(403).json({ error: 'Тест ещё не опубликован' });

    // Time window check
    const start = test.window_start ? new Date(test.window_start).getTime() : null;
    const end = test.window_end ? new Date(test.window_end).getTime() : null;
    if (start && now < start) return res.status(403).json({ error: 'Тест ещё недоступен' });
    if (end && now > end) return res.status(403).json({ error: 'Окно теста уже закрыто' });

    // Check if already submitted
    const settings = await getAsync('SELECT one_submission_allowed FROM settings WHERE id=1');
    const existingResult = await getAsync(
      'SELECT id FROM results WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );
    if (existingResult && settings && settings.one_submission_allowed) {
      return res.status(400).json({ error: 'Вы уже сдали этот тест' });
    }

    const durationSec = (test.duration_minutes || 60) * 60;

    // Check existing session
    let session = await getAsync(
      'SELECT * FROM test_sessions WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );

    // If no session exists, or session is expired, or session was completed:
    // start fresh session if retakes or new attempts are allowed!
    const sessionStartMs = session?.started_at ? new Date(session.started_at).getTime() : 0;
    const isStale = session && (now - sessionStartMs >= durationSec * 1000);
    const isCompleted = session && session.status === 'completed';

    if (!session || isStale || isCompleted) {
      const startedAtIso = new Date(now).toISOString();
      const expiresAtIso = new Date(now + durationSec * 1000).toISOString();
      if (!session) {
        await runAsync(
          'INSERT INTO test_sessions (team_id, test_id, started_at, status, expires_at) VALUES ($1,$2,$3,$4,$5)',
          [teamId, testId, startedAtIso, 'in_progress', expiresAtIso]
        );
      } else {
        await runAsync(
          'UPDATE test_sessions SET started_at = $1, status = $2, expires_at = $3 WHERE team_id = $4 AND test_id = $5',
          [startedAtIso, 'in_progress', expiresAtIso, teamId, testId]
        );
      }
      session = {
        team_id: teamId,
        test_id: testId,
        started_at: startedAtIso,
        status: 'in_progress',
        expires_at: expiresAtIso,
      };
    }

    const currentSessionStartMs = new Date(session.started_at).getTime();
    const elapsedSec = Math.max(0, Math.floor((now - currentSessionStartMs) / 1000));
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    res.json({
      ok: true,
      session: {
        started_at: session.started_at,
        duration_minutes: test.duration_minutes || 60,
        duration_seconds: durationSec,
        server_now: now,
        remaining_seconds: remainingSec,
        expires_at: session.expires_at || new Date(now + remainingSec * 1000).toISOString(),
        is_expired: remainingSec <= 0,
      },
    });
  } catch (e) {
    console.error('Error starting test session:', e);
    res.status(500).json({ error: e.message });
  }
});

// Check session status
router.get('/api/tests/:id/session', teamAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const teamId = parseInt(req.team.id, 10);
    const now = Date.now();

    const session = await getAsync(
      'SELECT * FROM test_sessions WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );
    const result = await getAsync(
      'SELECT id, score, taken_at FROM results WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );

    if (!session) {
      return res.json({ active: false, completed: !!result, result: result || null });
    }

    const test = await getAsync('SELECT duration_minutes FROM tests WHERE id = $1', [testId]);
    const durationSec = ((test?.duration_minutes) || 60) * 60;
    const sessionStartMs = new Date(session.started_at).getTime();
    const elapsedSec = Math.max(0, Math.floor((now - sessionStartMs) / 1000));
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    res.json({
      active: session.status === 'in_progress' && remainingSec > 0,
      completed: session.status === 'completed' || !!result,
      result: result || null,
      session: {
        started_at: session.started_at,
        duration_seconds: durationSec,
        server_now: now,
        remaining_seconds: remainingSec,
        expires_at: session.expires_at || new Date(now + remainingSec * 1000).toISOString(),
        is_expired: remainingSec <= 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submit answers
router.post('/api/tests/:id/submit', teamAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const teamId = parseInt(req.team.id, 10);
    const answers = req.body.answers || {};
    const clientStartTime = req.body.started_at || null;

    // Check test exists and is published
    const test = await getAsync(
      'SELECT id, duration_minutes, window_start, window_end, status FROM tests WHERE id = $1',
      [testId]
    );
    if (!test) return res.status(404).json({ error: 'Test not found' });
    if (test.status !== 'published') return res.status(403).json({ error: 'Тест не опубликован' });

    // Check time window
    const now = Date.now();
    const start = test.window_start ? new Date(test.window_start).getTime() : null;
    const end = test.window_end ? new Date(test.window_end).getTime() : null;
    if (start && now < start) return res.status(403).json({ error: 'Тест ещё недоступен' });
    if (end && now > end) return res.status(403).json({ error: 'Окно теста уже закрыто' });

    // Check one-time submission / duplicate prevention
    const settings = await getAsync('SELECT one_submission_allowed FROM settings WHERE id=1');
    const existing = await getAsync(
      'SELECT id FROM results WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );
    if (existing && settings && settings.one_submission_allowed) {
      return res.status(400).json({ error: 'Вы уже сдали этот тест' });
    }

    // Include correct in query!
    const qs = await allAsync(
      'SELECT id, ordinal, text, options, correct, points, type, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [testId]
    );

    if (!qs.length) {
      return res.status(404).json({ error: 'В этом тесте пока нет вопросов' });
    }

    // Check session in server DB
    const session = await getAsync(
      'SELECT * FROM test_sessions WHERE team_id = $1 AND test_id = $2',
      [teamId, testId]
    );

    let startedAt = session ? session.started_at : (clientStartTime ? (isNaN(Number(clientStartTime)) ? clientStartTime : new Date(Number(clientStartTime)).toISOString()) : new Date().toISOString());
    const sessionStartMs = new Date(startedAt).getTime();
    const timeTakenSec = Math.max(1, Math.round((now - sessionStartMs) / 1000));
    const maxSec = (test.duration_minutes || 60) * 60;
    const recordedTimeSec = Math.min(timeTakenSec, maxSec);

    // Grade answers
    let score = 0;
    let correctCount = 0;
    const answersArr = [];

    for (const q of qs) {
      const qid = q.id;
      const pts = q.points || 1;

      const given = Object.prototype.hasOwnProperty.call(answers, qid) ? answers[qid] : null;
      const correct = q.correct;
      let qok = false;

      if (correct === null || correct === undefined || String(correct).trim() === '') {
        qok = false;
      } else if (q.type === 'text') {
        // Open-ended / text answer: case-insensitive trimmed comparison
        const givenText = String(given || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const correctText = String(correct || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (givenText && (givenText === correctText || correctText.split('|').map(s => s.trim()).includes(givenText))) {
          qok = true;
        }
      } else if (String(correct).match(/^\d+$/)) {
        // MCQ: compare index
        if (given !== null && given !== undefined && String(given) === String(correct)) {
          qok = true;
        }
      } else {
        // Fallback text match
        const givenText = String(given || '').trim().toLowerCase();
        const correctText = String(correct).trim().toLowerCase();
        if (givenText && givenText === correctText) {
          qok = true;
        }
      }

      if (qok) {
        score += pts;
        correctCount += 1;
      }
      answersArr.push({ question_id: qid, given, ok: qok, points: pts });
    }

    const answersJson = JSON.stringify(answersArr);

    // Record results atomically (update existing if retaking, or insert)
    const participantId = req.participantId || null;
    const catId = test.category_id || null;
    if (existing) {
      await runAsync(
        'UPDATE results SET score = $1, answers = $2, taken_at = NOW(), started_at = $3, time_taken_sec = $4, participant_id = COALESCE($5, participant_id), category_id = COALESCE($6, category_id) WHERE id = $7',
        [score, answersJson, startedAt, recordedTimeSec, participantId, catId, existing.id]
      );
    } else {
      await runAsync(
        'INSERT INTO results (team_id, test_id, score, answers, taken_at, started_at, time_taken_sec, participant_id, category_id) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8)',
        [teamId, testId, score, answersJson, startedAt, recordedTimeSec, participantId, catId]
      );
    }

    // Update test_sessions status
    await runAsync(
      'UPDATE test_sessions SET status = $1 WHERE team_id = $2 AND test_id = $3',
      ['completed', teamId, testId]
    ).catch(() => {});

    console.log(`✓ Test submitted: team_id=${teamId}, test_id=${testId}, score=${score}/${qs.reduce((s, q) => s + (q.points || 1), 0)}, time=${recordedTimeSec}s`);
    res.json({
      ok: true,
      score,
      maxScore: qs.reduce((s, q) => s + (q.points || 1), 0),
      correct: correctCount,
      total: qs.length,
      time_taken_sec: recordedTimeSec,
    });
  } catch (e) {
    console.error('Error in /api/tests/:id/submit', e);
    res.status(500).json({ error: e.message });
  }
});

// Public categories
router.get('/api/categories', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const rows = await allAsync('SELECT id, name_ru, name_ky, desc_ru, desc_ky FROM categories ORDER BY id');
    res.json(rows);
  } catch (e) {
    console.error('Categories error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Public settings
router.get('/api/settings', async (req, res) => {
  try {
    const s = await getAsync('SELECT * FROM settings WHERE id=1');
    res.json(s || {});
  } catch (e) {
    console.error('Settings error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Homepage blocks (public)
router.get('/api/homepage-blocks', async (req, res) => {
  try {
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

    const blocks = await allAsync(`SELECT * FROM homepage_blocks`);
    const result = {};
    (blocks || []).forEach((b) => {
      result[b.block_key] = {
        badge_en: b.badge_en || '',
        badge_ky: b.badge_ky || '',
        badge_ru: b.badge_ru || '',
        title_en: b.title_en || '',
        title_ky: b.title_ky || '',
        title_ru: b.title_ru || '',
        content_en: b.content_en || '',
        content_ky: b.content_ky || '',
        content_ru: b.content_ru || '',
      };
    });
    res.json(result);
  } catch (e) {
    console.error('Homepage blocks public get error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
