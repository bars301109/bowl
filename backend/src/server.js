/*
 * Akylman Quiz Bowl — Refactored Server
 * Modular architecture with PostgreSQL only
 */
// Load environment variables FIRST
try {
  require('dotenv').config();
} catch {}

const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { ensureSchema } = require('./services/schema');
const securityHeaders = require('./middleware/security');
const { adminPageAuth, teamPageAuth } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/public/auth');
const publicRoutes = require('./routes/public/tests');
const teamRoutes = require('./routes/public/team');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = 3000;
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend', 'src');

// Disable server technology banner
app.disable('x-powered-by');

// --- Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(securityHeaders);

// --- API Routes ---
app.use(adminRoutes);      // /api/admin/login, /api/admin/*
app.use(authRoutes);       // /api/register, /api/login, /api/password-reset/*
app.use(publicRoutes);     // /api/tests, /api/categories, /api/settings, /api/homepage-blocks
app.use(teamRoutes);       // /api/me, /api/me/results, /api/me/change-password

// Health check
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Catch all unmatched /api/* routes with 404 JSON (NEVER return HTML for API requests!)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// --- File & Asset serving (SQL-backed file storage with disk caching) ---
const { getFileFromDb, guessMimeType } = require('./services/files');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Serve uploaded files directly from Cloud SQL PostgreSQL or local disk
app.get(['/uploads/:filename', '/api/files/:filename'], async (req, res) => {
  try {
    const rawName = path.basename(req.params.filename || '');
    if (!rawName) return res.status(404).type('text/plain').send('File not found');

    // 1. Fast local disk serving
    const diskPath = path.join(UPLOADS_DIR, rawName);
    if (fs.existsSync(diskPath)) {
      const mime = guessMimeType(rawName, 'image/png');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.sendFile(diskPath);
    }

    // 2. Cloud SQL PostgreSQL retrieval
    const file = await getFileFromDb(rawName);
    if (file && file.buffer) {
      const mime = (file.mimeType && file.mimeType !== 'application/octet-stream')
        ? file.mimeType
        : guessMimeType(rawName, 'image/png');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', file.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.send(file.buffer);
    }

    res.status(404).type('text/plain').send('File not found');
  } catch (err) {
    console.error('File serving error:', err);
    res.status(404).type('text/plain').send('File not found');
  }
});

app.use('/css', express.static(path.join(FRONTEND_DIR, 'css'), {
  maxAge: 5000,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=5');
  },
}));

app.use('/js', express.static(path.join(FRONTEND_DIR, 'js'), {
  maxAge: 5000,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=5');
  },
}));

app.use('/images', express.static(path.join(FRONTEND_DIR, 'images'), {
  maxAge: 5000,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=5');
  },
}));

// Specific public root files
app.get('/favicon.png', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'images', 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'images', 'favicon.png')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'sitemap.xml')));

// Safe asset 404s (NEVER return index.html for missing js, css, images, or uploads!)
app.all(['/css/*', '/js/*', '/images/*', '/uploads/*'], (req, res) => {
  res.status(404).type('text/plain').send('File not found');
});

// --- Page Routes with Server-Side Protection ---
// Root: serve index.html explicitly with pre-loaded homepage blocks for zero-latency instant rendering
app.get('/', async (req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    try {
      let html = fs.readFileSync(indexPath, 'utf8');
      const rows = await db.allAsync('SELECT * FROM homepage_blocks').catch(() => []);
      const blockMap = {};
      (rows || []).forEach(b => {
        blockMap[b.block_key] = {
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

      const FALLBACK_BLOCKS = {
        hero_subtitle: {
          badge_en: '', badge_ky: '', badge_ru: '',
          title_en: '', title_ky: '', title_ru: '',
          content_en: 'For middle and high school students',
          content_ky: 'Орто жана жогорку класстын окуучулары үчүн',
          content_ru: 'Для учеников средней и старшей школы',
        },
        stage_1: {
          badge_en: 'Round 1', badge_ky: 'Раунд 1', badge_ru: 'Раунд 1',
          title_en: 'Preliminary Round', title_ky: 'Алгачкы раунд', title_ru: 'Предварительный раунд',
          content_en: 'Online test: multiple choice and short answer questions',
          content_ky: 'Онлайн-тест: бир нече тандоо жана кыска жооп',
          content_ru: 'Онлайн-тест: множественный выбор и короткий ответ',
        },
        stage_2: {
          badge_en: 'Round 2', badge_ky: 'Раунд 2', badge_ru: 'Раунд 2',
          title_en: 'Semifinal', title_ky: 'Жарым финал', title_ru: 'Полуфинал',
          content_en: 'Live blitz questions in real time',
          content_ky: 'Реалдуу убакыт режиминде түз блиц-суроолор',
          content_ru: 'Живые блиц-вопросы в режиме реального времени',
        },
        stage_3: {
          badge_en: 'Grand Final', badge_ky: 'Гранд-Финал', badge_ru: 'Гранд-Финал',
          title_en: 'Final', title_ky: 'Финал', title_ru: 'Финал',
          content_en: 'Final concluding round with top qualifying teams',
          content_ky: 'Эң мыкты командалар менен финалдык раунд',
          content_ru: 'Финальный раунд с лучшими командами',
        },
        team_composition: {
          badge_en: '01', badge_ky: '01', badge_ru: '01',
          title_en: 'Team Composition', title_ky: 'Команданын курамы', title_ru: 'О составе команды',
          content_en: '2–4 members from the same school',
          content_ky: 'Бир мектептен 2–4 адам',
          content_ru: '2–4 человека из одной школы',
        },
        categories_info: {
          badge_en: '02', badge_ky: '02', badge_ru: '02',
          title_en: 'Categories', title_ky: 'Категориялар', title_ru: 'Категории',
          content_en: 'Olympiad disciplines across subjects and tracks',
          content_ky: 'Предметтер жана багыттар боюнча олимпиадалык сабактар',
          content_ru: 'Дисциплины олимпиады по предметам и направлениям',
        },
        format_info: {
          badge_en: '03', badge_ky: '03', badge_ru: '03',
          title_en: 'Tournament Format', title_ky: 'Форматы', title_ru: 'Формат',
          content_en: 'Stages 1 and 2 are held online. Stage 3 (Final) is held offline at Akylman Presidential Lyceum.',
          content_ky: '1 жана 2-этаптар онлайн форматта өткөрүлөт. Үчүнчү этап оффлайн форматта өтөт.',
          content_ru: 'Этапы 1 и 2 проводятся в онлайн-формате. Третий этап проводится в оффлайн-формате.',
        },
        timeline_stage1: {
          badge_en: '🌐 Online Round', badge_ky: '🌐 Онлайн-тур', badge_ru: '🌐 Онлайн-тур',
          title_en: 'Stage 1 - Preliminary Round', title_ky: '1-этап - Тандоо туру', title_ru: 'Этап 1 - Отборочный тур',
          content_en: 'Teams take an online test in selected categories with multiple-choice and short-answer questions. Results determine teams advancing to the next round.',
          content_ky: 'Бул этапта командалар тандалган категориялар боюнча онлайн тестирлөөдөн өтүшөт. Катышуучулар бир нече тандоо жана кыска жооптуу суроолорго жооп беришет. Бул этаптын жыйынтыгы боюнча кийинки раундга чыга турган командалар аныкталат.',
          content_ru: 'На этом этапе команды проходят онлайн-тестирование по выбранным категориям. Участники отвечают на вопросы с множественным выбором и короткими ответами. По результатам этого этапа определяются команды, которые пройдут в следующий раунд.',
        },
        timeline_stage2: {
          badge_en: '⚡ Semifinal • Online', badge_ky: '⚡ Жарым финал • Онлайн', badge_ru: '⚡ Полуфинал • Онлайн',
          title_en: 'Stage 2 - Semifinal', title_ky: '2-этап - Жарым финал', title_ru: 'Этап 2 - Полуфинал',
          content_en: 'This stage highlights the best teams among successful qualifiers. Teams compete in real time with challenging blitz questions across various domains.',
          content_ky: 'Бул этап ийгиликтүү командалардын арасынан эң мыктыларды аныктайт. Бул этапта татаалыраак суроолор камтылган онлайн тестирлөө өткөрүлөт. Командалар билимдин ар кандай категориялары боюнча блиц-суроолорго реалдуу убакытта жооп берип күч сынашышат.',
          content_ru: 'Этап выявляет лучшие команды среди уже успешных. На этом этапе проводится онлайн-тестирование с более сложными вопросами. Команды соревнуются в режиме реального времени, отвечая на блиц-вопросы по различным категориям знаний.',
        },
        timeline_stage3: {
          badge_en: '🏆 Grand Final • Offline', badge_ky: '🏆 Гранд-Финал • Оффлайн', badge_ru: '🏆 Гранд-Финал • Оффлайн',
          title_en: 'Stage 3 - Final', title_ky: '3-этап - Финал', title_ru: 'Этап 3 - Финал',
          content_en: 'The Final is held offline at Akylman Presidential Lyceum (Cholpon-Ata). Concluding test among top teams from semifinals determines winners by total score.',
          content_ky: 'Финал «Акылман» Президенттик лицейинде (Чолпон-Ата ш.) оффлайн форматта өткөрүлөт. Жарым финалдын жыйынтыгы боюнча эң мыкты командалардын ортосунда жыйынтыктоочу тест. Жеңүүчүлөр топтолгон жалпы упайлардын саны боюнча аныкталат.',
          content_ru: 'Финал проводится в оффлайн формате в Президентском лицее «Акылман» (Чолпон-Ата). Итоговый тест между лучшими командами по результатам полуфинала. Победители определяются по общему количеству набранных баллов.',
        },
        footer_desc: {
          badge_en: '', badge_ky: '', badge_ru: '',
          title_en: '', title_ky: '', title_ru: '',
          content_en: 'Join the intellectual tournament for school students and unlock new opportunities for your team.',
          content_ky: 'Орто жана жогорку класстын окуучулары үчүн интеллектуалдык турнирге кошулуңуз жана командаңыз менен жаңы мүмкүнчүлүктөрдү ачкыла.',
          content_ru: 'Присоединяйтесь к интеллектуальному турниру для школьников и откройте новые возможности для своей команды.',
        },
      };

      const finalMap = Object.assign({}, FALLBACK_BLOCKS, blockMap);
      const injection = `<script>window.INITIAL_HOMEPAGE_BLOCKS = ${JSON.stringify(finalMap)};</script>`;
      html = html.replace('</head>', `${injection}\n</head>`);
      return res.send(html);
    } catch (e) {
      return res.sendFile(indexPath);
    }
  }
  res.status(500).send('Index file missing');
});

// Public pages
app.get('/register', (req, res, next) => sendPage(res, 'register', next));
app.get('/login', (req, res, next) => sendPage(res, 'login', next));
app.get('/admin-login', (req, res, next) => sendPage(res, 'admin-login', next));
app.get('/profile', (req, res) => res.redirect(301, '/team'));

// Team pages — authenticated seamlessly via cookie and localStorage client token
app.get('/team', (req, res, next) => sendPage(res, 'team', next));
app.get('/team/:section', (req, res, next) => sendPage(res, 'team', next));

// Admin panel — server-side authenticated via adminPageAuth cookie check (instant redirect if not logged in)
app.get(['/admin', '/admin/*'], adminPageAuth, (req, res, next) => sendPage(res, 'admin', next));

// Rules PDF (stored in Cloud SQL, fallback to disk)
app.get('/pages/rules.pdf', async (req, res) => {
  try {
    const file = await getFileFromDb('rules.pdf');
    if (file && file.buffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', file.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(file.buffer);
    }
  } catch {}
  const pdfPath = path.join(FRONTEND_DIR, 'pages', 'rules.pdf');
  if (fs.existsSync(pdfPath)) return res.sendFile(pdfPath);
  res.status(404).send('Rules PDF not found');
});

// Clean legacy /pages/<name> redirects to avoid broken or duplicate URLs
app.get('/pages/:page', (req, res, next) => {
  const cleanName = (req.params.page || '').replace(/\.html$/i, '').toLowerCase();
  if (cleanName === 'admin') return res.redirect(302, '/admin');
  if (cleanName === 'admin-login') return res.redirect(302, '/admin-login');
  if (cleanName === 'team' || cleanName === 'profile') return res.redirect(302, '/team');
  if (cleanName === 'login') return res.redirect(302, '/login');
  if (cleanName === 'register') return res.redirect(302, '/register');
  if (cleanName === 'rules.pdf') return res.redirect(302, '/pages/rules.pdf');
  return next();
});

// Safe 404 fallback for unmatched URLs
app.use((req, res) => {
  if (req.accepts('html')) {
    res.status(404).send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>404 — Страница не найдена</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 60px 20px; background: #f8fafc; color: #1e293b; }
    h1 { font-size: 48px; margin-bottom: 8px; color: #0f172a; }
    p { font-size: 16px; color: #64748b; margin-bottom: 24px; }
    a { display: inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; }
    a:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <h1>404</h1>
  <p>Запрашиваемая страница или ресурс не найдены.</p>
  <a href="/">На главную</a>
</body>
</html>`);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Helper: serve page HTML safely
function sendPage(res, pageName, next) {
  const cleanName = (pageName || '').replace(/\.html$/i, '');
  if (!/^[a-z0-9-]+$/i.test(cleanName)) return next();
  const pagesRoot = path.resolve(FRONTEND_DIR, 'pages');
  const filePath = path.resolve(pagesRoot, `${cleanName}.html`);
  if (!filePath.startsWith(pagesRoot + path.sep)) return next();
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return next();
}


// --- Startup ---
let initializationStarted = false;
let serverInstance = null;

async function initializeApp() {
  if (initializationStarted) {
    return serverInstance;
  }
  initializationStarted = true;

  // Bind port immediately so deployment startup probe succeeds
  serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${PORT} already in use`);
    } else {
      console.error('Server listen error:', err);
    }
  });

  try {
    const connected = await db.testConnection();
    if (!connected) {
      console.warn('⚠️  Database connection failed, but server is listening and continuing startup...');
    }

    await ensureSchema();

    console.log('');
    console.log('✅ Akylman Quiz Bowl Server Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🗄️  Database: PostgreSQL (persistent)');
    console.log('📧 Email: Resend / SMTP');
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin-login`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  } catch (err) {
    console.error('❌ Database/schema init failed:', err.message);
  }

  return serverInstance;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await db.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await db.shutdown();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  initializeApp().catch((err) => {
    console.error('Fatal initialization error:', err);
  });
}

module.exports = app;
module.exports.initializeApp = initializeApp;
