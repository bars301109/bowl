/*
 * Cloud SQL PostgreSQL Database Adapter
 * Strictly cloud-based database storage without local file overrides
 */
const { Pool } = require('pg');

let pool = null;

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
      if (isTransientConnError(err)) {
        return; // Expected idle client recycle, ignore
      }
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
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'uselibpqcompat=true&sslmode=require';
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
  console.warn('⚠️ No Cloud SQL configuration found in environment');
}

async function executeWithRetry(querySql, params = []) {
  if (!pool) {
    throw new Error('Cloud SQL database pool is not initialized');
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
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * attempts));
        continue;
      }
      
      throw err;
    }
  }
}

async function runAsync(sql, params = []) {
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
    const isDdl = /^\s*(CREATE|ALTER|DROP)\s+/i.test(sql);
    if (!isDdl) {
      console.error('PostgreSQL runAsync error:', err.message, 'SQL:', sql);
    }
    throw err;
  }
}

async function allAsync(sql, params = []) {
  try {
    const result = await executeWithRetry(sql, params);
    return result.rows;
  } catch (err) {
    console.error('PostgreSQL allAsync error:', err.message, 'SQL:', sql);
    throw err;
  }
}

async function getAsync(sql, params = []) {
  try {
    const result = await executeWithRetry(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    console.error('PostgreSQL getAsync error:', err.message, 'SQL:', sql);
    throw err;
  }
}

async function exec(sql) {
  if (!pool) throw new Error('Cloud SQL database pool is not initialized');
  try {
    await pool.query(sql);
  } catch (err) {
    console.error('PostgreSQL exec error:', err.message);
    throw err;
  }
}

async function testConnection() {
  if (!pool) {
    console.error('❌ Cloud SQL database pool is unavailable');
    return false;
  }
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`✅ Connected to Cloud SQL PostgreSQL (${res.rows[0].db_name}) successfully`);
    return true;
  } catch (err) {
    console.warn(`⚠️ Cloud SQL test query failed: ${err.message}`);
    return false;
  }
}

async function shutdown() {
  if (pool) {
    try {
      await pool.end();
      console.log('🔌 Cloud SQL PostgreSQL pool closed');
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
  isUsingInMemory: () => false,
};
