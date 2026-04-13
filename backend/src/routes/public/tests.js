/* Public routes: tests, categories, settings */
const express = require('express');
const db = require('../../db');
const { teamAuth } = require('../../middleware/auth');

const router = express.Router();
const { allAsync, getAsync, runAsync } = db;

// List available tests (filtered by time windows)
router.get('/api/tests', async (req, res) => {
  try {
    const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) || null : null;
    let tests;
    if (categoryId) {
      tests = await allAsync(
        'SELECT id,title,description,lang,duration_minutes,window_start,window_end,category_id FROM tests WHERE category_id = $1 ORDER BY id',
        [categoryId]
      );
    } else {
      tests = await allAsync(
        'SELECT id,title,description,lang,duration_minutes,window_start,window_end,category_id FROM tests ORDER BY id'
      );
    }

    const now = Date.now();
    const filtered = tests.filter((t) => {
      if (!t.window_start && !t.window_end) return true;
      const start = t.window_start ? new Date(t.window_start).getTime() : null;
      const end = t.window_end ? new Date(t.window_end).getTime() : null;
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;
    });

    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get questions for a test
router.get('/api/tests/:id', async (req, res) => {
  try {
    const testId = req.params.id;

    // Check time window
    const meta = await getAsync('SELECT window_start, window_end FROM tests WHERE id = $1', [testId]);
    if (meta) {
      const now = Date.now();
      const start = meta.window_start ? new Date(meta.window_start).getTime() : null;
      const end = meta.window_end ? new Date(meta.window_end).getTime() : null;
      if (start && now < start) return res.status(403).json({ error: 'Тест ещё недоступен' });
      if (end && now > end) return res.status(403).json({ error: 'Окно теста уже закрыто' });
    }

    const rows = await allAsync(
      'SELECT id, ordinal, text, options, points, correct, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [testId]
    );

    rows.forEach((r) => {
      try {
        r.options = JSON.parse(r.options || '[]');
      } catch {
        r.options = [];
      }
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submit answers
router.post('/api/tests/:id/submit', teamAuth, async (req, res) => {
  try {
    const testId = req.params.id;
    const answers = req.body.answers || {};

    const qs = await allAsync(
      'SELECT id, ordinal, text, options, correct, points, category_id, lang FROM questions WHERE test_id=$1 ORDER BY ordinal',
      [testId]
    );

    if (!qs.length) {
      return res.status(404).json({ error: 'No questions found for this test' });
    }

    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    const answersArr = [];

    for (const q of qs) {
      const qid = q.id;
      const pts = q.points || 1;
      maxScore += pts;

      const given = Object.prototype.hasOwnProperty.call(answers, qid) ? answers[qid] : null;
      const correct = q.correct;
      let qok = false;

      if (correct === null || correct === undefined || correct === '') {
        qok = false;
      } else if (String(correct).match(/^\d+$/)) {
        if (given !== null && given !== undefined && String(given) === String(correct)) {
          qok = true;
        }
      } else {
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
      answersArr.push({ question_id: qid, given, correct, ok: qok, points: pts });
    }

    await runAsync(
      'INSERT INTO results (team_id, test_id, score, answers, taken_at) VALUES ($1,$2,$3,$4,NOW())',
      [req.team.id, testId, score, JSON.stringify(answersArr)]
    );

    console.log(`✓ Test submitted: team_id=${req.team.id}, test_id=${testId}, score=${score}, correct=${correctCount}/${qs.length}`);
    res.json({ ok: true, score, maxScore, correct: correctCount, total: qs.length });
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
