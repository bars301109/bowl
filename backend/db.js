/* Universal database adapter for SQLite (dev) and PostgreSQL (production) */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Detect database type from environment
const USE_POSTGRES = !!process.env.DATABASE_URL;
let db = null;
let dbType = 'sqlite';

// Initialize database connection
if (USE_POSTGRES) {
  // PostgreSQL mode
  let Pool;
  try {
    Pool = require('pg').Pool;
  } catch (e) {
    console.error('❌ PostgreSQL driver (pg) not installed. Run: npm install pg');
    process.exit(1);
  }
  
  dbType = 'postgres';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false
  });
  
  // Test connection
  pool.query('SELECT NOW()')
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => {
      console.error('❌ PostgreSQL connection failed:', err.message);
      process.exit(1);
    });
  
  db = {
    pool,
    type: 'postgres',
    // PostgreSQL async methods
    runAsync: async (sql, params = []) => {
      // Convert SQLite syntax to PostgreSQL
      sql = convertSQLiteToPostgres(sql);
      const result = await pool.query(sql, params);
      // For INSERT with RETURNING, get the id from rows
      const lastID = result.rows?.[0]?.id || result.insertId || null;
      return {
        lastID,
        rows: result.rows,
        changes: result.rowCount || 0
      };
    },
    allAsync: async (sql, params = []) => {
      sql = convertSQLiteToPostgres(sql);
      const result = await pool.query(sql, params);
      return result.rows;
    },
    getAsync: async (sql, params = []) => {
      sql = convertSQLiteToPostgres(sql);
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },
    exec: async (sql) => {
      sql = convertSQLiteToPostgres(sql);
      await pool.query(sql);
    }
  };
} else {
  // SQLite mode (development)
  const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/var/data' : path.join(__dirname, '..', 'data'));
  const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
  
  // Ensure directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const sqliteDb = new Database(DB_FILE);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  
  db = {
    db: sqliteDb,
    name: DB_FILE,
    type: 'sqlite',
    // SQLite async methods
    runAsync: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        try {
          const stmt = sqliteDb.prepare(sql);
          const result = stmt.run(params);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    },
    allAsync: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        try {
          const stmt = sqliteDb.prepare(sql);
          const rows = stmt.all(params);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      });
    },
    getAsync: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        try {
          const stmt = sqliteDb.prepare(sql);
          const row = stmt.get(params);
          resolve(row || null);
        } catch (err) {
          reject(err);
        }
      });
    },
    exec: (sql) => {
      sqliteDb.exec(sql);
    }
  };
  
  console.log(`✅ Connected to SQLite: ${DB_FILE}`);
}

// Convert SQLite syntax to PostgreSQL
function convertSQLiteToPostgres(sql) {
  // Replace SQLite-specific syntax with PostgreSQL equivalents
  let converted = sql;
  
  // Convert ? placeholders to $1, $2, $3... (PostgreSQL uses numbered parameters)
  let paramIndex = 1;
  converted = converted.replace(/\?/g, () => `$${paramIndex++}`);
  
  // INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
  converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  
  // INTEGER PRIMARY KEY -> SERIAL PRIMARY KEY (if no AUTOINCREMENT)
  converted = converted.replace(/INTEGER PRIMARY KEY(?!\s+AUTOINCREMENT)/gi, 'SERIAL PRIMARY KEY');
  
  // TEXT -> VARCHAR or TEXT (PostgreSQL supports both)
  // Keep TEXT as is, PostgreSQL supports it
  
  // datetime('now') -> NOW()
  converted = converted.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'NOW()');
  
  // CHECK (id=1) -> Keep as is, PostgreSQL supports it
  
  // FOREIGN KEY syntax is the same
  
  return converted;
}

module.exports = db;

