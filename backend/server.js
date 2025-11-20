
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

// Email configuration for password reset (Gmail by default)
const emailTransporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || process.env.GMAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
  },
  // Increase timeouts for Gmail (can be slow on Render)
  connectionTimeout: 20000, // 20 seconds to establish connection
  greetingTimeout: 20000, // 20 seconds to receive greeting
  socketTimeout: 60000, // 60 seconds for socket operations
  // Retry configuration
  pool: false, // Don't pool connections for better reliability
  // Debug mode (only in development)
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

// Static files with caching headers for performance
app.use('/', express.static(path.join(__dirname, '..', 'frontend', 'src'), {
  maxAge: 5000, // 5 seconds
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Cache all files for 5 seconds
    res.setHeader('Cache-Control', 'public, max-age=5');
  }
}));

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
      created_at ${textType}
    )`);
    // best-effort schema upgrades for tests (in case of older DBs)
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN lang ${textType} DEFAULT 'ru'`); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN duration_minutes INTEGER DEFAULT 60'); }catch(e){}
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN window_start ${textType}`); }catch(e){}
    try{ await runAsync(`ALTER TABLE tests ADD COLUMN window_end ${textType}`); }catch(e){}
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
        desc_ky: 'Кыргызстандын байлик тарыхын, географиясын жана табигый байлыктарын терең изилдөө. Улуттук маданияты, байыркы салттары жана адаттарына байланышуу. Конституциялык негиздер жана мамлекеттик түзүлүш. Улуттун тарыхын калыптандырган өндүнөмөл адамдар. Экономикалык өнүгүү жана өлкөнүн келечеги.'
      },
      { 
        ru: 'Дүйнөлүк тарых жана азыркы саясат', 
        ky: 'Дүйнөлүк тарых жана азыркы саясат',
        desc_ru: 'История развития человеческой цивилизации от древних времён до современности. Великие империи, революции и войны, сформировавшие мировой порядок. Жизнь и деятельность выдающихся исторических деятелей. Понимание причинно-следственных связей исторических событий. Современная геополитика и международные отношения.',
        desc_ky: 'Инсан цивилизациясынын байыркы доорлордон азыркы убакытка чейинки өнүгүүсүнүн тарыхы. Дүйнөлүк тартибин калыптандырган чоң империялар, революциялар жана согундар. Атактуу тарыхый деятелдердин жашоосу жана ишмерчилиги. Тарыхый окуялардын себеп-натыйжасын түшүнүү. Азыркы геополитика жана эл аралык мамилелер.'
      },
      { 
        ru: 'Илим жана технологиялар', 
        ky: 'Илим жана технологиялар',
        desc_ru: 'Комплексное изучение физики, химии, биологии и математики как основ современной науки. Практическое применение научных знаний в программировании и информационных технологиях. Развитие логического и алгоритмического мышления. Изучение современных научных открытий и инноваций. Развитие навыков научного анализа и исследования.',
        desc_ky: 'Физика, химия, биология жана математиканы заманбап илимнин негиздери катары комплекстүү изилдөө. Программалоо жана маалыматтык технологиялардагы илимий билимдердин практикалык колдонулушу. Логикалык жана алгоритмикалык ойлонуунун өнүгүүсү. Заманбап илимий ачылуулар жана инновацияларды изилдөө. Илимий анализ жана изилдөө көндүмдөрүнүн өнүгүүсү.'
      },
      { 
        ru: 'Тил жана адабият', 
        ky: 'Тил жана адабият',
        desc_ru: 'Углубленное изучение русского языка: грамматика, пунктуация, орфография и стилистика. Основы кыргызского языка и его уникальные особенности. Классическая и современная литература обоих народов. Анализ литературных произведений, их идейного содержания и художественных приёмов. Развитие культуры речи и литературного вкуса.',
        desc_ky: 'Орусча тилин терең изилдөө: грамматика, орун белгилөө, орфография жана стилистика. Кыргыз тилинин негиздери жана анын уникалдуу өзгөчөлүктөрү. Эки элдин классикалык жана азыркы адабияты. Адабий чыгармаларды, алардын идеялык мазмунун жана сүндөт ыкмаларын анализдөө. Сөз маданиятын жана адабий даадын өнүгүүсү.'
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
function parseHumanWindow(windowRange){
  if(!windowRange || typeof windowRange !== 'string') return { start:null, end:null };
  const parts = windowRange.split(/\s*до\s*/i);
  if(parts.length !== 2) return { start:null, end:null };
  function toIso(s){
    // DD.MM.YYYY-HH:MM
    const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[- ](\d{1,2}):(\d{2})$/);
    if(!m) return null;
    const [_, dd, mm, yyyy, hh, min] = m;
    const date = new Date(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(min), 0);
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
    await runAsync(`INSERT INTO teams (team_name, login, password, captain_name, captain_email, captain_phone, members, school, city, created_at) VALUES (?,?,?,?,?,?,?,?,?,${nowFunc})`, [data.team_name, randomLogin, hashed, data.captain_name, data.captain_email, data.captain_phone, members_json, data.school, data.city]);
    console.log(`✓ Team registered: ${data.team_name} (${email})`);
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ error:e.message }); }
});

// Test email configuration on startup
async function testEmailConfig() {
  const hasUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const hasPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  
  if (!hasUser || !hasPass) {
    console.warn('⚠️  Email configuration missing:');
    console.warn('   GMAIL_USER or SMTP_USER not set');
    console.warn('   GMAIL_APP_PASSWORD or SMTP_PASS not set');
    console.warn('   Password reset emails will not be sent!');
    console.warn('   See docs/EMAIL_SETUP.md for configuration instructions');
    return false;
  }
  
  console.log('✓ Email configuration found');
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
    
    // Send email with increased timeout and better error handling
    let emailSent = false;
    try {
      // Verify transporter configuration first
      const emailUser = process.env.SMTP_USER || process.env.GMAIL_USER;
      const emailPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
      
      if (!emailUser || !emailPass) {
        console.warn('⚠️  Email configuration missing: GMAIL_USER or GMAIL_APP_PASSWORD not set');
        throw new Error('Email service not configured');
      }
      
      console.log(`Attempting to send email to ${email}...`);
      
      const emailPromise = emailTransporter.sendMail({
        from: process.env.SMTP_FROM || emailUser,
        to: email,
        subject: 'Код сброса пароля - Akylman Quiz Bowl',
        html: `
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
        `
      });
      
      // Increase timeout to 30 seconds for Gmail (can be slow on Render)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email sending timeout (30s)')), 30000)
      );
      
      const startTime = Date.now();
      await Promise.race([emailPromise, timeoutPromise]);
      const duration = Date.now() - startTime;
      emailSent = true;
      console.log(`✓ Password reset email sent successfully to ${email} (took ${duration}ms)`);
    } catch(emailError) {
      const errorMsg = emailError.message || 'Unknown error';
      console.error('✗ Failed to send email:', errorMsg);
      
      // Log detailed error for debugging
      if (emailError.response) {
        console.error('  Email error response:', JSON.stringify(emailError.response, null, 2));
      }
      if (emailError.code) {
        console.error('  Email error code:', emailError.code);
      }
      if (emailError.command) {
        console.error('  Email error command:', emailError.command);
      }
      if (emailError.responseCode) {
        console.error('  Email response code:', emailError.responseCode);
      }
      
      // Common Gmail errors
      if (errorMsg.includes('Invalid login') || errorMsg.includes('535')) {
        console.error('  → Check Gmail credentials: GMAIL_USER and GMAIL_APP_PASSWORD');
        console.error('  → Make sure you\'re using App Password, not regular password');
      }
      if (errorMsg.includes('timeout')) {
        console.error('  → Email sending timed out. Gmail may be slow or unreachable.');
        console.error('  → Check network connectivity and Gmail service status');
      }
      
      // Don't fail the request - return success to not reveal if email exists
      // But log the error for admin to see
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
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at > NOW()', [email, code]);
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
      resetCode = await getAsync('SELECT * FROM password_reset_codes WHERE email = $1 AND code = $2 AND used = 0 AND expires_at > NOW()', [email, code]);
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
app.get('/api/tests', async (req,res)=>{ try{ const tests = await allAsync('SELECT id,title,description,lang,duration_minutes FROM tests ORDER BY id'); res.json(tests); }catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/tests/:id', async (req,res)=>{
  try{
    // Prefer file-backed questions; fallback to DB if file empty
    const testId = req.params.id;
    let qs = readQuestionsFile(testId).map(q=>({ id:q.id, ordinal:q.ordinal||0, text:q.text||'', options:(Array.isArray(q.options)?q.options:[]), points:q.points||1 }));
    if(qs.length===0){
      const rows = await allAsync('SELECT id, ordinal, text, options, points FROM questions WHERE test_id=? ORDER BY ordinal',[testId]);
      rows.forEach(r=>{ try{ r.options = JSON.parse(r.options||'[]'); }catch{} });
      qs = rows;
    }
    res.json(qs);
  }catch(e){ res.status(500).json({ error:e.message }); }
});
// Public categories (for homepage rendering)
app.get('/api/categories', async (req,res)=>{ try{ const rows = await allAsync('SELECT id, name_ru, name_ky, desc_ru, desc_ky FROM categories ORDER BY id'); res.json(rows); }catch(e){ res.status(500).json({ error:e.message }); } });
function teamAuth(req,res,next){ const auth = req.headers['authorization'] || ''; if (!auth.startsWith('Bearer ')) return res.status(401).json({ error:'Missing token' }); const token = auth.slice(7); try{ const payload = jwt.verify(token, JWT_SECRET); req.team = payload; next(); }catch(e){ return res.status(401).json({ error:'Invalid token' }); } }
app.post('/api/tests/:id/submit', teamAuth, async (req,res)=>{
  try{
    const testId = req.params.id;
    const answers = req.body.answers || {};
    const qs = readQuestionsFile(testId);
    let score = 0;
    const answersArr = [];
    for (const q of qs){
      const given = answers[q.id] !== undefined ? answers[q.id] : null;
      const correct = q.correct;
      let qok = false;
      if (correct===null||correct===undefined){
        qok=false;
      } else if (String(correct).match(/^\d+$/)){
        if (String(given) === String(correct)) qok=true;
      } else {
        if (String(given||'').trim().toLowerCase() === String(correct).trim().toLowerCase()) qok=true;
      }
      if (qok) score += (q.points||1);
      answersArr.push({ question_id: q.id, given, correct });
    }
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    await runAsync(`INSERT INTO results (team_id, test_id, score, answers, taken_at) VALUES (?,?,?,?,${nowFunc})`, [req.team.id, testId, score, JSON.stringify(answersArr)]);
    console.log(`✓ Test submitted: team_id=${req.team.id}, test_id=${testId}, score=${score}`);
    res.json({ ok:true, score });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
app.get('/api/me', teamAuth, async (req,res)=>{
  try{
    const t = await getAsync('SELECT id, team_name, login, captain_name, captain_email, captain_phone, members, school, city FROM teams WHERE id=?',[req.team.id]);
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
app.get('/api/me/results', teamAuth, async (req,res)=>{ try{ const rows = await allAsync('SELECT r.id, r.test_id, r.score, r.taken_at, t.title FROM results r LEFT JOIN tests t ON t.id = r.test_id WHERE r.team_id = ? ORDER BY r.taken_at DESC',[req.team.id]); res.json(rows);}catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/admin/tests', adminAuth, async (req,res)=>{ try{ const tests = await allAsync('SELECT * FROM tests ORDER BY id DESC'); res.json(tests);}catch(e){ res.status(500).json({ error:e.message }); } });
app.post('/api/admin/tests', adminAuth, async (req,res)=>{ try{ const { title, description, lang, duration_minutes, window_start, window_end, window_range } = req.body; const range = parseHumanWindow(window_range); const ws = range.start || window_start || null; const we = range.end || window_end || null; const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')'; const stmt = await runAsync(`INSERT INTO tests (title, description, lang, duration_minutes, window_start, window_end, created_at) VALUES (?,?,?,?,?,?,${nowFunc})${db.type === 'postgres' ? ' RETURNING id' : ''}`,[title,description,lang||'ru',duration_minutes||30, ws, we]); const testId = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID; try{ writeQuestionsFile(testId, []); }catch(e){} res.json({ ok:true, id: testId }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.put('/api/admin/tests/:id', adminAuth, async (req,res)=>{
  try{
    const { title, description, lang, duration_minutes, window_start, window_end, window_range } = req.body;
    const range = parseHumanWindow(window_range);
    const ws = range.start || window_start || null;
    const we = range.end || window_end || null;
    await runAsync('UPDATE tests SET title=?, description=?, lang=?, duration_minutes=?, window_start=?, window_end=? WHERE id=?',[title,description,lang||'ru',duration_minutes||30, ws, we, req.params.id]);
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

// Categories CRUD
app.get('/api/admin/categories', adminAuth, async (req,res)=>{ try{ const rows = await allAsync('SELECT * FROM categories ORDER BY id'); res.json(rows); }catch(e){ res.status(500).json({ error:e.message }); } });
app.post('/api/admin/categories', adminAuth, async (req,res)=>{ try{ const { name_ru, name_ky, desc_ru, desc_ky } = req.body; const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')'; const stmt = await runAsync(`INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES (?,?,?,?,${nowFunc})${db.type === 'postgres' ? ' RETURNING id' : ''}`,[name_ru, name_ky, desc_ru||null, desc_ky||null]); const catId = db.type === 'postgres' ? (stmt.rows?.[0]?.id || stmt.id) : stmt.lastID; res.json({ ok:true, id: catId }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.put('/api/admin/categories/:id', adminAuth, async (req,res)=>{ try{ const { name_ru, name_ky, desc_ru, desc_ky } = req.body; await runAsync('UPDATE categories SET name_ru=?, name_ky=?, desc_ru=?, desc_ky=? WHERE id=?',[name_ru, name_ky, desc_ru||null, desc_ky||null, req.params.id]); res.json({ ok:true }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.delete('/api/admin/categories/:id', adminAuth, async (req,res)=>{ try{ await runAsync('DELETE FROM categories WHERE id=?',[req.params.id]); res.json({ ok:true }); }catch(e){ res.status(500).json({ error:e.message }); } });

// Questions update/delete (file-backed)
app.get('/api/admin/tests/:id/questions', adminAuth, async (req,res)=>{
  try{ const qs = readQuestionsFile(req.params.id).sort((a,b)=> (a.ordinal||0)-(b.ordinal||0)); res.json(qs); }catch(e){ res.status(500).json({ error:e.message }); }
});
app.post('/api/admin/tests/:id/questions', adminAuth, async (req,res)=>{
  try{
    const testId = req.params.id;
    const { ordinal, text, options, correct, points, category_id, lang } = req.body;
    const qs = readQuestionsFile(testId);
    const id = nextQuestionId(qs);
    const q = { id, test_id: Number(testId), ordinal: ordinal||0, text: text||'', options: (Array.isArray(options)? options : null), correct: (correct??''), points: points||1, lang: lang||'ru', category_id: category_id||null };
    qs.push(q);
    writeQuestionsFile(testId, qs);
    res.json({ ok:true, id });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
app.put('/api/admin/questions/:qid', adminAuth, async (req,res)=>{
  try{
    const qid = parseInt(req.params.qid,10);
    // find which test file contains this question
    const files = fs.readdirSync(TESTS_DIR).filter(f=> f.endsWith('.json'));
    for(const f of files){
      const testId = (f.match(/test_(\d+)\.json$/)||[])[1];
      if(!testId) continue;
      const qs = readQuestionsFile(testId);
      const idx = qs.findIndex(x=> Number(x.id)===qid);
      if(idx>=0){
        const { ordinal, text, options, correct, points, category_id } = req.body;
        qs[idx] = { ...qs[idx], ordinal, text, options: (Array.isArray(options)? options : null), correct, points: points||1, category_id: category_id||null };
        writeQuestionsFile(testId, qs);
        return res.json({ ok:true });
      }
    }
    res.status(404).json({ error:'Question not found' });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
app.delete('/api/admin/questions/:qid', adminAuth, async (req,res)=>{
  try{
    const qid = parseInt(req.params.qid,10);
    const files = fs.readdirSync(TESTS_DIR).filter(f=> f.endsWith('.json'));
    for(const f of files){
      const testId = (f.match(/test_(\d+)\.json$/)||[])[1];
      if(!testId) continue;
      const qs = readQuestionsFile(testId);
      const idx = qs.findIndex(x=> Number(x.id)===qid);
      if(idx>=0){
        qs.splice(idx,1);
        // re-pack ordinals to be consecutive
        qs.sort((a,b)=> (a.ordinal||0)-(b.ordinal||0)).forEach((qq,i)=>{ qq.ordinal = i+1; });
        writeQuestionsFile(testId, qs);
        return res.json({ ok:true });
      }
    }
    res.status(404).json({ error:'Question not found' });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// CSV helpers and routes
function toCsvValue(v){
  if(v == null || v === undefined) return '""';
  const s = String(v);
  // Always wrap in quotes to match Google Forms format
  return '"' + s.replace(/"/g, '""') + '"';
}
function parseCsv(text){ const rows=[]; let i=0, field=''; let row=[]; let inq=false; const s=text.replace(/\r/g,''); function pushField(){ row.push(field); field=''; } function pushRow(){ rows.push(row); row=[]; } while(i<s.length){ const ch=s[i++]; if(inq){ if(ch==='"'){ if(s[i]==='"'){ field+='"'; i++; } else { inq=false; } } else { field+=ch; } } else { if(ch===','){ pushField(); } else if(ch==='\n'){ pushField(); pushRow(); } else if(ch==='"'){ inq=true; } else { field+=ch; } } } if(field.length>0 || row.length>0){ pushField(); pushRow(); } return rows; }
app.get('/api/admin/tests/:id/questions/export-csv', adminAuth, async (req,res)=>{ try{ const qs = readQuestionsFile(req.params.id).sort((a,b)=> (a.ordinal||0)-(b.ordinal||0)); const header = 'ordinal,text,options,correct,points,category_id\n'; const lines = qs.map(q=>[ q.ordinal, toCsvValue(q.text||''), toCsvValue(Array.isArray(q.options)? JSON.stringify(q.options) : ''), toCsvValue(q.correct||''), q.points||1, q.category_id||'' ].join(',')); const csv = header + lines.join('\n'); res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="test_${req.params.id}_questions.csv"`); res.send(csv); }catch(e){ res.status(500).json({ error:e.message }); } });
app.post('/api/admin/tests/:id/questions/import-csv', adminAuth, upload.single('file'), async (req,res)=>{ try{ const filePath = req.file?.path; if(!filePath) return res.status(400).json({ error:'No file' }); const text = fs.readFileSync(filePath,'utf8'); const rows = parseCsv(text); const header = rows.shift()||[]; const idx = { ordinal: header.indexOf('ordinal'), text: header.indexOf('text'), options: header.indexOf('options'), correct: header.indexOf('correct'), points: header.indexOf('points'), category_id: header.indexOf('category_id') }; const qs = readQuestionsFile(req.params.id); for (const r of rows){ if(!r.length) continue; const ordinal = parseInt(r[idx.ordinal]||'0')||0; const textv = r[idx.text]||''; const optionsRaw = r[idx.options]||''; const correct = r[idx.correct]||''; const points = parseInt(r[idx.points]||'1')||1; const category_id = r[idx.category_id] ? parseInt(r[idx.category_id]) : null; const options = optionsRaw ? (optionsRaw.trim().startsWith('[') ? JSON.parse(optionsRaw) : optionsRaw.split('|').map(s=>s.trim()).filter(Boolean)) : null; const id = nextQuestionId(qs); qs.push({ id, test_id:Number(req.params.id), ordinal, text:textv, options, correct, points, lang:'ru', category_id }); } writeQuestionsFile(req.params.id, qs); res.json({ ok:true, imported: rows.length }); }catch(e){ res.status(500).json({ error:e.message }); } });
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
      SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name 
      FROM results r 
      LEFT JOIN tests t ON t.id = r.test_id 
      LEFT JOIN teams tm ON tm.id = r.team_id 
      ORDER BY r.taken_at DESC
    `); 
    res.json(results); 
  }catch(e){ res.status(500).json({ error:e.message }); } 
});

// Export teams to CSV
app.get('/api/admin/teams/export-csv', adminAuth, async (req,res)=>{
  try{
    const teams = await allAsync('SELECT id, team_name, login, captain_name, captain_email, captain_phone, members, school, city, created_at FROM teams ORDER BY id DESC');
    if(!teams || teams.length === 0){
      const header = ['ID', 'Название команды', 'Логин', 'Капитан', 'Email', 'Телефон', 'Участники', 'Школа', 'Город', 'Дата регистрации'].map(toCsvValue).join(',');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="teams_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    const header = ['ID', 'Название команды', 'Логин', 'Капитан', 'Email', 'Телефон', 'Участники', 'Школа', 'Город', 'Дата регистрации'].map(toCsvValue).join(',');
    const lines = teams.map(t=>{
      try{
        return [
          t.id || '',
          t.team_name || '',
          t.login || '',
          t.captain_name || '',
          t.captain_email || '',
          t.captain_phone || '',
          t.members || '',
          t.school || '',
          t.city || '',
          t.created_at || ''
        ].map(toCsvValue).join(',');
      }catch(err){
        console.error('Error processing team', t.id, err);
        return '';
      }
    }).filter(line => line.length > 0);
    const csv = header + '\n' + lines.join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="teams_export.csv"');
    res.send('\ufeff' + csv); // BOM for Excel
  }catch(e){ 
    console.error('Teams export error:', e);
    res.status(500).json({ error:e.message }); 
  }
});

// Export results to CSV in Google Forms format
app.get('/api/admin/results/export-csv', adminAuth, async (req,res)=>{
  try{
    const results = await allAsync(`
      SELECT r.id, r.score, r.taken_at, r.answers, r.test_id, t.title, tm.team_name 
      FROM results r 
      LEFT JOIN tests t ON t.id = r.test_id 
      LEFT JOIN teams tm ON tm.id = r.team_id 
      ORDER BY r.taken_at ASC
    `);
    
    if(!results || results.length === 0){
      const header = ['Отметка времени', 'Всего баллов'].map(toCsvValue).join(',');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="results_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    
    // Group results by test_id to get questions for each test
    const testIds = [...new Set(results.map(r=>r.test_id).filter(Boolean))];
    const testQuestions = {};
    
    for(const testId of testIds){
      try{
        let qs = [];
        // Try to read from file first
        try{
          qs = readQuestionsFile(testId);
        }catch(fileErr){
          console.warn('Failed to read questions file for test', testId, fileErr.message);
        }
        
        // Fallback to DB if file is empty or doesn't exist
        if(!qs || qs.length === 0){
          try{
            const dbQs = await allAsync('SELECT id, ordinal, text, points, correct FROM questions WHERE test_id=? ORDER BY ordinal', [testId]);
            if(dbQs && dbQs.length > 0){
              testQuestions[testId] = dbQs.map(q=>({ id:q.id, ordinal:q.ordinal||0, points:q.points||1 }));
            } else {
              testQuestions[testId] = [];
            }
          }catch(dbErr){
            console.error('Error reading questions from DB for test', testId, dbErr);
            testQuestions[testId] = [];
          }
        } else {
          testQuestions[testId] = qs.map(q=>({ id:q.id, ordinal:q.ordinal||0, points:q.points||1 })).sort((a,b)=>a.ordinal-b.ordinal);
        }
      }catch(err){
        console.error('Error processing test questions for test', testId, err);
        testQuestions[testId] = [];
      }
    }
    
    // Find max number of questions across all tests
    let maxQuestions = 0;
    for(const testId in testQuestions){
      if(testQuestions[testId].length > maxQuestions) maxQuestions = testQuestions[testId].length;
    }
    
    // Build header: timestamp, total_score, then for each question: answer, points, feedback
    const headerParts = ['Отметка времени', 'Всего баллов'];
    for(let i = 1; i <= maxQuestions; i++){
      headerParts.push(String(i));
      headerParts.push(`${i} [Количество баллов]`);
      headerParts.push(`${i} [Отзыв]`);
    }
    const header = headerParts.map(toCsvValue).join(',');
    
    // Format timestamp to match Google Forms format: "YYYY/MM/DD H:MM:SS AM/PM GMT+X"
    function formatTimestamp(isoStr){
      if(!isoStr) return '';
      try{
        const d = new Date(isoStr);
        if(isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2,'0');
        const seconds = String(d.getSeconds()).padStart(2,'0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if(hours === 0) hours = 12;
        // No padding for hours (1-12) - match format from example
        const hoursStr = String(hours);
        // Timezone offset (GMT+6 for Kyrgyzstan)
        const tzOffset = 6;
        // Return without quotes - toCsvValue will add them if needed
        return `${year}/${month}/${day} ${hoursStr}:${minutes}:${seconds} ${ampm} GMT+${tzOffset}`;
      }catch(e){
        console.error('Error formatting timestamp', isoStr, e);
        return '';
      }
    }
    
    // Build rows
    const rows = results.map(r=>{
      try{
        const rowParts = [];
        // Timestamp - format and then apply toCsvValue
        const timestamp = formatTimestamp(r.taken_at);
        rowParts.push(toCsvValue(timestamp));
        
        // Parse answers
        let answersData = [];
        try{
          if(r.answers && typeof r.answers === 'string'){
            answersData = JSON.parse(r.answers);
          } else if(Array.isArray(r.answers)){
            answersData = r.answers;
          }
        }catch(e){
          console.error('Error parsing answers for result', r.id, e);
          answersData = [];
        }
        
        // Get questions for this test
        const questions = testQuestions[r.test_id] || [];
        const maxScore = questions.length > 0 ? questions.reduce((sum,q)=>sum+(q.points||1), 0) : 0;
        const actualScore = r.score || 0;
        
        // Total score in format "X.XX / Y"
        rowParts.push(toCsvValue(`${Number(actualScore).toFixed(2)} / ${maxScore}`));
      
      // For each question, add answer, points, feedback
      for(let i = 0; i < maxQuestions; i++){
        if(i < questions.length){
          const q = questions[i];
          const answerData = answersData.find(a=>{
            try{
              return String(a.question_id) === String(q.id);
            }catch(e){
              return false;
            }
          });
          
          let given = '';
          let correct = '';
          
          if(answerData){
            // Get given answer
            if(answerData.given !== null && answerData.given !== undefined){
              given = String(answerData.given);
            }
            // Get correct answer
            if(answerData.correct !== null && answerData.correct !== undefined){
              correct = String(answerData.correct);
            }
          }
          
          // Use the same logic as in submit endpoint (matching regex pattern)
          let isCorrect = false;
          if(correct && correct !== '' && given !== ''){
            // Check if correct is numeric (MCQ index) - use same pattern as submit
            const numericPattern = /^\d+$/;
            if(numericPattern.test(correct)){
              // Numeric answer (MCQ index) - exact match
              if(String(given) === String(correct)){
                isCorrect = true;
              }
            } else {
              // Text answer - case-insensitive comparison
              if(String(given).trim().toLowerCase() === String(correct).trim().toLowerCase()){
                isCorrect = true;
              }
            }
          }
          
          const points = isCorrect ? (q.points||1) : 0;
          const maxPoints = q.points||1;
          
          rowParts.push(toCsvValue(given));
          rowParts.push(toCsvValue(`${points.toFixed(2)} / ${maxPoints}`));
          rowParts.push(toCsvValue('')); // Feedback column (empty for now)
        } else {
          // No more questions, fill with empty values
          rowParts.push(toCsvValue(''));
          rowParts.push(toCsvValue(''));
          rowParts.push(toCsvValue(''));
        }
      }
      
        return rowParts.join(',');
      }catch(err){
        console.error('Error processing result row', r.id, err);
        return '';
      }
    }).filter(row => row.length > 0);
    
    if(rows.length === 0){
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="results_export.csv"');
      return res.send('\ufeff' + header + '\n');
    }
    
    const csv = header + '\n' + rows.join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="results_export.csv"');
    res.send('\ufeff' + csv); // BOM for Excel
  }catch(e){ 
    console.error('Export error:', e);
    console.error('Stack:', e.stack);
    res.status(500).json({ error:e.message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined }); 
  }
});
// settings public
app.get('/api/settings', async (req,res)=>{ try{ const s = await getAsync('SELECT * FROM settings WHERE id=1'); res.json(s||{}); }catch(e){ res.status(500).json({ error:e.message }); } });
// settings admin
app.put('/api/admin/settings', adminAuth, async (req,res)=>{
  try{
    const s = req.body||{};
    const nowFunc = db.type === 'postgres' ? 'NOW()' : 'datetime(\'now\')';
    await runAsync(`UPDATE settings SET badge1_ru=?,badge1_ky=?,badge2_ru=?,badge2_ky=?,badge3_ru=?,badge3_ky=?,day1_date=?,day2_date=?,day3_date=?,final_place_ru=?,final_place_ky=?,updated_at=${nowFunc} WHERE id=1`, [
      s.badge1_ru||null,s.badge1_ky||null,s.badge2_ru||null,s.badge2_ky||null,s.badge3_ru||null,s.badge3_ky||null,s.day1_date||null,s.day2_date||null,s.day3_date||null,s.final_place_ru||null,s.final_place_ky||null
    ]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
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