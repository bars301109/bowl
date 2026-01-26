
/* Complete backend for Akylman Quiz Bowl */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('./db'); // Universal database adapter (SQLite or PostgreSQL)
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super-secret-token';
// Email provider: 'resend' (HTTP API) или 'gmail' (SMTP через nodemailer)
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'gmail');

// Email configuration for password reset (Gmail SMTP, используется только если выбран провайдер gmail)
// На Render мы будем использовать HTTP‑API (Resend), чтобы обойти блокировку SMTP,
// поэтому этот транспорт нужен в основном для локальной разработки.
const emailTransporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  auth: {
    user: process.env.SMTP_USER || process.env.GMAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 60000,
  pool: false,
  tls: { rejectUnauthorized: false },
  debug: process.env.NODE_ENV === 'development',
  logger: process.env.NODE_ENV === 'development'
});

let DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/var/data' : path.join(__dirname, '..', 'data'));
let DB_FILE = db.type === 'sqlite' ? (db.name || path.join(DATA_DIR, 'db.sqlite')) : 'PostgreSQL';
let TESTS_DIR = path.join(DATA_DIR, 'tests');

const ensureDirectory = (dir) => {
  if(!fs.existsSync(dir)){
    try{
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      console.log('✓ Created directory:', dir);
      return true;
    }catch(e){
      console.error(`✗ Failed to create directory: ${dir} ${e.code}`);
      return false;
    }
  }
  return true;
};

if(!ensureDirectory(DATA_DIR)){
  if(process.env.NODE_ENV === 'production'){
    console.warn('');
    console.warn('⚠️  NOTICE: Cannot access /var/data (persistent disk not available)');
    console.warn('⚠️  Possible reasons:');
    console.warn('   1. Using Render FREE plan (persistent disks require paid plan)');
    console.warn('   2. Persistent disk not created in Render Dashboard');
    console.warn('');
    console.warn('📋 OPTIONS:');
    console.warn('   Option 1: Upgrade to Render PAID plan to enable persistent disks');
    console.warn('   Option 2: Use free PostgreSQL on Render instead');
    console.warn('   Option 3: Data will be temporary (lost on redeploy)');
    console.warn('');
    console.warn('Using temporary storage at /tmp instead...');
    console.warn('⚠️  WARNING: All data will be LOST when service restarts!');
    console.warn('');
    DATA_DIR = '/tmp/akylman-data';
    DB_FILE = path.join(DATA_DIR, 'db.sqlite');
    TESTS_DIR = path.join(DATA_DIR, 'tests');
    ensureDirectory(DATA_DIR);
  }
}

ensureDirectory(TESTS_DIR);

const OLD_DB_FILE = path.join(__dirname, 'db.better-sqlite3.sqlite');
if(OLD_DB_FILE !== DB_FILE && fs.existsSync(OLD_DB_FILE) && !fs.existsSync(DB_FILE)){
  try{
    fs.copyFileSync(OLD_DB_FILE, DB_FILE);
    console.log('✓ Migrated database to:', DB_FILE);
  }catch(e){
    console.error('✗ Failed to migrate database:', e.message);
  }
}

const OLD_TESTS_DIR = path.join(__dirname, 'tests');
if(OLD_TESTS_DIR !== TESTS_DIR && fs.existsSync(OLD_TESTS_DIR)){
  try{
    const files = fs.readdirSync(OLD_TESTS_DIR).filter(f => f.endsWith('.json'));
    let migrated = 0;
    for(const file of files){
      const oldPath = path.join(OLD_TESTS_DIR, file);
      const newPath = path.join(TESTS_DIR, file);
      if(!fs.existsSync(newPath)){
        fs.copyFileSync(oldPath, newPath);
        migrated++;
      }
    }
    if(migrated > 0) console.log(`✓ Migrated ${migrated} test files to persistent storage`);
  }catch(e){
    console.error('✗ Failed to migrate test files:', e.message);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Frontend directory
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'src');

// Helper function to send page HTML files
function sendPage(res, pageName) {
  const filePath = path.join(FRONTEND_DIR, 'pages', `${pageName}.html`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
    return true;
  }
  return false;
}

// Clean URLs: /register, /login, /team, /admin, /admin-login, /profile
// These MUST be BEFORE static middleware to work correctly
['register', 'login', 'team', 'admin', 'admin-login', 'profile'].forEach(page => {
  app.get(`/${page}`, (req, res, next) => {
    if (sendPage(res, page === 'team' ? 'team' : page)) {
      return; // File sent successfully
    }
    return next(); // File not found, continue to next middleware
  });
});

// Nested team pages: /team/<section> -> always serve team.html (frontend router handles section)
app.get('/team/:section', (req, res, next) => {
  if (sendPage(res, 'team')) {
    return; // File sent successfully
  }
  return next(); // File not found, continue to next middleware
});

// Legacy: /pages/<name> (for backward compatibility)
app.get('/pages/:page', (req, res, next) => {
  if (sendPage(res, req.params.page)) {
    return; // File sent successfully
  }
  return next(); // File not found, continue to next middleware
});

// Use database adapter methods
const runAsync = db.runAsync.bind(db);
const allAsync = db.allAsync.bind(db);
const getAsync = db.getAsync.bind(db);
async function ensureSchema(){
  try{
    // PostgreSQL uses different syntax, but our adapter handles conversion
    const autoIncrement = db.type === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const textType = 'TEXT'; // Both support TEXT
    const checkConstraint = db.type === 'postgres' ? 'CHECK (id=1)' : 'CHECK (id=1)';
    
    await runAsync(`CREATE TABLE IF NOT EXISTS teams (
      id ${autoIncrement},
      team_name ${textType},
      login ${textType},
      password ${textType},
      captain_name ${textType},
      captain_email ${textType} UNIQUE,
      captain_phone ${textType},
      members ${textType},
      school ${textType},
      city ${textType},
      category_id INTEGER,
      created_at ${textType}
    )`);
    // Password reset codes table
    await runAsync(`CREATE TABLE IF NOT EXISTS password_reset_codes (
      id ${autoIncrement},
      email ${textType},
      code ${textType},
      expires_at ${textType},
      used INTEGER DEFAULT 0,
      created_at ${textType}
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS tests (
      id ${autoIncrement},
      title ${textType},
      description ${textType},
      lang ${textType} DEFAULT 'ru',
      duration_minutes INTEGER DEFAULT 60,
      window_start ${textType},
      window_end ${textType},
      category_id INTEGER,
      created_at ${textType}
    )`);
    // best-effort schema upgrades for existing DBs
    try{ await runAsync('ALTER TABLE teams ADD COLUMN category_id INTEGER'); }catch(e){}
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN lang ${textType} DEFAULT 'ru'`); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN duration_minutes INTEGER DEFAULT 60'); }catch(e){}
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN window_start ${textType}`); }catch(e){}
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN window_end ${textType}`); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN category_id INTEGER'); }catch(e){}
    await runAsync(`CREATE TABLE IF NOT EXISTS categories (
      id ${autoIncrement},
      name_ru ${textType} NOT NULL,
      name_ky ${textType} NOT NULL,
      desc_ru ${textType},
      desc_ky ${textType},
      created_at ${textType}
    )`);
    // best-effort schema upgrades (ignore if already added)
    try{ await runAsync(`ALTER TABLE categories ADD COLUMN desc_ru ${textType}`); }catch(e){}
    try{ await runAsync(`ALTER TABLE categories ADD COLUMN desc_ky ${textType}`); }catch(e){}
    await runAsync(`CREATE TABLE IF NOT EXISTS questions (
      id ${autoIncrement},
      test_id INTEGER,
      ordinal INTEGER,
      text ${textType},
      options ${textType},
      correct ${textType},
      points INTEGER DEFAULT 1,
      lang ${textType} DEFAULT 'ru',
      category_id INTEGER,
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS results (
      id ${autoIncrement},
      team_id INTEGER,
      test_id INTEGER,
      score INTEGER,
      answers ${textType},
      taken_at ${textType},
      FOREIGN KEY(team_id) REFERENCES teams(id),
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      badge1_ru ${textType}, badge1_ky ${textType},
      badge2_ru ${textType}, badge2_ky ${textType},
      badge3_ru ${textType}, badge3_ky ${textType},
      day1_date ${textType}, day2_date ${textType}, day3_date ${textType},
      final_place_ru ${textType}, final_place_ky ${textType},
      updated_at ${textType}
    )`);
    // Ensure categories exist
    const cats = [
      { 
        ru: 'Кыргызстан таануу', 
        ky: 'Кыргызстан таануу',
        desc_ru: 'Глубокое изучение истории Кыргызстана, её географии и природного богатства. Знакомство с национальной культурой, древними традициями и обычаями кыргызского народа. Основы Конституции и государственного устройства. Выдающиеся личности, сформировавшие историю нации. Экономическое развитие и будущее страны.',
        desc_ky: 'Кыргызстандын бай тарыхын, географиясын жана табигый ресурсаларын изилдөө. Улуттук маданият, салт-санаа жана каада-жөрөлгөлөр менен таанышуу. Конституция, мамлекеттик түзүлүш жана жарандык жоопкерчилик боюнча негизги түшүнүктөр. Өлкөнүн өнүгүшүнө салым кошкон тарыхый инсандар. Бүгүнкү Кыргызстан жана анын келечеги жөнүндө ой жүгүртүү.'
      },
      { 
        ru: 'Дүйнөлүк тарых жана азыркы саясат', 
        ky: 'Дүйнөлүк тарых жана азыркы саясат',
        desc_ru: 'История развития человеческой цивилизации от древних времён до современности. Великие империи, революции и войны, сформировавшие мировой порядок. Жизнь и деятельность выдающихся исторических деятелей. Понимание причинно-следственных связей исторических событий. Современная геополитика и международные отношения.',
        desc_ky: 'Адамзат цивилизациясынын байыркы доорлордон бүгүнкү күнгө чейинки өнүгүүсү. Дүйнөлүк тартипти өзгөрткөн ири империялар, революциялар жана согуштар. Ар кайсы доордогу тарыхый инсандардын ролу жана таасири. Окуялардын себеп-натыйжа байланышын талдоо көндүмдөрү. Азыркы геосаясат, регионалдык жаңжалдар жана эл аралык уюмдар тууралуу түшүнүк.'
      },
      { 
        ru: 'Илим жана технологиялар', 
        ky: 'Илим жана технологиялар',
        desc_ru: 'Комплексное изучение физики, химии, биологии и математики как основ современной науки. Практическое применение научных знаний в программировании и информационных технологиях. Развитие логического и алгоритмического мышления. Изучение современных научных открытий и инноваций. Развитие навыков научного анализа и исследования.',
        desc_ky: 'Физика, химия, биология жана математика сыяктуу табигый илимдердин негизги түшүнүктөрү. Программалоо жана маалыматтык технологиялар аркылуу илимий идеяларды практикада колдонуу. Логикалык, критикалык жана алгоритмдик ой жүгүртүүнү өнүктүрүү. Заманбап ачылыштар, жасалма интеллект, санариптик коопсуздук сыяктуу багыттар менен таанышуу. Эксперимент жүргүзүү, жыйынтык чыгаруу жана илимий долбоор жасоо көндүмдөрү.'
      },
      { 
        ru: 'Тил жана адабият', 
        ky: 'Тил жана адабият',
        desc_ru: 'Углубленное изучение русского языка: грамматика, пунктуация, орфография и стилистика. Основы кыргызского языка и его уникальные особенности. Классическая и современная литература обоих народов. Анализ литературных произведений, их идейного содержания и художественных приёмов. Развитие культуры речи и литературного вкуса.',
        desc_ky: 'Орус жана кыргыз тилдеринин грамматикасы, орфографиясы, тыныш белгилери жана стилистикасы боюнча терең билим алуу. Кыргыз тилинин бай сөздүгү жана диалекттик өзгөчөлүктөрү менен таанышуу. Кыргыз жана орус адабиятынын классикалык жана заманбап чыгармаларын окуу. Каармандардын образын, идеялык мазмунун жана көркөм ыкмаларды талдоо. Оозеки жана жазма сөз маданиятын, адабий даамды жана чыгармачылык жазуу көндүмдөрүн өнүктүрүү.'
      }
    ];
    
    const existingCats = await allAsync('SELECT name_ru FROM categories');
    if (existingCats.length === 0) {
      const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
      for (const c of cats){ 
        await runAsync(`INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES (?,?,?,?,${nowFunc})`, [c.ru, c.ky, c.desc_ru, c.desc_ky]); 
      }
      console.log('✓ Seeded categories');
    }

    // Always ensure актуальные кыргызча тексттер для категориялар
    const updatedKyDescs = {
      'Кыргызстан таануу': 'Кыргызстандын бай тарыхын, географиясын жана табигый ресурсаларын изилдөө. Улуттук маданият, салт-санаа жана каада-жөрөлгөлөр менен таанышуу. Конституция, мамлекеттик түзүлүш жана жарандык жоопкерчилик боюнча негизги түшүнүктөр. Өлкөнүн өнүгүшүнө салым кошкон тарыхый инсандар. Бүгүнкү Кыргызстан жана анын келечеги жөнүндө ой жүгүртүү.',
      'Дүйнөлүк тарых жана азыркы саясат': 'Адамзат цивилизациясынын байыркы доорлордон бүгүнкү күнгө чейинки өнүгүүсү. Дүйнөлүк тартипти өзгөрткөн ири империялар, революциялар жана согуштар. Ар кайсы доордогу тарыхый инсандардын ролу жана таасири. Окуялардын себеп-натыйжа байланышын талдоо көндүмдөрү. Азыркы геосаясат, регионалдык жаңжалдар жана эл аралык уюмдар тууралуу түшүнүк.',
      'Илим жана технологиялар': 'Физика, химия, биология жана математика сыяктуу табигый илимдердин негизги түшүнүктөрү. Программалоо жана маалыматтык технологиялар аркылуу илимий идеяларды практикада колдонуу. Логикалык, критикалык жана алгоритмдик ой жүгүртүүнү өнүктүрүү. Заманбап ачылыштар, жасалма интеллект, санариптик коопсуздук сыяктуу багыттар менен таанышуу. Эксперимент жүргүзүү, жыйынтык чыгаруу жана илимий долбоор жасоо көндүмдөрү.',
      'Тил жана адабият': 'Орус жана кыргыз тилдеринин грамматикасы, орфографиясы, тыныш белгилери жана стилистикасы боюнча терең билим алуу. Кыргыз тилинин бай сөздүгү жана диалекттик өзгөчөлүктөрү менен таанышуу. Кыргыз жана орус адабиятынын классикалык жана заманбап чыгармаларын окуу. Каармандардын образын, идеялык мазмунун жана көркөм ыкмаларды талдоо. Оозеки жана жазма сөз маданиятын, адабий даамды жана чыгармачылык жазуу көндүмдөрүн өнүктүрүү.'
    };
    for (const [nameRu, descKy] of Object.entries(updatedKyDescs)) {
      await runAsync('UPDATE categories SET desc_ky = ? WHERE name_ru = ?', [descKy, nameRu]);
    }
    
    const any = await getAsync('SELECT id FROM tests LIMIT 1');
    if (!any){
      const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
      const stmt = await runAsync(`INSERT INTO tests (title, description, lang, duration_minutes, window_start, window_end, created_at) VALUES (?,?,?,?,?,?,${nowFunc})${db.type === 'postgres' ? ' RETURNING id' : ''}`, ["Demo Test","Sample demo test","ru",30,null,null]);
      const testId = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID;
      const qs = [
        {ordinal:1, text:'What is the capital of Kyrgyzstan?', options: JSON.stringify(['Bishkek','Osh','Jalal-Abad','Naryn']), correct:'0', points:1},
        {ordinal:2, text:'2+2 = ?', options: JSON.stringify(['3','4','5','22']), correct:'1', points:1},
        {ordinal:3, text:'Name the largest lake in Kyrgyzstan.', options: JSON.stringify(['Issyk-Kul','Song-Kul','','']), correct:'0', points:1}
      ];
      for (const q of qs){ await runAsync('INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang) VALUES (?,?,?,?,?,?,?)',[testId, q.ordinal, q.text, q.options, q.correct, q.points, 'ru']); }
      console.log('✓ Seeded demo test');
    }
    const sAny = await getAsync('SELECT id FROM settings WHERE id=1');
    if(!sAny){
      const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
      await runAsync(`INSERT INTO settings (id,badge1_ru,badge1_ky,badge2_ru,badge2_ky,badge3_ru,badge3_ky,day1_date,day2_date,day3_date,final_place_ru,final_place_ky,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,${nowFunc})`, [
        'Регистрация открыта!','Каттоо ачык!','Сдайте тест в кабинете.','Кабинетте тест тапшырыңыз.','Удачи!','Ийгилик!',
        '2025-12-05','2025-12-15','2025-12-27','Президентский лицей «Акылман» (Чолпон-Ата)','«Акылман» Президенттик лицейи (Чолпон-Ата)'
      ]);
    }
    // Ensure filesystem folder for file-backed tests data exists
    try{ if(!fs.existsSync(TESTS_DIR)) fs.mkdirSync(TESTS_DIR, { recursive: true }); }catch(e){ console.error('Cannot ensure tests dir', e); }
    console.log('Schema ready');
  }catch(e){ console.error('Schema error', e); }
}
// File-based questions storage helpers
function testFilePath(testId){ return path.join(TESTS_DIR, `test_${String(testId)}.json`); }
function readQuestionsFile(testId){
  const fp = testFilePath(testId);
  if(!fs.existsSync(fp)) return [];
  try{
    const data = JSON.parse(fs.readFileSync(fp,'utf8'));
    return Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
  }catch(e){ console.error('Failed to read test file', fp, e); return []; }
}
function writeQuestionsFile(testId, questions){
  try{
    const fp = testFilePath(testId);
    fs.writeFileSync(fp, JSON.stringify(questions, null, 2), 'utf8');
    const fd = fs.openSync(fp, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if(process.env.DEBUG) console.log(`✓ Saved ${questions.length} questions to test_${testId}.json`);
  }catch(e){ console.error(`✗ Failed to write test file ${testId}:`, e.message); throw e; }
}
function nextQuestionId(questions){
  let maxId = 0;
  for(const q of questions){ const id = parseInt(q.id,10); if(!isNaN(id) && id>maxId) maxId=id; }
  return maxId+1;
}
// utils
function signTeamToken(team){ return jwt.sign({ id: team.id, team_name: team.team_name, login: team.login }, JWT_SECRET, { expiresIn: '12h' }); }
// Parse human-readable window like "22.10.2025-18:00 до 22.10.2025-19:00" into ISO
// Время интерпретируется как UTC для консистентности на Render
function parseHumanWindow(windowRange){
  if(!windowRange || typeof windowRange !== 'string') return { start:null, end:null };
  const parts = windowRange.split(/\s*до\s*/i);
  if(parts.length !== 2) return { start:null, end:null };
  function toIso(s){
    // DD.MM.YYYY-HH:MM - интерпретируем как UTC
    const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[- ](\d{1,2}):(\d{2})$/);
    if(!m) return null;
    const [_, dd, mm, yyyy, hh, min] = m;
    // Создаем дату в UTC для консистентности на Render
    const date = new Date(Date.UTC(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(min), 0));
    if(isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  const start = toIso(parts[0]);
  const end = toIso(parts[1]);
  return { start, end };
}
app.post('/api/register', async (req,res)=>{
  try{
    const data = req.body;
    if (!data.team_name || !data.password || !data.captain_email) return res.status(400).json({ error:'Missing fields' });
    const email = data.captain_email || '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(!emailOk) return res.status(400).json({ error:'Invalid email' });
    const pw = data.password || '';
    if(!(pw.length>=8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw))) return res.status(400).json({ error:'Weak password: must have 8+ chars, uppercase, lowercase, and number' });
    const exists = await getAsync('SELECT id FROM teams WHERE captain_email = ?', [email]);
    if (exists) return res.status(400).json({ error:'Email already registered' });
    const hashed = await bcrypt.hash(data.password, 10);
    const members_json = JSON.stringify(data.members || []);
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    // Generate a random login for backward compatibility (not used for auth)
    const randomLogin = 'team_' + Math.random().toString(36).substring(2, 15);
    const categoryId = data.category_id ? parseInt(data.category_id, 10) || null : null;
    await runAsync(
      `INSERT INTO teams (team_name, login, password, captain_name, captain_email, captain_phone, members, school, city, category_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,${nowFunc})`,
      [data.team_name, randomLogin, hashed, data.captain_name, data.captain_email, data.captain_phone, members_json, data.school, data.city, categoryId]
    );
    console.log(`✓ Team registered: ${data.team_name} (${email})`);
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ error:e.message }); }
});

// Test email configuration on startup
async function testEmailConfig() {
  // HTTP‑API (Resend) – основной вариант для продакшена на Render
  if (EMAIL_PROVIDER === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || 'Akylman Quiz <onboarding@resend.dev>';
    
    if (!apiKey) {
      console.warn('⚠️  Email provider set to "resend", но RESEND_API_KEY не задан.');
      console.warn('   Письма для сброса пароля отправляться не будут.');
      console.warn('   См. docs/EMAIL_SETUP.md для настроек Resend.');
      return false;
    }
    
    console.log('✓ Email provider: Resend (HTTP API)');
    console.log(`   From: ${from}`);
    return true;
  }

  // Gmail SMTP – используется в основном для локальной разработки
  const hasUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const hasPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  
  if (!hasUser || !hasPass) {
    console.warn('⚠️  Email configuration missing for Gmail SMTP:');
    console.warn('   GMAIL_USER or SMTP_USER not set');
    console.warn('   GMAIL_APP_PASSWORD or SMTP_PASS not set');
    console.warn('   Password reset emails will not be sent (Gmail).');
    console.warn('   См. docs/EMAIL_SETUP.md для настроек Gmail или используйте Resend.');
    return false;
  }
  
  console.log('✓ Email provider: Gmail SMTP');
  console.log(`   User: ${hasUser}`);
  console.log(`   Password: ${hasPass.substring(0, 4)}...`);
  
  // Try to verify connection (non-blocking)
  emailTransporter.verify((error, success) => {
    if (error) {
      console.warn('⚠️  Email service verification failed:', error.message);
      console.warn('   Emails may not be sent. Check your Gmail credentials.');
    } else {
      console.log('✓ Email service connection verified');
    }
  });
  
  return true;
}
app.post('/api/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error:'Email and password required' });
    const team = await getAsync('SELECT id, team_name, login, password, captain_name, captain_email FROM teams WHERE captain_email = ?', [email]);
    if (!team) return res.status(401).json({ error:'Неправильный логин или пароль' });
    const ok = await bcrypt.compare(password, team.password);
    if (!ok) return res.status(401).json({ error:'Неправильный логин или пароль' });
    const token = signTeamToken(team);
    res.json({ ok:true, team: { id:team.id, team_name: team.team_name, login: team.login, captain_name: team.captain_name, captain_email: team.captain_email, token } });
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});

// Helper: build HTML for password reset email
function buildPasswordResetEmailHtml(team, code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Сброс пароля</h2>
      <p>Здравствуйте, ${team.captain_name || 'пользователь'}!</p>
      <p>Вы запросили сброс пароля для вашей команды в Akylman Quiz Bowl.</p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 10px 0;">Ваш код для сброса пароля:</p>
        <p style="font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</p>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Этот код действителен в течение 15 минут.</p>
      <p style="color: #ef4444; font-size: 14px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
    </div>
  `;
}

// Helper: send password reset email via selected provider
async function sendPasswordResetEmail({ email, team, code }) {
  const subject = 'Код сброса пароля - Akylman Quiz Bowl';
  const html = buildPasswordResetEmailHtml(team, code);

  // Preferred provider: Resend (HTTP API, отлично подходит для Render)
  if (EMAIL_PROVIDER === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || 'Akylman Quiz <onboarding@resend.dev>';

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set');
    }

    console.log(`Attempting to send password reset email via Resend to ${email}...`);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: email,
        subject,
        html
      })
    });

    const text = await response.text();
    if (!response.ok) {
      console.error('✗ Resend API error:', response.status, text);
      throw new Error(`Resend API error: ${response.status}`);
    }

    console.log(`✓ Password reset email sent via Resend to ${email}`);
    return;
  }

  // Fallback: Gmail SMTP через nodemailer (локальная разработка)
  const emailUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const emailPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!emailUser || !emailPass) {
    throw new Error('Gmail SMTP is not configured');
  }

  console.log(`Attempting to send password reset email via Gmail SMTP to ${email}...`);

  const emailPromise = emailTransporter.sendMail({
    from: process.env.SMTP_FROM || emailUser,
    to: email,
    subject,
    html
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Email sending timeout (30s)')), 30000)
  );

  const startTime = Date.now();
  await Promise.race([emailPromise, timeoutPromise]);
  const duration = Date.now() - startTime;
  console.log(`✓ Password reset email sent via Gmail SMTP to ${email} (took ${duration}ms)`);
}

// Password reset: request code
app.post('/api/password-reset/request', async (req,res)=>{
  try{
    const { email } = req.body;
    if (!email) return res.status(400).json({ error:'Email required' });
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error:'Invalid email format' });
    }
    
    const team = await getAsync('SELECT id, captain_name FROM teams WHERE captain_email = ?', [email]);
    if (!team) {
      // Don't reveal if email exists for security - but still return success after a delay
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing time
      return res.json({ ok:true, message:'If email exists, reset code has been sent' });
    }
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    
    // For PostgreSQL, calculate expiration time in JavaScript, for SQLite use datetime function
    let expiresAt;
    if (db.type === 'postgres') {
      const expiresDate = new Date();
      expiresDate.setMinutes(expiresDate.getMinutes() + 15);
      expiresAt = expiresDate.toISOString();
    } else {
      expiresAt = null; // Will use SQL function
    }
    
    // Delete old codes for this email
    await runAsync('DELETE FROM password_reset_codes WHERE email = ?', [email]);
    
    // Insert new code
    if (db.type === 'postgres') {
      await runAsync(`INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES (?,?,?,${nowFunc})`, [email, code, expiresAt]);
    } else {
      await runAsync(`INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES (?,?,datetime('now', '+15 minutes'),${nowFunc})`, [email, code]);
    }
    
    console.log(`Password reset code generated for ${email}: ${code}`);
    
    let emailSent = false;
    try {
      await sendPasswordResetEmail({ email, team, code });
      emailSent = true;
    } catch (emailError) {
      const errorMsg = emailError.message || 'Unknown error';
      console.error('✗ Failed to send password reset email:', errorMsg);
    }
    
    // Always return success (for security), but log if email failed
    if (!emailSent) {
      console.warn(`WARNING: Password reset code generated but email not sent to ${email}. Code: ${code}`);
    }
    
    res.json({ ok:true, message:'If email exists, reset code has been sent' });
  }catch(e){
    console.error('Password reset request error:', e);
    res.status(500).json({ error:'Server error. Please try again later.' });
  }
});

// Password reset: verify code only (step 2)
app.post('/api/password-reset/verify-code', async (req,res)=>{
  try{
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error:'Email and code required' });
    
    // Check code
    let resetCode;
    if (db.type === 'postgres') {
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()', [email, code]);
    } else {
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime(\'now\')', [email, code]);
    }
    
    if (!resetCode) {
      return res.status(400).json({ error:'Неверный или истекший код' });
    }
    
    res.json({ ok:true, message:'Code verified successfully' });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});

// Password reset: verify code and reset password (step 3)
app.post('/api/password-reset/verify', async (req,res)=>{
  try{
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error:'Email, code and new password required' });
    
    // Validate password strength
    if(!(newPassword.length>=8 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /\d/.test(newPassword))) {
      return res.status(400).json({ error:'Weak password: must have 8+ chars, uppercase, lowercase, and number' });
    }
    
    // Check code
    let resetCode;
    if (db.type === 'postgres') {
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at::timestamp > NOW()', [email, code]);
    } else {
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime(\'now\')', [email, code]);
    }
    
    if (!resetCode) {
      return res.status(400).json({ error:'Неверный или истекший код' });
    }
    
    // Update password
    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE teams SET password = ? WHERE captain_email = ?', [hashed, email]);
    
    // Mark code as used
    await runAsync('UPDATE password_reset_codes SET used = 1 WHERE id = ?', [resetCode.id]);
    
    console.log(`Password reset successful for ${email}`);
    res.json({ ok:true, message:'Password reset successfully' });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});
function adminAuth(req,res,next){ const token = req.headers['x-admin-token'] || ''; if (!token || !token.startsWith('admin-')) return res.status(403).json({ error:'Forbidden' }); next(); }
app.get('/api/tests', async (req,res)=>{
  try{
    const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) || null : null;
    let tests;
    if (categoryId) {
      tests = await allAsync(
        'SELECT id,title,description,lang,duration_minutes,window_start,window_end,category_id FROM tests WHERE category_id = ? ORDER BY id',
        [categoryId]
      );
    } else {
      tests = await allAsync(
        'SELECT id,title,description,lang,duration_minutes,window_start,window_end,category_id FROM tests ORDER BY id'
      );
    }
    // Фильтрация по окнам времени
    // Используем UTC для консистентности на Render
    const now = Date.now(); // Текущее время в миллисекундах (UTC)
    const filtered = tests.filter(t => {
      if (!t.window_start && !t.window_end) return true;
      let start = null;
      let end = null;
      if (t.window_start) {
        const startDate = new Date(t.window_start);
        if (!isNaN(startDate.getTime())) start = startDate.getTime();
      }
      if (t.window_end) {
        const endDate = new Date(t.window_end);
        if (!isNaN(endDate.getTime())) end = endDate.getTime();
      }
      // Сравниваем в миллисекундах для корректной работы на Render
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;
    });
    res.json(filtered);
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});
app.get('/api/tests/:id', async (req,res)=>{
  try{
    const testId = req.params.id;
    // Проверяем окно доступности теста
    const meta = await getAsync('SELECT window_start, window_end FROM tests WHERE id = ?', [testId]);
    if (meta) {
      const now = Date.now(); // Текущее время в миллисекундах (UTC)
      let start = null;
      let end = null;
      if (meta.window_start) {
        const startDate = new Date(meta.window_start);
        if (!isNaN(startDate.getTime())) start = startDate.getTime();
      }
      if (meta.window_end) {
        const endDate = new Date(meta.window_end);
        if (!isNaN(endDate.getTime())) end = endDate.getTime();
      }
      // Сравниваем в миллисекундах для корректной работы на Render
      if (start && now < start) {
        return res.status(403).json({ error: 'Тест ещё недоступен' });
      }
      if (end && now > end) {
        return res.status(403).json({ error: 'Окно теста уже закрыто' });
      }
    }
    // Основной источник — таблица questions; файл используется только для очень старых данных
    let rows = await allAsync(
      'SELECT id, ordinal, text, options, points, correct, category_id, lang FROM questions WHERE test_id=? ORDER BY ordinal',
      [testId]
    );
    if (!rows.length) {
      // Fallback: импорт из JSON‑файла (для старых БД)
      const fileQs = readQuestionsFile(testId);
      rows = fileQs.map(q => ({
        id: q.id,
        ordinal: q.ordinal || 0,
        text: q.text || '',
        options: q.options || [],
        points: q.points || 1,
        correct: q.correct || '',
        category_id: q.category_id || null,
        lang: q.lang || 'ru'
      }));
    } else {
      rows.forEach(r => {
        try { r.options = JSON.parse(r.options || '[]'); } catch { r.options = []; }
      });
    }
    res.json(rows);
  }catch(e){ res.status(500).json({ error:e.message }); }
});
// Public categories (for homepage rendering)
app.get('/api/categories', async (req,res)=>{ try{ const rows = await allAsync('SELECT id, name_ru, name_ky, desc_ru, desc_ky FROM categories ORDER BY id'); res.json(rows); }catch(e){ res.status(500).json({ error:e.message }); } });
function teamAuth(req,res,next){ const auth = req.headers['authorization'] || ''; if (!auth.startsWith('Bearer ')) return res.status(401).json({ error:'Missing token' }); const token = auth.slice(7); try{ const payload = jwt.verify(token, JWT_SECRET); req.team = payload; next(); }catch(e){ return res.status(401).json({ error:'Invalid token' }); } }
app.post('/api/tests/:id/submit', teamAuth, async (req,res)=>{
  try{
    const testId = req.params.id;
    const answers = req.body.answers || {};

    // Берём вопросы так же, как в /api/tests/:id: сначала из БД, затем (если нужно) из файла
    let qs = await allAsync(
      'SELECT id, ordinal, text, options, correct, points, category_id, lang FROM questions WHERE test_id=? ORDER BY ordinal',
      [testId]
    );
    if (!Array.isArray(qs) || qs.length === 0) {
      const fileQs = readQuestionsFile(testId);
      qs = fileQs.map(q => ({
        id: q.id,
        ordinal: q.ordinal || 0,
        text: q.text || '',
        options: Array.isArray(q.options) ? q.options : [],
        correct: q.correct,
        points: q.points || 1,
        category_id: q.category_id || null,
        lang: q.lang || 'ru'
      }));
    } else {
      qs.forEach(r => {
        try { r.options = JSON.parse(r.options || '[]'); } catch { r.options = []; }
      });
    }

    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    const answersArr = [];

    for (const q of qs){
      const qid = q.id;
      const pts = q.points || 1;
      maxScore += pts;

      const given = Object.prototype.hasOwnProperty.call(answers, qid) ? answers[qid] : null;
      const correct = q.correct;
      let qok = false;

      if (correct === null || correct === undefined || correct === '') {
        qok = false;
      } else if (String(correct).match(/^\d+$/)) {
        // Вариант с единственным правильным вариантом ответа (индекс опции)
        if (given !== null && given !== undefined && String(given) === String(correct)) {
          qok = true;
        }
      } else {
        // Текстовый ответ: сравнение без учёта регистра и пробелов по краям
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

    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    await runAsync(
      `INSERT INTO results (team_id, test_id, score, answers, taken_at) VALUES (?,?,?,?,${nowFunc})`,
      [req.team.id, testId, score, JSON.stringify(answersArr)]
    );
    console.log(`✓ Test submitted: team_id=${req.team.id}, test_id=${testId}, score=${score}, correct=${correctCount}/${qs.length}`);
    res.json({ ok:true, score, maxScore, correct: correctCount, total: qs.length });
  }catch(e){
    console.error('Error in /api/tests/:id/submit', e);
    res.status(500).json({ error:e.message });
  }
});
app.get('/api/me', teamAuth, async (req,res)=>{
  try{
    const t = await getAsync(
      `SELECT 
         t.id,
         t.team_name,
         t.login,
         t.captain_name,
         t.captain_email,
         t.captain_phone,
         t.members,
         t.school,
         t.city,
         t.category_id,
         c.name_ru AS category_name_ru,
         c.name_ky AS category_name_ky
       FROM teams t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = ?`,
      [req.team.id]
    );
    if (!t) return res.status(404).json({ error:'Team not found' });
    // Parse members JSON string to array
    if (t.members && typeof t.members === 'string') {
      try {
        t.members = JSON.parse(t.members);
      } catch(e) {
        t.members = [];
      }
    } else if (!t.members) {
      t.members = [];
    }
    res.json({ ok:true, team: t });
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});

// Update current team profile (except email & login)
app.put('/api/me', teamAuth, async (req, res) => {
  try {
    const allowedFields = ['team_name', 'captain_name', 'captain_phone', 'school', 'city', 'members', 'category_id'];
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'members') {
          const members = Array.isArray(req.body.members) ? req.body.members : [];
          updates.push('members = ?');
          params.push(JSON.stringify(members));
        } else {
          updates.push(`${field} = ?`);
          params.push(req.body[field] ?? null);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.team.id);
    await runAsync(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`, params);

    const t = await getAsync('SELECT id, team_name, login, captain_name, captain_email, captain_phone, members, school, city FROM teams WHERE id=?',[req.team.id]);
    if (t && t.members && typeof t.members === 'string') {
      try { t.members = JSON.parse(t.members); } catch { t.members = []; }
    }
    res.json({ ok: true, team: t });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Change password for current team (requires old password)
app.post('/api/me/verify-password', teamAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const team = await getAsync('SELECT id, password FROM teams WHERE id = ?', [req.team.id]);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const ok = await bcrypt.compare(password, team.password);
    if (!ok) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/me/change-password', teamAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new password required' });
    }

    // Validate new password strength
    if (!(newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /\d/.test(newPassword))) {
      return res.status(400).json({ error: 'Пароль не соответствует требованиям: минимум 8 символов, заглавная, строчная буква и цифра' });
    }

    const team = await getAsync('SELECT id, password FROM teams WHERE id = ?', [req.team.id]);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const ok = await bcrypt.compare(oldPassword, team.password);
    if (!ok) {
      return res.status(400).json({ error: 'Старый пароль неверен' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await runAsync('UPDATE teams SET password = ? WHERE id = ?', [hashed, req.team.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/me/results', teamAuth, async (req,res)=>{ 
  try{ 
    const rows = await allAsync(`
      SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name, c.name_ru as category_name
      FROM results r
      LEFT JOIN tests t ON t.id = r.test_id
      LEFT JOIN teams tm ON tm.id = r.team_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE r.team_id = ?
      ORDER BY r.taken_at DESC
    `, [req.team.id]); 
    const processed = rows.map(r => {
      let correct = 0;
      let total = 0;
      if (r.answers) {
        try {
          const answers = JSON.parse(r.answers);
          total = answers.length;
          correct = answers.filter(a => a.ok).length;
        } catch (e) {
          correct = r.score || 0;
          total = 0;
        }
      }
      let formatted_date = '';
      if (r.taken_at) {
        const date = new Date(r.taken_at);
        // Используем UTC методы для консистентности на Render
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
        taken_at_formatted: formatted_date
      };
    });
    res.json(processed);
  }catch(e){ res.status(500).json({ error:e.message }); } 
});
app.get('/api/admin/tests', adminAuth, async (req,res)=>{
  try{
    const tests = await allAsync(
      `SELECT t.*, c.name_ru AS category_name_ru, c.name_ky AS category_name_ky
       FROM tests t
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.id DESC`
    );
    res.json(tests);
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});
app.post('/api/admin/tests', adminAuth, async (req,res)=>{
  try{
    const { title, description, lang, duration_minutes, window_start, window_end, window_range, category_id } = req.body;
    // Категория обязательна
    const catId = category_id ? parseInt(category_id, 10) || null : null;
    if (!catId) {
      return res.status(400).json({ error: 'category_id is required' });
    }
    const range = parseHumanWindow(window_range);
    const ws = range.start || window_start || null;
    const we = range.end || window_end || null;
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    const stmt = await runAsync(
      `INSERT INTO tests (title, description, lang, duration_minutes, window_start, window_end, category_id, created_at)
       VALUES (?,?,?,?,?,?,?,${nowFunc})${db.type === 'postgres' ? ' RETURNING id' : ''}`,
      [title, description, lang || 'ru', duration_minutes || 30, ws, we, catId]
    );
    const testId = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID;
    res.json({ ok:true, id: testId });
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});
app.put('/api/admin/tests/:id', adminAuth, async (req,res)=>{
  try{
    const { title, description, lang, duration_minutes, window_start, window_end, window_range, category_id } = req.body;
    // Категория обязательна при обновлении
    const catId = category_id ? parseInt(category_id, 10) || null : null;
    if (!catId) {
      return res.status(400).json({ error: 'category_id is required' });
    }
    const range = parseHumanWindow(window_range);
    const ws = range.start || window_start || null;
    const we = range.end || window_end || null;
    await runAsync(
      'UPDATE tests SET title=?, description=?, lang=?, duration_minutes=?, window_start=?, window_end=?, category_id=? WHERE id=?',
      [title, description, lang || 'ru', duration_minutes || 30, ws, we, catId, req.params.id]
    );
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
app.delete('/api/admin/tests/:id', adminAuth, async (req,res)=>{
  try{
    const id = req.params.id;
    await runAsync('DELETE FROM questions WHERE test_id=?',[id]);
    await runAsync('DELETE FROM tests WHERE id=?',[id]);
    // remove file if exists
    try{ const fp = testFilePath(id); if(fs.existsSync(fp)) fs.unlinkSync(fp); }catch(e){ console.warn('Failed to remove test file', id, e.message); }
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// Delete ALL tests, questions and results (dangerous)
app.delete('/api/admin/tests', adminAuth, async (req,res)=>{
  try{
    // Удаляем в правильном порядке из-за внешних ключей:
    // 1. Сначала results (ссылается на tests)
    // 2. Потом questions (ссылается на tests)  
    // 3. В конце tests
    
    // Удаляем результаты
    try {
      const result1 = await runAsync('DELETE FROM results', []);
      console.log(`Deleted ${result1.changes || 0} results`);
    } catch (e) {
      console.warn('Warning deleting results:', e.message);
      // Продолжаем даже если ошибка
    }
    
    // Удаляем вопросы
    try {
      const result2 = await runAsync('DELETE FROM questions', []);
      console.log(`Deleted ${result2.changes || 0} questions`);
    } catch (e) {
      console.warn('Warning deleting questions:', e.message);
      // Продолжаем даже если ошибка
    }
    
    // Удаляем тесты (это должно работать после удаления зависимостей)
    const result3 = await runAsync('DELETE FROM tests', []);
    console.log(`Deleted ${result3.changes || 0} tests`);
    
    // best-effort: clear JSON files directory
    try{
      if (fs.existsSync(TESTS_DIR)) {
        const files = fs.readdirSync(TESTS_DIR);
        for (const f of files) {
          const fp = path.join(TESTS_DIR, f);
          try{
            if (fs.lstatSync(fp).isFile()) fs.unlinkSync(fp);
          }catch(e){}
        }
      }
    }catch(e){
      console.warn('Failed to clear tests directory:', e.message);
    }
    res.json({ ok:true });
  }catch(e){
    console.error('Error deleting all tests:', e);
    console.error('Error stack:', e.stack);
    res.status(500).json({ error:e.message || 'Не удалось удалить все тесты' });
  }
});

// Categories CRUD
app.get('/api/admin/categories', adminAuth, async (req,res)=>{ try{ const rows = await allAsync('SELECT * FROM categories ORDER BY id'); res.json(rows); }catch(e){ res.status(500).json({ error:e.message }); } });
app.post('/api/admin/categories', adminAuth, async (req,res)=>{ try{ const { name_ru, name_ky, desc_ru, desc_ky } = req.body; const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')'; const stmt = await runAsync(`INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES (?,?,?,?,${nowFunc})${db.type === 'postgres' ? ' RETURNING id' : ''}`,[name_ru, name_ky, desc_ru||null, desc_ky||null]); const catId = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID; res.json({ ok:true, id: catId }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.put('/api/admin/categories/:id', adminAuth, async (req,res)=>{ try{ const { name_ru, name_ky, desc_ru, desc_ky } = req.body; await runAsync('UPDATE categories SET name_ru=?, name_ky=?, desc_ru=?, desc_ky=? WHERE id=?',[name_ru, name_ky, desc_ru||null, desc_ky||null, req.params.id]); res.json({ ok:true }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.delete('/api/admin/categories/:id', adminAuth, async (req,res)=>{ try{ await runAsync('DELETE FROM categories WHERE id=?',[req.params.id]); res.json({ ok:true }); }catch(e){ res.status(500).json({ error:e.message }); } });

// Questions CRUD (DB-backed)
app.get('/api/admin/tests/:id/questions', adminAuth, async (req,res)=>{
  try{
    const testId = req.params.id;
    const rows = await allAsync(
      'SELECT id, test_id, ordinal, text, options, correct, points, category_id, lang FROM questions WHERE test_id=? ORDER BY ordinal',
      [testId]
    );
    rows.forEach(r => {
      try { r.options = JSON.parse(r.options || '[]'); } catch { r.options = []; }
    });
    res.json(rows);
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/admin/tests/:id/questions', adminAuth, async (req,res)=>{
  try{
    const testId = parseInt(req.params.id, 10);
    const { ordinal, text, options, correct, points, category_id, lang } = req.body;
    const optsJson = JSON.stringify(Array.isArray(options) ? options : []);
    const ord = ordinal || 0;
    const catId = category_id ? parseInt(category_id, 10) || null : null;
    const stmt = await runAsync(
      'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id) VALUES (?,?,?,?,?,?,?,?)',
      [testId, ord, text || '', optsJson, (correct ?? ''), points || 1, lang || 'ru', catId]
    );
    const qid = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID;
    res.json({ ok:true, id: qid });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});

app.put('/api/admin/questions/:qid', adminAuth, async (req,res)=>{
  try{
    const qid = parseInt(req.params.qid,10);
    const { ordinal, text, options, correct, points, category_id } = req.body;
    const fields = [];
    const params = [];

    if (ordinal !== undefined) { fields.push('ordinal = ?'); params.push(ordinal || 0); }
    if (text !== undefined)    { fields.push('text = ?'); params.push(text || ''); }
    if (options !== undefined) {
      const optsJson = JSON.stringify(Array.isArray(options) ? options : []);
      fields.push('options = ?'); params.push(optsJson);
    }
    if (correct !== undefined) { fields.push('correct = ?'); params.push(correct ?? ''); }
    if (points !== undefined)  { fields.push('points = ?'); params.push(points || 1); }
    if (category_id !== undefined) {
      const catId = category_id ? parseInt(category_id, 10) || null : null;
      fields.push('category_id = ?'); params.push(catId);
    }

    if (!fields.length) return res.json({ ok:true });

    params.push(qid);
    await runAsync(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});

app.delete('/api/admin/questions/:qid', adminAuth, async (req,res)=>{
  try{
    const qid = parseInt(req.params.qid,10);
    await runAsync('DELETE FROM questions WHERE id = ?', [qid]);
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message });
  }
});

// CSV helpers and routes
function toCsvValue(v){
  if(v == null || v === undefined) return '""';
  const s = String(v);
  // Always wrap in quotes to match Google Forms format
  return '"' + s.replace(/"/g, '""') + '"';
}
function parseCsv(text){ const rows=[]; let i=0, field=''; let row=[]; let inq=false; const s=text.replace(/\r/g,''); function pushField(){ row.push(field); field=''; } function pushRow(){ rows.push(row); row=[]; } while(i<s.length){ const ch=s[i++]; if(inq){ if(ch==='"'){ if(s[i]==='"'){ field+='"'; i++; } else { inq=false; } } else { field+=ch; } } else { if(ch===','){ pushField(); } else if(ch==='\n'){ pushField(); pushRow(); } else if(ch==='"'){ inq=true; } else { field+=ch; } } } if(field.length>0 || row.length>0){ pushField(); pushRow(); } return rows; }
app.get('/api/admin/tests/:id/questions/export-csv', adminAuth, async (req,res)=>{
  try{
    const testId = req.params.id;
    const qs = await allAsync(
      'SELECT ordinal, text, options, correct, points, category_id FROM questions WHERE test_id=? ORDER BY ordinal',
      [testId]
    );
    const header = 'ordinal,text,options,correct,points,category_id\n';
    const lines = qs.map(q => {
      let opts = '';
      if (q.options) {
        try{
          const arr = JSON.parse(q.options);
          opts = JSON.stringify(arr);
        }catch{
          opts = q.options;
        }
      }
      return [
        q.ordinal,
        toCsvValue(q.text || ''),
        toCsvValue(opts),
        toCsvValue(q.correct || ''),
        q.points || 1,
        q.category_id || ''
      ].join(',');
    });
    const csv = header + lines.join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="test_${testId}_questions.csv"`);
    res.send(csv);
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/admin/tests/:id/questions/import-csv', adminAuth, upload.single('file'), async (req,res)=>{
  try{
    const testId = parseInt(req.params.id, 10);
    const filePath = req.file?.path;
    if(!filePath) return res.status(400).json({ error:'No file' });

    const text = fs.readFileSync(filePath,'utf8');
    const rows = parseCsv(text);
    const header = rows.shift()||[];
    const idx = {
      ordinal: header.indexOf('ordinal'),
      text: header.indexOf('text'),
      options: header.indexOf('options'),
      correct: header.indexOf('correct'),
      points: header.indexOf('points'),
      category_id: header.indexOf('category_id')
    };

    // Очищаем старые вопросы этого теста
    await runAsync('DELETE FROM questions WHERE test_id=?',[testId]);

    let imported = 0;
    for (const r of rows){
      if(!r.length) continue;
      const ordinal = parseInt(r[idx.ordinal]||'0')||0;
      const textv = r[idx.text]||'';
      const optionsRaw = r[idx.options]||'';
      const correct = r[idx.correct]||'';
      const points = parseInt(r[idx.points]||'1')||1;
      const category_id = idx.category_id >= 0 && r[idx.category_id] ? parseInt(r[idx.category_id]) : null;
      let options = [];
      if (optionsRaw) {
        try{
          options = optionsRaw.trim().startsWith('[') ? JSON.parse(optionsRaw) : optionsRaw.split('|').map(s=>s.trim()).filter(Boolean);
        }catch{
          options = optionsRaw.split('|').map(s=>s.trim()).filter(Boolean);
        }
      }
      const optsJson = JSON.stringify(options);
      await runAsync(
        'INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang, category_id) VALUES (?,?,?,?,?,?,?,?)',
        [testId, ordinal, textv, optsJson, correct, points, 'ru', category_id || null]
      );
      imported++;
    }
    res.json({ ok:true, imported });
  }catch(e){
    res.status(500).json({ error:e.message });
  }
});
app.get('/api/ping', (req,res)=>res.json({ ok:true, time: new Date().toISOString() }));

// Admin endpoints for teams and results
app.get('/api/admin/teams', adminAuth, async (req,res)=>{ 
  try{ 
    const teams = await allAsync('SELECT id, team_name, captain_name, captain_email, school, city, created_at FROM teams ORDER BY id DESC'); 
    res.json(teams); 
  }catch(e){ res.status(500).json({ error:e.message }); } 
});

// Danger: wipe teams and results
app.post('/api/admin/reset-teams', adminAuth, async (req,res)=>{
  try{
    await runAsync('DELETE FROM results');
    await runAsync('DELETE FROM teams');
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/results', adminAuth, async (req,res)=>{
  try{
    const results = await allAsync(`
      SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name, c.name_ru as category_name
      FROM results r
      LEFT JOIN tests t ON t.id = r.test_id
      LEFT JOIN teams tm ON tm.id = r.team_id
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY r.taken_at DESC
    `);
    const processed = results.map(r => {
      let correct = 0;
      let total = 0;
      if (r.answers) {
        try {
          const answers = JSON.parse(r.answers);
          total = answers.length;
          correct = answers.filter(a => a.ok).length;
        } catch (e) {
          correct = r.score || 0;
          total = 0;
        }
      }
      let taken_at_formatted = '';
      if (r.taken_at) {
        try {
          const d = new Date(r.taken_at);
          // Используем UTC методы для консистентности на Render
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          const hours = String(d.getUTCHours()).padStart(2, '0');
          const minutes = String(d.getUTCMinutes()).padStart(2, '0');
          taken_at_formatted = `${day}.${month}.${year}-${hours}:${minutes}`;
        } catch (e) {
          taken_at_formatted = '';
        }
      }
      return {
        ...r,
        score_display: total > 0 ? `${correct}/${total}` : `${correct}`,
        taken_at_formatted
      };
    });
    res.json(processed);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/results/export-csv', adminAuth, async (req,res)=>{
  try{
    const results = await allAsync(`
      SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name, c.name_ru as category_name
      FROM results r
      LEFT JOIN tests t ON t.id = r.test_id
      LEFT JOIN teams tm ON tm.id = r.team_id
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY r.taken_at DESC
    `);
    
    const processed = results.map(r => {
      let correct = 0;
      let total = 0;
      if (r.answers) {
        try {
          const answers = JSON.parse(r.answers);
          total = answers.length;
          correct = answers.filter(a => a.ok).length;
        } catch (e) {
          correct = r.score || 0;
          total = 0;
        }
      }
      let taken_at_formatted = '';
      if (r.taken_at) {
        try {
          const d = new Date(r.taken_at);
          // Используем UTC методы для консистентности на Render
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          const hours = String(d.getUTCHours()).padStart(2, '0');
          const minutes = String(d.getUTCMinutes()).padStart(2, '0');
          taken_at_formatted = `${day}.${month}.${year}-${hours}:${minutes}`;
        } catch (e) {
          taken_at_formatted = '';
        }
      }
      return {
        id: r.id,
        team_name: r.team_name || '',
        score_display: total > 0 ? `${correct}/${total}` : `${correct}`,
        taken_at_formatted,
        category_name: r.category_name || ''
      };
    });
    
    const header = ['№ результата', 'Имя команды', 'Баллы', 'Время прохождения', 'Категория теста'].map(toCsvValue).join(',');
    
    if (!processed || processed.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="results_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    
    const rows = processed.map(r => {
      return [
        r.id,
        r.team_name,
        r.score_display,
        r.taken_at_formatted,
        r.category_name
      ].map(toCsvValue).join(',');
    });
    
    const csv = header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="results_export.csv"');
    res.send('\ufeff' + csv);
  }catch(e){
    console.error('Results export error:', e);
    res.status(500).json({ error:e.message });
  }
});

// Export teams to CSV (упрощённый формат для импорта)
app.get('/api/admin/teams/export-csv', adminAuth, async (req,res)=>{
  try{
    const teams = await allAsync(`
      SELECT 
        t.id,
        t.team_name,
        t.captain_email,
        t.captain_phone,
        t.members,
        t.school,
        t.city,
        t.created_at,
        c.name_ru AS category_name_ru
      FROM teams t
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.id ASC
    `);
    const header = ['№', 'Название команды', 'Email', 'Телефон', 'Участники', 'Школа', 'Адрес', 'Дата регистрации', 'Категория'].map(toCsvValue).join(',');
    if(!teams || teams.length === 0){
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="teams_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const lines = teams.map((t, index)=>{
      try{
        let membersStr = '';
        if (t.members) {
          try{
            const arr = JSON.parse(t.members);
            if (Array.isArray(arr)) {
              membersStr = arr.map(m => m && m.name ? String(m.name).trim() : '')
                              .filter(Boolean)
                              .join(', ');
            }
          }catch(e){
            membersStr = String(t.members);
          }
        }
        const categoryName = t.category_name_ru || '';
        return [
          index + 1,
          t.team_name || '',
          t.captain_email || '',
          t.captain_phone || '',
          membersStr || '',
          t.school || '',
          t.city || '',
          t.created_at || '',
          categoryName
        ].map(toCsvValue).join(',');
      }catch(err){
        console.error('Error processing team', t.id, err);
        return '';
      }
    }).filter(line => line.length > 0);
    const csv = header + '\n' + lines.join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="teams_export.csv"');
    res.send('\ufeff' + csv);
  }catch(e){ 
    console.error('Teams export error:', e);
    res.status(500).json({ error:e.message }); 
  }
});

// settings public
app.get('/api/settings', async (req,res)=>{ try{ const s = await getAsync('SELECT * FROM settings WHERE id=1'); res.json(s||{}); }catch(e){ res.status(500).json({ error:e.message }); } });
// settings admin
app.put('/api/admin/settings', adminAuth, async (req,res)=>{
  try{
    const s = req.body||{};
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    await runAsync(`UPDATE settings SET day1_date=?,day2_date=?,day3_date=?,final_place_ru=?,final_place_ky=?,updated_at=${nowFunc} WHERE id=1`, [
      s.day1_date||null,s.day2_date||null,s.day3_date||null,s.final_place_ru||null,s.final_place_ky||null
    ]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// Static files with caching headers for performance
// This MUST be AFTER all API routes to avoid intercepting API requests
app.use('/', express.static(FRONTEND_DIR, {
  maxAge: 5000, // 5 seconds
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Cache all files for 5 seconds
    res.setHeader('Cache-Control', 'public, max-age=5');
  }
}));

ensureSchema().then(() => {
  const dbExists = fs.existsSync(DB_FILE);
  const testsDirExists = fs.existsSync(TESTS_DIR);
  
  // SQLite WAL checkpoint (not needed for PostgreSQL)
  if (db.type === 'sqlite') {
    setInterval(() => {
      try {
        db.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
      } catch (e) {
        console.warn('WAL checkpoint warning:', e.message);
      }
    }, 60000);
  }
  
  // Test email configuration
  testEmailConfig();
  
  app.listen(PORT, () => {
    console.log('');
    console.log('✅ Akylman Quiz Bowl Server Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Data Directory: ${DATA_DIR}`);
    const dbStatus = db.type === 'postgres' ? 'PostgreSQL (persistent)' : (fs.existsSync(DB_FILE) ? '✓ exists' : '✗ new');
    console.log(`🗄️  Database: ${db.type === 'postgres' ? 'PostgreSQL' : DB_FILE} ${dbStatus}`);
    console.log(`📝 Tests: ${TESTS_DIR} ${testsDirExists ? '✓ exists' : '✗ new'}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if(process.env.NODE_ENV === 'production'){
      if(db.type === 'postgres'){
        console.log('✅ PERSISTENT STORAGE MODE - Using PostgreSQL');
        console.log('✓ Data will persist across redeploys');
        console.log('✓ Database: PostgreSQL (managed by Render)');
      } else if(DATA_DIR.includes('/tmp')){
        console.log('⚠️  TEMPORARY STORAGE MODE');
        console.log('⚠️  Data will be LOST when service restarts!');
        console.log('⚠️  To enable persistent storage:');
        console.log('   1. Create PostgreSQL database on Render');
        console.log('   2. Set DATABASE_URL environment variable');
        console.log('   3. See docs/RENDER_POSTGRES.md for details');
      } else {
        console.log('✅ PERSISTENT STORAGE MODE');
        console.log(`✓ Data stored in: ${DATA_DIR}`);
        console.log('✓ Data will persist across redeploys');
      }
    }
    console.log('');
  });
}).catch(err => {
  console.error('❌ Failed to initialize database schema:', err);
  process.exit(1);
});