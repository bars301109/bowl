/*
 * Cloud SQL PostgreSQL Database Adapter with In-Memory SQLite Fallback
 * Connects to Cloud SQL / PostgreSQL when configured, or provides an in-memory
 * database in development / test environments when credentials are not present.
 */
const { Pool } = require('pg');
const { DatabaseSync } = require('node:sqlite');

let pool = null;
let memoryDb = null;
let usingMemoryFallback = false;

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const sqlUser = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const sqlPassword = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

function isTransientConnError(err) {
  if (!err) return false;
  return (
    err.code === '57P01' ||
    err.code === '57P02' ||
    err.code === '57P03' ||
    err.code === 'ECONNRESET' ||
    err.code === 'EPIPE' ||
    (typeof err.message === 'string' && (
      err.message.includes('terminating connection due to administrator command') ||
      err.message.includes('Connection terminated unexpectedly')
    ))
  );
}

if (sqlHost && sqlDbName && sqlUser) {
  try {
    pool = new Pool({
      host: sqlHost,
      user: sqlUser,
      password: sqlPassword,
      database: sqlDbName,
      max: 20,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    pool.on('error', (err) => {
      if (isTransientConnError(err)) return;
      console.warn('⚠️ Cloud SQL pool warning:', err.message);
    });

    console.log(`✓ Cloud SQL connected to ${sqlDbName} via Unix socket ${sqlHost}`);
  } catch (err) {
    console.error('❌ Could not initialize Cloud SQL pool:', err.message);
  }
} else if (process.env.DATABASE_URL) {
  try {
    let connectionString = process.env.DATABASE_URL.trim();
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    if (!isLocalhost && !connectionString.includes('sslmode=')) {
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
    }

    pool = new Pool({
      connectionString,
      ssl: !isLocalhost ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });

    pool.on('error', (err) => {
      if (isTransientConnError(err)) return;
      console.warn('⚠️ PostgreSQL pool warning:', err.message);
    });

    console.log('✓ PostgreSQL connected via DATABASE_URL');
  } catch (err) {
    console.error('❌ Could not initialize PostgreSQL pool:', err.message);
  }
} else {
  console.log('ℹ️ No PostgreSQL credentials in environment — initializing in-memory database');
  initMemoryDb();
}

function initMemoryDb() {
  if (!memoryDb) {
    memoryDb = new DatabaseSync(':memory:');
    usingMemoryFallback = true;
    createBaseTables(memoryDb);
    console.log('✅ In-memory database active (data will reset on restart)');
  }
  return memoryDb;
}

function createBaseTables(db) {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ru TEXT NOT NULL,
      name_ky TEXT NOT NULL,
      desc_ru TEXT,
      desc_ky TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      grade TEXT,
      school TEXT,
      city TEXT,
      team_id INTEGER,
      category_id INTEGER,
      category_confirmed BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      code TEXT,
      expires_at TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER,
      ordinal INTEGER,
      text TEXT,
      options TEXT,
      correct TEXT,
      points INTEGER DEFAULT 1,
      lang TEXT DEFAULT 'ru',
      type TEXT DEFAULT 'mcq',
      attachment_url TEXT,
      category_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      test_id INTEGER,
      participant_id INTEGER,
      category_id INTEGER,
      score INTEGER,
      answers TEXT,
      taken_at TEXT,
      started_at TEXT,
      time_taken_sec INTEGER
    );
    CREATE TABLE IF NOT EXISTS test_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      test_id INTEGER,
      started_at TEXT,
      status TEXT DEFAULT 'in_progress',
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      day1_date TEXT, day2_date TEXT, day3_date TEXT,
      final_place_ru TEXT, final_place_ky TEXT,
      results_published INTEGER DEFAULT 0,
      one_submission_allowed INTEGER DEFAULT 1,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS homepage_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ru TEXT DEFAULT '',
      title_ky TEXT DEFAULT '',
      title_en TEXT DEFAULT '',
      content_ru TEXT DEFAULT '',
      content_ky TEXT DEFAULT '',
      content_en TEXT DEFAULT '',
      target_type TEXT DEFAULT 'all',
      target_category_id INTEGER,
      priority TEXT DEFAULT 'normal',
      is_published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      subject TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER,
      sender_type TEXT NOT NULL,
      sender_name TEXT,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `;
  db.exec(schemaSql);
}

function pgToSqlite(sql) {
  let s = sql.trim();
  if (/^DO\s+\$\$/i.test(s) || /^GRANT\b/i.test(s)) return null;
  if (/ALTER\s+TABLE\s+\w+\s+DROP\s+CONSTRAINT/i.test(s)) return null;
  if (/ALTER\s+TABLE\s+\w+\s+ADD\s+CONSTRAINT/i.test(s)) return null;
  if (/ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN/i.test(s)) return null;

  // Remove public. schema prefix
  s = s.replace(/\bpublic\./gi, '');

  // Column types & defaults
  s = s
    .replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\s+DEFAULT\s+NOW\(\)/gi, "TEXT DEFAULT (datetime('now'))")
    .replace(/\bTIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP/gi, "TEXT DEFAULT (datetime('now'))")
    .replace(/\bDEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))")
    .replace(/\bNOW\(\)/gi, "datetime('now')");

  // Fix ALTER TABLE ADD COLUMN IF NOT EXISTS which is not supported in basic SQLite ALTER TABLE
  if (/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+(.+)$/i.test(s)) {
    const match = s.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+(.+)$/i);
    const tableName = match[1];
    const colName = match[2];
    const colDef = match[3];
    try {
      if (memoryDb) {
        const cols = memoryDb.prepare(`PRAGMA table_info(${tableName})`).all();
        if (cols && cols.some(c => c.name.toLowerCase() === colName.toLowerCase())) {
          return null; // Already exists
        }
      }
    } catch {}
    s = `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`;
  }

  // Convert $1, $2, ... placeholders to ?
  s = s.replace(/\$[0-9]+/g, '?');

  return s;
}

function memRun(sql, params = []) {
  const mdb = initMemoryDb();
  const converted = pgToSqlite(sql);
  if (!converted) {
    return { lastID: null, changes: 0, rows: [] };
  }
  const stmt = mdb.prepare(converted);
  if (/RETURNING/i.test(converted)) {
    try {
      const row = stmt.get(...params);
      return {
        lastID: row?.id || null,
        changes: row ? 1 : 0,
        rows: row ? [row] : [],
      };
    } catch (e) {
      const info = stmt.run(...params);
      return {
        lastID: info.lastInsertRowid || null,
        changes: info.changes || 0,
        rows: [],
      };
    }
  }
  const info = stmt.run(...params);
  return {
    lastID: info.lastInsertRowid || null,
    changes: info.changes || 0,
    rows: [],
  };
}

function memGet(sql, params = []) {
  const mdb = initMemoryDb();
  const converted = pgToSqlite(sql);
  if (!converted) return null;
  return mdb.prepare(converted).get(...params) || null;
}

function memAll(sql, params = []) {
  const mdb = initMemoryDb();
  const converted = pgToSqlite(sql);
  if (!converted) return [];
  return mdb.prepare(converted).all(...params) || [];
}

async function executeWithRetry(querySql, params = []) {
  if (!pool || usingMemoryFallback) {
    return null;
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      return await pool.query(querySql, params);
    } catch (err) {
      attempts++;

      const isTransient = isTransientConnError(err);
      const isMissingTable = (err && err.code === '42P01');
      const isCategoryConfirmedMismatch = (err && typeof err.message === 'string' && err.message.includes('category_confirmed'));

      if ((isTransient || isMissingTable || isCategoryConfirmedMismatch) && attempts < maxAttempts) {
        if (isMissingTable) {
          try {
            const { ensureSchema } = require('./services/schema');
            await ensureSchema();
          } catch (schemaErr) {
            console.error('Auto schema ensure failed:', schemaErr.message);
          }
        }

        if (isCategoryConfirmedMismatch) {
          try {
            console.log('🔄 Auto-healing category_confirmed column to boolean...');
            await pool.query(`
              DO $$ 
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
              END $$;
            `);
            console.log('✅ category_confirmed column successfully healed to boolean');
          } catch (healErr) {
            console.error('Auto heal category_confirmed failed:', healErr.message);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500 * attempts));
        continue;
      }

      throw err;
    }
  }
}

async function runAsync(sql, params = []) {
  if (!pool || usingMemoryFallback) {
    return memRun(sql, params);
  }
  try {
    let querySql = sql;
    const isInsert = /^\s*INSERT\s+INTO/i.test(querySql);
    if (isInsert && !/RETURNING/i.test(querySql)) {
      querySql += ' RETURNING id';
    }
    const result = await executeWithRetry(querySql, params);
    return {
      lastID: result.rows?.[0]?.id || null,
      rows: result.rows,
      changes: result.rowCount || 0,
    };
  } catch (err) {
    if (usingMemoryFallback) {
      return memRun(sql, params);
    }
    const isDdl = /^\s*(CREATE|ALTER|DROP)\s+/i.test(sql);
    if (!isDdl) {
      console.error('PostgreSQL runAsync error:', err.message, 'SQL:', sql);
    }
    throw err;
  }
}

async function allAsync(sql, params = []) {
  if (!pool || usingMemoryFallback) {
    return memAll(sql, params);
  }
  try {
    const result = await executeWithRetry(sql, params);
    return result.rows;
  } catch (err) {
    if (usingMemoryFallback) {
      return memAll(sql, params);
    }
    console.error('PostgreSQL allAsync error:', err.message, 'SQL:', sql);
    throw err;
  }
}

async function getAsync(sql, params = []) {
  if (!pool || usingMemoryFallback) {
    return memGet(sql, params);
  }
  try {
    const result = await executeWithRetry(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    if (usingMemoryFallback) {
      return memGet(sql, params);
    }
    console.error('PostgreSQL getAsync error:', err.message, 'SQL:', sql);
    throw err;
  }
}

async function exec(sql) {
  if (!pool || usingMemoryFallback) {
    const converted = pgToSqlite(sql);
    if (converted) {
      initMemoryDb().exec(converted);
    }
    return;
  }
  try {
    await pool.query(sql);
  } catch (err) {
    console.error('PostgreSQL exec error:', err.message);
    throw err;
  }
}

async function testConnection() {
  if (usingMemoryFallback || !pool) {
    initMemoryDb();
    return true;
  }
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`✅ Connected to Cloud SQL PostgreSQL (${res.rows[0].db_name}) successfully`);
    return true;
  } catch (err) {
    console.warn(`⚠️ Cloud SQL test query failed: ${err.message} — falling back to in-memory database`);
    usingMemoryFallback = true;
    initMemoryDb();
    return true;
  }
}

async function shutdown() {
  if (pool) {
    try {
      await pool.end();
      console.log('🔌 Cloud SQL PostgreSQL pool closed');
    } catch {}
  }
  if (memoryDb) {
    try {
      memoryDb.close();
      memoryDb = null;
    } catch {}
  }
}

module.exports = {
  get pool() {
    return pool;
  },
  getPool: () => pool,
  type: 'postgres',
  runAsync,
  allAsync,
  getAsync,
  exec,
  testConnection,
  shutdown,
  isUsingInMemory: () => usingMemoryFallback || !pool,
};

