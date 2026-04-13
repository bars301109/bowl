/* PostgreSQL-only database adapter */
const { Pool } = require('pg');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is required. Set it to your PostgreSQL connection string.');
  console.error('   Example: postgresql://user:pass@host:port/dbname?sslmode=require');
  console.error('   On Render: use the "External Database URL" from your PostgreSQL dashboard.');
  process.exit(1);
}

let connectionString = process.env.DATABASE_URL;

// Ensure SSL for Render
if (!connectionString.includes('sslmode=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // Render uses self-signed certs internally
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('⚠️  Unexpected PostgreSQL pool error:', err.message);
});

async function runAsync(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    lastID: result.rows?.[0]?.id || null,
    rows: result.rows,
    changes: result.rowCount || 0,
  };
}

async function allAsync(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function getAsync(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function exec(sql) {
  await pool.query(sql);
}

async function testConnection() {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Connected to PostgreSQL');
      return true;
    } catch (err) {
      attempts++;
      if (attempts < maxAttempts) {
        console.log(`⏳ Connection attempt ${attempts}/${maxAttempts}, retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.error('❌ PostgreSQL connection failed after', maxAttempts, 'attempts');
        console.error('   Error:', err.message);
        return false;
      }
    }
  }
  return false;
}

async function shutdown() {
  await pool.end();
  console.log('🔌 PostgreSQL pool closed');
}

module.exports = {
  pool,
  type: 'postgres',
  runAsync,
  allAsync,
  getAsync,
  exec,
  testConnection,
  shutdown,
};
