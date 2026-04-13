/* Schema initialization and seeding */
const db = require('../db');

const DEFAULT_CATEGORIES = [
  {
    ru: 'Информатика',
    ky: 'Информатика',
    desc_ru: 'Основы программирования, алгоритмы и структуры данных. Работа с компьютерными системами и программным обеспечением. Веб-разработка и современные технологии. Кибербезопасность и защита информации. Искусственный интеллект и машинное обучение.',
    desc_ky: 'Программалоонун негиздери, алгоритмдер жана маалымат структуралары. Компьютердик системалар жана программалык камсыздоо менен иштөө. Веб-иштеп чыгуу жана заманбап технологиялар. Киберкоопсуздук жана маалыматты коргоо. Жасалма интеллект жана машиналык үйрөнүү.',
  },
  {
    ru: 'Математика',
    ky: 'Математика',
    desc_ru: 'Алгебра, геометрия и тригонометрия. Математический анализ и теория вероятностей. Логическое мышление и решение задач. Применение математики в реальной жизни. Олимпиадные задачи и нестандартные подходы.',
    desc_ky: 'Алгебра, геометрия жана тригонометрия. Математикалык анализ жана ыктымалдыктар теориясы. Логикалык ой жүгүртүү жана маселелерди чечүү. Математиканы чыныгы жашоодо колдонуу. Олимпиадалык маселелер жана стандарттык эмес ыкмалар.',
  },
  {
    ru: 'Кыргызстан таануу',
    ky: 'Кыргызстан таануу',
    desc_ru: 'Глубокое изучение истории Кыргызстана, её географии и природного богатства. Знакомство с национальной культурой, древними традициями и обычаями кыргызского народа. Основы Конституции и государственного устройства. Выдающиеся личности, сформировавшие историю нации. Экономическое развитие и будущее страны.',
    desc_ky: 'Кыргызстандын бай тарыхын, географиясын жана табигый ресурсаларын изилдөө. Улуттук маданият, салт-санаа жана каада-жөрөлгөлөр менен таанышуу. Конституция, мамлекеттик түзүлүш жана жарандык жоопкерчилик боюнча негизги түшүнүктөр. Өлкөнүн өнүгүшүнө салым кошкон тарыхый инсандар. Бүгүнкү Кыргызстан жана анын келечеги жөнүндө ой жүгүртүү.',
  },
  {
    ru: 'Англис тили',
    ky: 'Англис тили',
    desc_ru: 'Грамматика английского языка и правильное использование времен. Расширение словарного запаса и идиоматические выражения. Чтение и понимание текстов различной сложности. Письменная и устная коммуникация. Культура англоязычных стран.',
    desc_ky: 'Англис тилинин грамматикасы жана мезгилдерди туура колдонуу. Сөздүктү кеңейтүү жана идиоматикалык сөз айкаштары. Ар кандай татаалдыктагы тексттерди окуу жана түшүнүү. Жазуу жана сөздөн баарлашуу. Англис тилдүү өлкөлөрдүн маданияты.',
  },
];

const DEFAULT_SETTINGS = {
  badge1_ru: 'Регистрация открыта!',
  badge1_ky: 'Каттоо ачык!',
  badge2_ru: 'Сдайте тест в кабинете.',
  badge2_ky: 'Кабинетте тест тапшырыңыз.',
  badge3_ru: 'Удачи!',
  badge3_ky: 'Ийгилик!',
  day1_date: '2025-12-05',
  day2_date: '2025-12-15',
  day3_date: '2025-12-27',
  final_place_ru: 'Президентский лицей «Акылман» (Чолпон-Ата)',
  final_place_ky: '«Акылман» Президенттик лицейи (Чолпон-Ата)',
  results_published: 0,
  one_submission_allowed: 0,
};

async function ensureSchema() {
  const { runAsync, allAsync, getAsync } = db;

  // Teams
  await runAsync(`CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    team_name TEXT,
    login TEXT,
    password TEXT,
    captain_name TEXT,
    captain_email TEXT UNIQUE,
    captain_phone TEXT,
    members TEXT,
    school TEXT,
    city TEXT,
    category_id INTEGER,
    created_at TEXT
  )`);

  // Password reset codes
  await runAsync(`CREATE TABLE IF NOT EXISTS password_reset_codes (
    id SERIAL PRIMARY KEY,
    email TEXT,
    code TEXT,
    expires_at TEXT,
    used INTEGER DEFAULT 0,
    created_at TEXT
  )`);

  // Tests
  await runAsync(`CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    title TEXT,
    description TEXT,
    preview_text TEXT,
    lang TEXT DEFAULT 'ru',
    duration_minutes INTEGER DEFAULT 60,
    window_start TEXT,
    window_end TEXT,
    status TEXT DEFAULT 'draft',
    category_id INTEGER,
    created_at TEXT
  )`);

  // Categories
  await runAsync(`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name_ru TEXT NOT NULL,
    name_ky TEXT NOT NULL,
    desc_ru TEXT,
    desc_ky TEXT,
    created_at TEXT
  )`);

  // Questions
  await runAsync(`CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
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

  // Results
  await runAsync(`CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    team_id INTEGER,
    test_id INTEGER,
    score INTEGER,
    answers TEXT,
    taken_at TEXT,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(test_id) REFERENCES tests(id)
  )`);

  // Settings
  await runAsync(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    badge1_ru TEXT, badge1_ky TEXT,
    badge2_ru TEXT, badge2_ky TEXT,
    badge3_ru TEXT, badge3_ky TEXT,
    day1_date TEXT, day2_date TEXT, day3_date TEXT,
    final_place_ru TEXT, final_place_ky TEXT,
    updated_at TEXT
  )`);

  // Homepage blocks
  await runAsync(`CREATE TABLE IF NOT EXISTS homepage_blocks (
    id SERIAL PRIMARY KEY,
    block_key TEXT UNIQUE NOT NULL,
    title_ru TEXT,
    title_ky TEXT,
    content_ru TEXT,
    content_ky TEXT,
    updated_at TEXT
  )`);

  // --- Add new columns to existing tables (idempotent) ---
  // Tests: add preview_text, status
  await runAsync('ALTER TABLE tests ADD COLUMN IF NOT EXISTS preview_text TEXT').catch(() => {});
  await runAsync('ALTER TABLE tests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'draft\'').catch(() => {});
  
  // Questions: add type, attachment_url
  await runAsync('ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT \'mcq\'').catch(() => {});
  await runAsync('ALTER TABLE questions ADD COLUMN IF NOT EXISTS attachment_url TEXT').catch(() => {});
  
  // Results: add started_at, time_taken_sec
  await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS started_at TEXT').catch(() => {});
  await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS time_taken_sec INTEGER').catch(() => {});

  // Settings: add results_published, one_submission_allowed
  await runAsync('ALTER TABLE settings ADD COLUMN IF NOT EXISTS results_published INTEGER DEFAULT 0').catch(() => {});
  await runAsync('ALTER TABLE settings ADD COLUMN IF NOT EXISTS one_submission_allowed INTEGER DEFAULT 0').catch(() => {});

  // Seed categories if empty
  const catCountRow = await getAsync('SELECT COUNT(*) AS cnt FROM categories');
  const catCount = parseInt(catCountRow?.cnt || 0, 10) || 0;
  if (catCount === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await runAsync(
        'INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at) VALUES ($1,$2,$3,$4,NOW())',
        [c.ru, c.ky, c.desc_ru, c.desc_ky]
      );
    }
    console.log('✓ Seeded default categories');
  }

  // Seed settings if empty
  const sAny = await getAsync('SELECT id FROM settings WHERE id=1');
  if (!sAny) {
    await runAsync(
      `INSERT INTO settings (id,badge1_ru,badge1_ky,badge2_ru,badge2_ky,badge3_ru,badge3_ky,day1_date,day2_date,day3_date,final_place_ru,final_place_ky,results_published,one_submission_allowed,updated_at)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
      [
        DEFAULT_SETTINGS.badge1_ru, DEFAULT_SETTINGS.badge1_ky,
        DEFAULT_SETTINGS.badge2_ru, DEFAULT_SETTINGS.badge2_ky,
        DEFAULT_SETTINGS.badge3_ru, DEFAULT_SETTINGS.badge3_ky,
        DEFAULT_SETTINGS.day1_date, DEFAULT_SETTINGS.day2_date, DEFAULT_SETTINGS.day3_date,
        DEFAULT_SETTINGS.final_place_ru, DEFAULT_SETTINGS.final_place_ky,
        DEFAULT_SETTINGS.results_published, DEFAULT_SETTINGS.one_submission_allowed,
      ]
    );
  }

  console.log('Schema ready');
}

module.exports = {
  ensureSchema,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
};
