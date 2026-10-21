/* Schema initialization and settings */
const db = require('../db');

const DEFAULT_SETTINGS = {
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

  // DDL statements: run each independently so one existing table/constraint never blocks others
  const ddlList = [
    // Categories (must be created before announcements / tests)
    `CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name_ru TEXT NOT NULL,
      name_ky TEXT NOT NULL,
      desc_ru TEXT,
      desc_ky TEXT,
      created_at TEXT
    )`,

    // Teams
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      team_name TEXT NOT NULL,
      login TEXT,
      password TEXT,
      team_email TEXT,
      email TEXT,
      phone TEXT,
      members TEXT,
      school TEXT,
      city TEXT,
      category_id INTEGER,
      invite_code TEXT UNIQUE,
      status TEXT DEFAULT 'forming',
      created_at TEXT
    )`,
    // Ensure all columns exist on teams table
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_email TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS email TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS phone TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS members TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS school TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS city TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS category_id INTEGER',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS login TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS password TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_name TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_code TEXT',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'forming\'',

    // Participants table (Individual student accounts)
    `CREATE TABLE IF NOT EXISTS participants (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      grade VARCHAR(20),
      school TEXT,
      city TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      category_confirmed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    'ALTER TABLE participants ADD COLUMN IF NOT EXISTS category_confirmed BOOLEAN DEFAULT false',
    `DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'participants' AND column_name = 'category_confirmed' AND data_type != 'boolean'
      ) THEN 
        ALTER TABLE participants ALTER COLUMN category_confirmed DROP DEFAULT;
        ALTER TABLE participants ALTER COLUMN category_confirmed TYPE boolean 
          USING (
            CASE 
              WHEN category_confirmed::text IN ('1', 'true', 't', 'yes') THEN true 
              ELSE false 
            END
          );
        ALTER TABLE participants ALTER COLUMN category_confirmed SET DEFAULT false;
      END IF;
    END $$;`,
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS participant_id INTEGER',
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS category_id INTEGER',

    // Uploaded files
    `CREATE TABLE IF NOT EXISTS public.uploaded_files (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    'GRANT ALL ON public.uploaded_files TO public',
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO public',

    // Password reset codes
    `CREATE TABLE IF NOT EXISTS password_reset_codes (
      id SERIAL PRIMARY KEY,
      email TEXT,
      code TEXT,
      expires_at TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT
    )`,

    // Tests
    `CREATE TABLE IF NOT EXISTS tests (
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
    )`,
    'ALTER TABLE tests ADD COLUMN IF NOT EXISTS preview_text TEXT',
    'ALTER TABLE tests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'draft\'',

    // Questions
    `CREATE TABLE IF NOT EXISTS questions (
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
    )`,
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT \'mcq\'',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS attachment_url TEXT',

    // Results
    `CREATE TABLE IF NOT EXISTS results (
      id SERIAL PRIMARY KEY,
      team_id INTEGER,
      test_id INTEGER,
      score INTEGER,
      answers TEXT,
      taken_at TEXT,
      started_at TEXT,
      time_taken_sec INTEGER,
      participant_id INTEGER,
      category_id INTEGER,
      FOREIGN KEY(team_id) REFERENCES teams(id),
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`,
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS started_at TEXT',
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS time_taken_sec INTEGER',
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS participant_id INTEGER',
    'ALTER TABLE results ADD COLUMN IF NOT EXISTS category_id INTEGER',

    // Test sessions
    `CREATE TABLE IF NOT EXISTS test_sessions (
      id SERIAL PRIMARY KEY,
      team_id INTEGER,
      test_id INTEGER,
      started_at TEXT,
      status TEXT DEFAULT 'in_progress',
      expires_at TEXT,
      FOREIGN KEY(team_id) REFERENCES teams(id),
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )`,

    // Settings
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      day1_date TEXT, day2_date TEXT, day3_date TEXT,
      final_place_ru TEXT, final_place_ky TEXT,
      results_published INTEGER DEFAULT 0,
      one_submission_allowed INTEGER DEFAULT 1,
      updated_at TEXT
    )`,
    'ALTER TABLE settings ADD COLUMN IF NOT EXISTS results_published INTEGER DEFAULT 0',
    'ALTER TABLE settings ADD COLUMN IF NOT EXISTS one_submission_allowed INTEGER DEFAULT 0',

    // Homepage blocks
    `CREATE TABLE IF NOT EXISTS homepage_blocks (
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
    )`,
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_en TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ky TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ru TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_en TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ky TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ru TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_en TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ky TEXT DEFAULT \'\'',
    'ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ru TEXT DEFAULT \'\'',

    // Announcements
    `CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title_ru TEXT DEFAULT '',
      title_ky TEXT DEFAULT '',
      title_en TEXT DEFAULT '',
      content_ru TEXT DEFAULT '',
      content_ky TEXT DEFAULT '',
      content_en TEXT DEFAULT '',
      target_type TEXT DEFAULT 'all',
      target_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      priority TEXT DEFAULT 'normal',
      is_published INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_ru TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_ky TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_en TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content_ru TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content_ky TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content_en TEXT DEFAULT \'\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT \'all\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_category_id INTEGER',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT \'normal\'',
    'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_published INTEGER DEFAULT 1',

    // Support tickets
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT \'general\'',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'open\'',

    // Support ticket messages
    `CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      sender_name TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    // Ensure foreign key constraints have ON DELETE CASCADE on existing tables
    'ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_ticket_id_fkey',
    'ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_ticket_id_support_tickets_id_fk',
    'ALTER TABLE support_messages ADD CONSTRAINT support_messages_ticket_id_support_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE',

    'ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_team_id_fkey',
    'ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_team_id_teams_id_fk',
    'ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE',

    'ALTER TABLE results DROP CONSTRAINT IF EXISTS results_team_id_fkey',
    'ALTER TABLE results DROP CONSTRAINT IF EXISTS results_team_id_teams_id_fk',
    'ALTER TABLE results ADD CONSTRAINT results_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE',

    'ALTER TABLE results DROP CONSTRAINT IF EXISTS results_test_id_fkey',
    'ALTER TABLE results DROP CONSTRAINT IF EXISTS results_test_id_tests_id_fk',
    'ALTER TABLE results ADD CONSTRAINT results_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE',

    'ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_team_id_fkey',
    'ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_team_id_teams_id_fk',
    'ALTER TABLE test_sessions ADD CONSTRAINT test_sessions_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE',

    'ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_test_id_fkey',
    'ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_test_id_tests_id_fk',
    'ALTER TABLE test_sessions ADD CONSTRAINT test_sessions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE',

    'ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_test_id_fkey',
    'ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_test_id_tests_id_fk',
    'ALTER TABLE questions ADD CONSTRAINT questions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE',

    'ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_target_category_id_fkey',
    'ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_target_category_id_categories_id_fk',
    'ALTER TABLE announcements ADD CONSTRAINT announcements_target_category_id_categories_id_fk FOREIGN KEY (target_category_id) REFERENCES categories(id) ON DELETE SET NULL',
    'ALTER TABLE participants ALTER COLUMN category_confirmed TYPE BOOLEAN USING (CASE WHEN category_confirmed::text = \'1\' OR category_confirmed::text = \'true\' THEN TRUE ELSE FALSE END)',
    'ALTER TABLE participants ALTER COLUMN category_confirmed SET DEFAULT FALSE',
    'ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_team_id_fkey',
    'ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_team_id_teams_id_fk',
    'ALTER TABLE participants ADD CONSTRAINT participants_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL',
    'ALTER TABLE participants ALTER COLUMN category_confirmed DROP DEFAULT',
    'ALTER TABLE participants ALTER COLUMN category_confirmed TYPE BOOLEAN USING (CASE WHEN category_confirmed::text = \'1\' OR category_confirmed::text = \'true\' THEN TRUE ELSE FALSE END)',
    'ALTER TABLE participants ALTER COLUMN category_confirmed SET DEFAULT FALSE',
    'ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_team_id_fkey',
    'ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_team_id_teams_id_fk',
    'ALTER TABLE participants ADD CONSTRAINT participants_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL',
  ];

  for (const stmt of ddlList) {
    try {
      await runAsync(stmt);
    } catch (err) {
      console.warn('DDL execution notice:', err.message, 'in statement:', stmt.slice(0, 60));
    }
  }

  // Sync team_email
  try {
    await runAsync('UPDATE teams SET team_email = COALESCE(team_email, email) WHERE team_email IS NULL OR team_email = \'\'');
    await runAsync('UPDATE teams SET email = COALESCE(email, team_email) WHERE email IS NULL OR email = \'\'');
  } catch (err) {}

    // Migrate any existing files on disk into uploaded_files table in Cloud SQL
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const fname of files) {
          if (fname.startsWith('.')) continue;
          const fullPath = path.join(uploadsDir, fname);
          if (fs.statSync(fullPath).isFile()) {
            const existing = await getAsync('SELECT id FROM uploaded_files WHERE filename = $1', [fname]).catch(() => null);
            if (!existing) {
              const buf = fs.readFileSync(fullPath);
              const ext = path.extname(fname).toLowerCase().replace('.', '') || 'png';
              const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'png' ? 'image/png'
                : ext === 'webp' ? 'image/webp'
                : ext === 'gif' ? 'image/gif'
                : ext === 'svg' ? 'image/svg+xml'
                : 'application/octet-stream';
              await runAsync(
                'INSERT INTO uploaded_files (filename, mime_type, data_base64, size_bytes, created_at) VALUES ($1,$2,$3,$4,NOW())',
                [fname, mime, buf.toString('base64'), buf.length],
              ).catch(() => {});
            }
          }
        }
      }

      // Also ensure rules.pdf is stored in uploaded_files in SQL
      const rulesPdfPath = path.resolve(process.cwd(), 'frontend', 'src', 'pages', 'rules.pdf');
      if (fs.existsSync(rulesPdfPath)) {
        const existingPdf = await getAsync('SELECT id FROM uploaded_files WHERE filename = $1', ['rules.pdf']).catch(() => null);
        if (!existingPdf) {
          const pdfBuf = fs.readFileSync(rulesPdfPath);
          await runAsync(
            'INSERT INTO uploaded_files (filename, mime_type, data_base64, size_bytes, created_at) VALUES ($1,$2,$3,$4,NOW())',
            ['rules.pdf', 'application/pdf', pdfBuf.toString('base64'), pdfBuf.length],
          ).catch(() => {});
        }
      }
    } catch (migErr) {
      console.warn('Files migration to Cloud SQL notice:', migErr.message);
    }

    await runAsync('ALTER TABLE tests ADD COLUMN IF NOT EXISTS preview_text TEXT').catch(() => {});
    await runAsync('ALTER TABLE tests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'draft\'').catch(() => {});
    await runAsync('ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT \'mcq\'').catch(() => {});
    await runAsync('ALTER TABLE questions ADD COLUMN IF NOT EXISTS attachment_url TEXT').catch(() => {});
    await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS started_at TEXT').catch(() => {});
    await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS time_taken_sec INTEGER').catch(() => {});
    await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS participant_id INTEGER').catch(() => {});
    await runAsync('ALTER TABLE results ADD COLUMN IF NOT EXISTS category_id INTEGER').catch(() => {});
    await runAsync('ALTER TABLE settings ADD COLUMN IF NOT EXISTS results_published INTEGER DEFAULT 0').catch(() => {});
    await runAsync('ALTER TABLE settings ADD COLUMN IF NOT EXISTS one_submission_allowed INTEGER DEFAULT 0').catch(() => {});

    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_en TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ky TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS badge_ru TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_en TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ky TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS title_ru TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_en TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ky TEXT').catch(() => {});
    await runAsync('ALTER TABLE homepage_blocks ADD COLUMN IF NOT EXISTS content_ru TEXT').catch(() => {});

  // Seed default homepage_blocks if empty
  const blockCount = await getAsync('SELECT COUNT(*) as count FROM homepage_blocks').catch(() => null);
  if (!blockCount || parseInt(blockCount.count, 10) === 0) {
    const defaultBlocks = [
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
        content_ru: 'Онлайн-тест: множественный выбор и короткий ответ',
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
        content_ru: 'Живые блиц-вопросы в режиме реального времени',
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
        content_ru: 'Финальный раунд с лучшими командами',
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
        content_ru: '2–4 человека из одной школы',
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
        content_ru: 'Дисциплины олимпиады по предметам и направлениям',
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
        content_ru: 'Этапы 1 и 2 проводятся в онлайн-формате. Третий этап проводится в оффлайн-формате.',
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
        content_ru: 'На этом этапе команды проходят онлайн-тестирование по выбранным категориям. Участники отвечают на вопросы с множественным выбором и короткими ответами. По результатам этого этапа определяются команды, которые пройдут в следующий раунд.',
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
        content_ru: 'Этап выявляет лучшие команды среди уже успешных. На этом этапе проводится онлайн-тестирование с более сложными вопросами. Команды соревнуются в режиме реального времени, отвечая на блиц-вопросы по различным категориям знаний.',
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
        content_ru: 'Финал проводится в оффлайн формате в Президентском лицее «Акылман» (Чолпон-Ата). Итоговый тест между лучшими командами по результатам полуфинала. Победители определяются по общему количеству набранных баллов.',
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
        content_ru: 'Для учеников средней и старшей школы',
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
        content_ru: 'Присоединяйтесь к интеллектуальному турниру для школьников и откройте новые возможности для своей команды.',
      },
    ];

    for (const b of defaultBlocks) {
      await runAsync(
        `INSERT INTO homepage_blocks (block_key, badge_en, badge_ky, badge_ru, title_en, title_ky, title_ru, content_en, content_ky, content_ru, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (block_key) DO NOTHING`,
        [b.block_key, b.badge_en, b.badge_ky, b.badge_ru, b.title_en, b.title_ky, b.title_ru, b.content_en, b.content_ky, b.content_ru],
      ).catch(() => {});
    }
  }

  // Ensure default 3 tournament categories are seeded
  const catCount = await getAsync('SELECT COUNT(*) as count FROM categories').catch(() => null);
  const countNum = parseInt(catCount?.count || 0, 10);
  if (countNum < 3) {
    const existing = await allAsync('SELECT name_ru FROM categories').catch(() => []);
    const existingNames = new Set(existing.map(c => c.name_ru));
    if (!existingNames.has('Общая категория')) {
      await runAsync(
        `INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at)
         VALUES ('Общая категория', 'Жалпы категория', 'Вопросы общей тематики', 'Жалпы темалар боюнча суроолор', NOW())`,
      ).catch(() => {});
    }
    if (!existingNames.has('История и культура')) {
      await runAsync(
        `INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at)
         VALUES ('История и культура', 'Тарых жана маданият', 'Вопросы по истории и культуре', 'Тарых жана маданият боюнча суроолор', NOW())`,
      ).catch(() => {});
    }
    if (!existingNames.has('Наука и природа')) {
      await runAsync(
        `INSERT INTO categories (name_ru, name_ky, desc_ru, desc_ky, created_at)
         VALUES ('Наука и природа', 'Илим жана жаратылыш', 'Вопросы по науке и природе', 'Илим жана жаратылыш боюнча суроолор', NOW())`,
      ).catch(() => {});
    }
  }

  // Seed settings if empty
  const sAny = await getAsync('SELECT id FROM settings WHERE id=1');
  if (!sAny) {
    await runAsync(
      `INSERT INTO settings (id,day1_date,day2_date,day3_date,final_place_ru,final_place_ky,results_published,one_submission_allowed,updated_at)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        DEFAULT_SETTINGS.day1_date, DEFAULT_SETTINGS.day2_date, DEFAULT_SETTINGS.day3_date,
        DEFAULT_SETTINGS.final_place_ru, DEFAULT_SETTINGS.final_place_ky,
        DEFAULT_SETTINGS.results_published, DEFAULT_SETTINGS.one_submission_allowed,
      ],
    );
  }

  console.log('Schema ready');
}

module.exports = {
  ensureSchema,
  DEFAULT_SETTINGS,
};
