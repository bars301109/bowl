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
  
  // Parse and fix DATABASE_URL if needed
  let connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // Fix common Render PostgreSQL URL issues
    // If URL has internal host (dpg-xxx-a), try to use external format
    const internalHostMatch = connectionString.match(/@(dpg-[^-]+-[a-z])/);
    if (internalHostMatch && !connectionString.includes('.render.com')) {
      // Try to convert internal URL to external format
      const internalHost = internalHostMatch[1];
      // Render PostgreSQL external URLs typically use format: dpg-xxx-a.oregon-postgres.render.com
      // But we'll try the original first, and if it fails, suggest using external URL
      console.log(`⚠️  Using internal PostgreSQL host: ${internalHost}`);
      console.log(`   If connection fails, use External Database URL from Render dashboard`);
    }
    
    // Ensure SSL is properly configured for Render
    if (!connectionString.includes('sslmode=')) {
      // Add sslmode=require for Render PostgreSQL
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
    }
  }
  
  const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString?.includes('sslmode=require') || connectionString?.includes('sslmode=prefer') 
      ? { rejectUnauthorized: false } 
      : false,
    // Connection pool settings for better reliability
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  
  // Test connection with retry logic
  let connectionAttempts = 0;
  const maxAttempts = 3;
  
  async function testConnection() {
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Connected to PostgreSQL');
      return true;
    } catch (err) {
      connectionAttempts++;
      if (connectionAttempts < maxAttempts) {
        console.log(`⚠️  Connection attempt ${connectionAttempts}/${maxAttempts} failed, retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return testConnection();
      } else {
        console.error('❌ PostgreSQL connection failed after', maxAttempts, 'attempts');
        console.error('   Error:', err.message);
        console.error('');
        console.error('🔧 Troubleshooting:');
        console.error('   1. Check DATABASE_URL in Render Environment Variables');
        console.error('   2. Use "External Database URL" from PostgreSQL dashboard (not Internal)');
        console.error('   3. Ensure PostgreSQL database is running on Render');
        console.error('   4. Format should be: postgresql://user:pass@host:port/database?sslmode=require');
        console.error('');
        // Don't exit immediately - let the app try to start anyway
        // Some connection issues resolve after a few seconds
        console.error('⚠️  Continuing startup, but database operations may fail...');
        return false;
      }
    }
  }
  
  // Don't wait for connection test - it will retry in background
  // But ensure db object is created immediately
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

