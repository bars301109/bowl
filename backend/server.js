
/* Complete backend for Akylman Quiz Bowl */
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'db.better-sqlite3.sqlite');
const TESTS_DIR = path.join(__dirname, 'tests');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super-secret-token';
// Ensure tests directory exists
if(!fs.existsSync(TESTS_DIR)){
  try{
    fs.mkdirSync(TESTS_DIR, { recursive: true });
    console.log('Created tests directory:', TESTS_DIR);
  }catch(e){
    console.error('Failed to create tests directory:', e);
  }
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', express.static(path.join(__dirname, '..', 'frontend', 'src')));
const db = new Database(DB_FILE);
function runAsync(sql, params=[]){ return new Promise((res, rej)=>{ db.run(sql, params, function(err){ if(err) rej(err); else res(this); }); }); }
function allAsync(sql, params=[]){ return new Promise((res, rej)=>{ db.all(sql, params, (err, rows)=>{ if(err) rej(err); else res(rows); }); }); }
function getAsync(sql, params=[]){ return new Promise((res, rej)=>{ db.get(sql, params, (err, row)=>{ if(err) rej(err); else res(row); }); }); }
async function ensureSchema(){
  try{
    await runAsync(`CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT,
      login TEXT UNIQUE,
      password TEXT,
      captain_name TEXT,
      captain_email TEXT,
      captain_phone TEXT,
      members TEXT,
      school TEXT,
      city TEXT,
      created_at TEXT
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      lang TEXT DEFAULT 'ru',
      duration_minutes INTEGER DEFAULT 60,
      window_start TEXT,
      window_end TEXT,
      created_at TEXT
    )`);
    // best-effort schema upgrades for tests (in case of older DBs)
    try{ await runAsync('ALTER TABLE tests ADD COLUMN lang TEXT DEFAULT "ru"'); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN duration_minutes INTEGER DEFAULT 60'); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN window_start TEXT'); }catch(e){}
    try{ await runAsync('ALTER TABLE tests ADD COLUMN window_end TEXT'); }catch(e){}
    await runAsync(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ru TEXT NOT NULL,
      name_ky TEXT NOT NULL,
      desc_ru TEXT,
      desc_ky TEXT,
      created_at TEXT
    )`);
    // best-effort schema upgrades (ignore if already added)
    try{ await runAsync('ALTER TABLE categories ADD COLUMN desc_ru TEXT'); }catch(e){}
    try{ await runAsync('ALTER TABLE categories ADD COLUMN desc_ky TEXT'); }catch(e){}
    await runAsync(`CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER,
      ordinal INTEGER,
      text TEXT,
      options TEXT,
      correct TEXT,
      points INTEGER DEFAULT 1,
      lang TEXT DEFAULT 'ru',
      category_id INTEGER,
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      test_id INTEGER,
      score INTEGER,
      answers TEXT,
      taken_at TEXT,
      FOREIGN KEY(team_id) REFERENCES teams(id),
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`);
    await runAsync(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      badge1_ru TEXT, badge1_ky TEXT,
      badge2_ru TEXT, badge2_ky TEXT,
      badge3_ru TEXT, badge3_ky TEXT,
      day1_date TEXT, day2_date TEXT, day3_date TEXT,
      final_place_ru TEXT, final_place_ky TEXT,
      updated_at TEXT
    )`);
    const any = await getAsync('SELECT id FROM tests LIMIT 1');
    if (!any){
      const cats = [
        { ru: 'Кыргызстан таануу', ky: 'Кыргызстан таануу' },
        { ru: 'Дүйнөлүк тарых жана азыркы саясат', ky: 'Дүйнөлүк тарых жана азыркы саясат' },
        { ru: 'Илим жана технологиялар', ky: 'Илим жана технологиялар' },
        { ru: 'Тил жана адабият', ky: 'Тил жана адабият' },
        { ru: 'Өнөр жана спорт', ky: 'Өнөр жана спорт' }
      ];
      for (const c of cats){ await runAsync('INSERT INTO categories (name_ru, name_ky, created_at) VALUES (?,?,datetime("now"))',[c.ru, c.ky]); }
      const stmt = await runAsync('INSERT INTO tests (title, description, lang, duration_minutes, window_start, window_end, created_at) VALUES (?,?,?,?,?,?,datetime("now"))',["Demo Test","Sample demo test","ru",30,null,null]);
      const testId = stmt.lastID;
      const qs = [
        {ordinal:1, text:'What is the capital of Kyrgyzstan?', options: JSON.stringify(['Bishkek','Osh','Jalal-Abad','Naryn']), correct:'0', points:1},
        {ordinal:2, text:'2+2 = ?', options: JSON.stringify(['3','4','5','22']), correct:'1', points:1},
        {ordinal:3, text:'Name the largest lake in Kyrgyzstan.', options: JSON.stringify(['Issyk-Kul','Song-Kul','','']), correct:'0', points:1}
      ];
      for (const q of qs){ await runAsync('INSERT INTO questions (test_id, ordinal, text, options, correct, points, lang) VALUES (?,?,?,?,?,?,?)',[testId, q.ordinal, q.text, q.options, q.correct, q.points, 'ru']); }
      console.log('Seeded demo test');
    }
    const sAny = await getAsync('SELECT id FROM settings WHERE id=1');
    if(!sAny){
      await runAsync('INSERT INTO settings (id,badge1_ru,badge1_ky,badge2_ru,badge2_ky,badge3_ru,badge3_ky,day1_date,day2_date,day3_date,final_place_ru,final_place_ky,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,datetime("now"))',[
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
  }catch(e){ console.error('Failed to write test file', testId, e); throw e; }
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
    if (!data.team_name || !data.login || !data.password) return res.status(400).json({ error:'Missing fields' });
    const email = data.captain_email || '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(email && !emailOk) return res.status(400).json({ error:'Invalid email' });
    const pw = data.password || '';
    if(!(pw.length>=8 && /[A-Z]/.test(pw))) return res.status(400).json({ error:'Weak password' });
    const exists = await getAsync('SELECT id FROM teams WHERE login = ?', [data.login]);
    if (exists) return res.status(400).json({ error:'Login exists' });
    const hashed = await bcrypt.hash(data.password, 10);
    const members_json = JSON.stringify(data.members || []);
    await runAsync('INSERT INTO teams (team_name, login, password, captain_name, captain_email, captain_phone, members, school, city, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime("now"))',[data.team_name, data.login, hashed, data.captain_name, data.captain_email, data.captain_phone, members_json, data.school, data.city]);
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ error:e.message }); }
});
app.post('/api/login', async (req,res)=>{
  try{ const { login, password } = req.body; const team = await getAsync('SELECT id, team_name, login, password, captain_name, captain_email FROM teams WHERE login = ?', [login]); if (!team) return res.status(401).json({ error:'Invalid' }); const ok = await bcrypt.compare(password, team.password); if (!ok) return res.status(401).json({ error:'Invalid' }); const token = signTeamToken(team); res.json({ ok:true, team: { id:team.id, team_name: team.team_name, login: team.login, captain_name: team.captain_name, captain_email: team.captain_email, token } }); }catch(e){ res.status(500).json({ error:e.message }); }
});
function adminAuth(req,res,next){ const token = req.headers['x-admin-token'] || ''; if (token !== ADMIN_TOKEN) return res.status(403).json({ error:'Forbidden' }); next(); }
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
  try{ const testId = req.params.id; const answers = req.body.answers || {}; const qs = await allAsync('SELECT id, correct, points FROM questions WHERE test_id=?',[testId]); let score = 0; const answersArr = []; for (const q of qs){ const given = answers[q.id] !== undefined ? answers[q.id] : null; const correct = q.correct; let qok = false; if (correct===null||correct===undefined){ qok=false; } else if (String(correct).match(/^\\d+$/)){ if (String(given) === String(correct)) qok=true; } else { if (String(given||'').trim().toLowerCase() === String(correct).trim().toLowerCase()) qok=true; } if (qok) score += (q.points||1); answersArr.push({ question_id: q.id, given, correct }); } await runAsync('INSERT INTO results (team_id, test_id, score, answers, taken_at) VALUES (?,?,?,?,datetime("now"))',[req.team.id, testId, score, JSON.stringify(answersArr)]); res.json({ ok:true, score }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/me', teamAuth, async (req,res)=>{ try{ const t = await getAsync('SELECT id, team_name, login, captain_name, captain_email, school, city FROM teams WHERE id=?',[req.team.id]); if (!t) return res.status(404).json({ error:'Team not found' }); res.json({ ok:true, team: t }); }catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/me/results', teamAuth, async (req,res)=>{ try{ const rows = await allAsync('SELECT r.id, r.test_id, r.score, r.taken_at, t.title FROM results r LEFT JOIN tests t ON t.id = r.test_id WHERE r.team_id = ? ORDER BY r.taken_at DESC',[req.team.id]); res.json(rows);}catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/admin/tests', adminAuth, async (req,res)=>{ try{ const tests = await allAsync('SELECT * FROM tests ORDER BY id DESC'); res.json(tests);}catch(e){ res.status(500).json({ error:e.message }); } });
app.post('/api/admin/tests', adminAuth, async (req,res)=>{ try{ const { title, description, lang, duration_minutes, window_start, window_end, window_range } = req.body; const range = parseHumanWindow(window_range); const ws = range.start || window_start || null; const we = range.end || window_end || null; const stmt = await runAsync('INSERT INTO tests (title, description, lang, duration_minutes, window_start, window_end, created_at) VALUES (?,?,?,?,?,?,datetime("now"))',[title,description,lang||'ru',duration_minutes||30, ws, we]); try{ writeQuestionsFile(stmt.lastID, []); }catch(e){} res.json({ ok:true, id: stmt.lastID }); }catch(e){ res.status(500).json({ error:e.message }); } });
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
app.post('/api/admin/categories', adminAuth, async (req,res)=>{ try{ const { name_ru, name_ky, desc_ru, desc_ky } = req.body; const stmt = await runAsync('INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES (?,?,?,?,datetime("now"))',[name_ru, name_ky, desc_ru||null, desc_ky||null]); res.json({ ok:true, id: stmt.lastID }); }catch(e){ res.status(500).json({ error:e.message }); } });
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
    await runAsync('UPDATE settings SET badge1_ru=?,badge1_ky=?,badge2_ru=?,badge2_ky=?,badge3_ru=?,badge3_ky=?,day1_date=?,day2_date=?,day3_date=?,final_place_ru=?,final_place_ky=?,updated_at=datetime("now") WHERE id=1',[
      s.badge1_ru||null,s.badge1_ky||null,s.badge2_ru||null,s.badge2_ky||null,s.badge3_ru||null,s.badge3_ky||null,s.day1_date||null,s.day2_date||null,s.day3_date||null,s.final_place_ru||null,s.final_place_ky||null
    ]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
app.listen(PORT, ()=>console.log('Server running on port', PORT));