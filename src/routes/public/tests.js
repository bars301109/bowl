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
        'SELECT id,title,description,preview_text,lang,duration_minutes,window_start,window_end,status,category_id FROM tests WHERE category_id = $1 ORDER BY id',
        [categoryId]
      );
    } else {
      tests = await allAsync(
        'SELECT id,title,description,preview_text,lang,duration_minutes,window_start,window_end,status,category_id FROM tests ORDER BY id'
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

// Submit answers
router.post('/api/tests/:id/submit', teamAuth, async (req, res) => {
  try {
    const testId = req.params.id;
    const teamId = req.team.id;
    const answers = req.body.answers || {};
    const clientStartTime = req.body.started_at || null; // when team started the test (client-side)

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

    // Check one-time submission
    const settings = await getAsync('SELECT one_submission_allowed FROM settings WHERE id=1');
    if (settings && settings.one_submission_allowed) {
      const existing = await getAsync(
        'SELECT id FROM results WHERE team_id = $1 AND test_id = $2',
        [teamId, testId]
      );
      if (existing) {
        return res.status(400).json({ error: 'Вы уже сдали этот тест' });
      }
    }

    const qs = await allAsync(
      'SELECT id, ordinal, text, options, correct, points, type, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [testId]
    );

    if (!qs.length) {
      return res.status(404).json({ error: 'No questions found for this test' });
    }

    // Server-side timer: compute time taken
    let startedAt = null;
    let timeTakenSec = null;
    if (clientStartTime) {
      startedAt = new Date(parseInt(clientStartTime, 10)).toISOString();
      timeTakenSec = Math.round((now - parseInt(clientStartTime, 10)) / 1000);
      // Check if time taken exceeds duration_minutes (server-side enforcement)
      const maxSec = (test.duration_minutes || 60) * 60;
      if (timeTakenSec > maxSec) {
        return res.status(400).json({
          error: 'Время вышло. Тест не принят.',
          time_taken_sec: timeTakenSec,
          max_sec: maxSec,
        });
      }
    }

    // Grade answers (correct field is ONLY used server-side)
    let score = 0;
    let correctCount = 0;
    const answersArr = [];

    for (const q of qs) {
      const qid = q.id;
      const pts = q.points || 1;

      const given = Object.prototype.hasOwnProperty.call(answers, qid) ? answers[qid] : null;
      const correct = q.correct;
      let qok = false;

      if (correct === null || correct === undefined || correct === '') {
        qok = false;
      } else if (String(correct).match(/^\d+$/)) {
        // MCQ: compare index
        if (given !== null && given !== undefined && String(given) === String(correct)) {
          qok = true;
        }
      } else {
        // Text answer: case-insensitive exact match
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

    await runAsync(
      'INSERT INTO results (team_id, test_id, score, answers, taken_at, started_at, time_taken_sec) VALUES ($1,$2,$3,$4,NOW(),$5,$6)',
      [teamId, testId, score, JSON.stringify(answersArr), startedAt, timeTakenSec]
    );

    console.log(`✓ Test submitted: team_id=${teamId}, test_id=${testId}, score=${score}, correct=${correctCount}/${qs.length}, time_sec=${timeTakenSec}`);
    res.json({ ok: true, score, maxScore: qs.reduce((s, q) => s + (q.points || 1), 0), correct: correctCount, total: qs.length, time_taken_sec: timeTakenSec });
  } catch (e) {
    console.error('Error in /api/tests/:id/submit', e);
    res.status(500).json({ error: e.message });
  }
});

// Public categories
router.get('/api/categories', async (req, res) => {
  try {
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
    const blocks = await allAsync('SELECT block_key, title_ru, title_ky, content_ru, content_ky FROM homepage_blocks');
    const result = {};
    blocks.forEach((b) => {
      result[b.block_key] = {
        title_ru: b.title_ru || '',
        title_ky: b.title_ky || '',
        content_ru: b.content_ru || '',
        content_ky: b.content_ky || '',
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
