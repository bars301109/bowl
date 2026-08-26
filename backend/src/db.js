/* Resilient Database Adapter with in-memory fallback for development */
const { Pool } = require('pg');

let pool = null;
let useInMemory = false;

// In-memory data store
const memStore = {
  tables: {
    categories: [],
    settings: [],
    teams: [],
    password_reset_codes: [],
    tests: [],
    questions: [],
    results: [],
    homepage_blocks: [],
  },
  autoId: {
    categories: 1,
    settings: 1,
    teams: 1,
    password_reset_codes: 1,
    tests: 1,
    questions: 1,
    results: 1,
    homepage_blocks: 1,
  },
};

if (process.env.DATABASE_URL) {
  try {
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString.includes('sslmode=')) {
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.warn('⚠️  PostgreSQL pool error:', err.message);
    });
  } catch (err) {
    console.warn('⚠️  Could not initialize PostgreSQL pool, using in-memory DB:', err.message);
    useInMemory = true;
  }
} else {
  console.log('ℹ️  No DATABASE_URL provided — using fast in-memory database store');
  useInMemory = true;
}

// In-memory query runner
function executeInMemory(sql, params = []) {
  const cleanSql = sql.trim().replace(/\s+/g, ' ');
  const upper = cleanSql.toUpperCase();

  // DDL: CREATE TABLE / ALTER TABLE
  if (upper.startsWith('CREATE TABLE') || upper.startsWith('ALTER TABLE')) {
    const match = cleanSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/i);
    if (match && !memStore.tables[match[1]]) {
      memStore.tables[match[1]] = [];
      memStore.autoId[match[1]] = 1;
    }
    return { rows: [], changes: 0, lastID: null };
  }

  // INSERT
  if (upper.startsWith('INSERT INTO')) {
    const tableMatch = cleanSql.match(/INSERT\s+INTO\s+([a-z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (tableMatch) {
      const tableName = tableMatch[1].toLowerCase();
      const cols = tableMatch[2].split(',').map((c) => c.trim());
      const valPlaceholders = tableMatch[3].split(',').map((v) => v.trim());

      if (!memStore.tables[tableName]) {
        memStore.tables[tableName] = [];
        memStore.autoId[tableName] = 1;
      }

      const row = {};
      let paramIdx = 0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const valToken = valPlaceholders[i];
        if (valToken && valToken.startsWith('$')) {
          const idx = parseInt(valToken.slice(1), 10) - 1;
          row[col] = params[idx] !== undefined ? params[idx] : null;
        } else if (valToken && valToken.toUpperCase() === 'NOW()') {
          row[col] = new Date().toISOString();
        } else if (valToken && !isNaN(Number(valToken))) {
          row[col] = Number(valToken);
        } else {
          row[col] = params[paramIdx++] ?? null;
        }
      }

      if (!row.id) {
        row.id = memStore.autoId[tableName]++;
      } else {
        if (row.id >= memStore.autoId[tableName]) {
          memStore.autoId[tableName] = row.id + 1;
        }
      }

      // Check unique constraint for settings id=1 or email or block_key
      if (tableName === 'settings') {
        const existingIdx = memStore.tables.settings.findIndex((s) => s.id === row.id);
        if (existingIdx >= 0) {
          memStore.tables.settings[existingIdx] = { ...memStore.tables.settings[existingIdx], ...row };
          return { rows: [row], changes: 1, lastID: row.id };
        }
      }

      memStore.tables[tableName].push(row);
      return { rows: [row], changes: 1, lastID: row.id };
    }
  }

  // UPDATE
  if (upper.startsWith('UPDATE')) {
    const updateMatch = cleanSql.match(/UPDATE\s+([a-z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (updateMatch) {
      const tableName = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = memStore.tables[tableName] || [];

      // Parse SET fields
      const setAssignments = setClause.split(',').map((s) => s.trim());
      const updates = {};
      setAssignments.forEach((assignment) => {
        const [col, valExpr] = assignment.split('=').map((s) => s.trim());
        if (valExpr.toUpperCase() === 'NOW()') {
          updates[col] = new Date().toISOString();
        } else if (valExpr.startsWith('$')) {
          const pIdx = parseInt(valExpr.slice(1), 10) - 1;
          updates[col] = params[pIdx];
        } else {
          updates[col] = valExpr.replace(/^'|'$/g, '');
        }
      });

      let changes = 0;
      table.forEach((row) => {
        if (matchesWhere(row, whereClause, params, tableName)) {
          Object.assign(row, updates);
          changes++;
        }
      });
      return { rows: [], changes, lastID: null };
    }
  }

  // DELETE
  if (upper.startsWith('DELETE FROM')) {
    const deleteMatch = cleanSql.match(/DELETE\s+FROM\s+([a-z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1].toLowerCase();
      const whereClause = deleteMatch[2];
      const table = memStore.tables[tableName] || [];

      if (!whereClause) {
        const changes = table.length;
        memStore.tables[tableName] = [];
        return { rows: [], changes, lastID: null };
      }

      const initialCount = table.length;
      memStore.tables[tableName] = table.filter((row) => !matchesWhere(row, whereClause, params, tableName));
      return { rows: [], changes: initialCount - memStore.tables[tableName].length, lastID: null };
    }
  }

  // SELECT
  if (upper.startsWith('SELECT')) {
    // Special: SELECT NOW()
    if (cleanSql.includes('SELECT NOW()') || cleanSql.includes('select now()')) {
      return { rows: [{ now: new Date().toISOString() }], changes: 0, lastID: null };
    }

    // Special: Leaderboard query
    if (cleanSql.includes('SUM(r.score) AS total_score')) {
      const results = memStore.tables.results || [];
      const teams = memStore.tables.teams || [];
      const tests = memStore.tables.tests || [];
      const categories = memStore.tables.categories || [];

      const categoryFilterId = params[0] ? Number(params[0]) : null;

      const teamAgg = {};
      results.forEach((r) => {
        const test = tests.find((t) => t.id === r.test_id);
        if (categoryFilterId && test && test.category_id !== categoryFilterId) return;

        const team = teams.find((tm) => tm.id === r.team_id);
        if (!team) return;

        const cat = categories.find((c) => c.id === (test?.category_id || team.category_id));

        if (!teamAgg[team.id]) {
          teamAgg[team.id] = {
            team_id: team.id,
            team_name: team.team_name,
            school: team.school,
            city: team.city,
            category_name: cat ? cat.name_ru : '',
            total_score: 0,
            tests_taken: 0,
            last_taken: r.taken_at,
          };
        }
        teamAgg[team.id].total_score += Number(r.score) || 0;
        teamAgg[team.id].tests_taken += 1;
        if (r.taken_at && (!teamAgg[team.id].last_taken || new Date(r.taken_at) > new Date(teamAgg[team.id].last_taken))) {
          teamAgg[team.id].last_taken = r.taken_at;
        }
      });

      const rows = Object.values(teamAgg).sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score;
        if (a.tests_taken !== b.tests_taken) return a.tests_taken - b.tests_taken;
        return (a.last_taken || '').localeCompare(b.last_taken || '');
      });

      return { rows, changes: 0, lastID: null };
    }

    // Special: COUNT(*)
    if (cleanSql.includes('COUNT(*) AS cnt') || cleanSql.includes('COUNT(*)')) {
      const match = cleanSql.match(/FROM\s+([a-z0-9_]+)/i);
      const tableName = match ? match[1].toLowerCase() : 'categories';
      const count = (memStore.tables[tableName] || []).length;
      return { rows: [{ cnt: count }], changes: 0, lastID: null };
    }

    // Parse simple or joined queries
    return executeSelect(cleanSql, params);
  }

  return { rows: [], changes: 0, lastID: null };
}

function executeSelect(sql, params) {
  const fromMatch = sql.match(/FROM\s+([a-z0-9_]+)(?:\s+([a-z0-9_]+))?(.*?)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?$/i);
  if (!fromMatch) return { rows: [], changes: 0, lastID: null };

  const primaryTable = fromMatch[1].toLowerCase();
  const rawRows = memStore.tables[primaryTable] || [];

  // Determine joins
  const hasJoin = sql.toUpperCase().includes('JOIN');
  let joinedRows = rawRows.map((r) => ({ ...r }));

  if (hasJoin) {
    if (primaryTable === 'results' || primaryTable === 'r') {
      const teams = memStore.tables.teams || [];
      const tests = memStore.tables.tests || [];
      const categories = memStore.tables.categories || [];

      joinedRows = (memStore.tables.results || []).map((r) => {
        const test = tests.find((t) => t.id === r.test_id);
        const team = teams.find((tm) => tm.id === r.team_id);
        const cat = categories.find((c) => c.id === (test?.category_id || team?.category_id));
        return {
          ...r,
          title: test ? test.title : '',
          team_name: team ? team.team_name : '',
          category_name: cat ? cat.name_ru : '',
        };
      });
    } else if (primaryTable === 'teams' || primaryTable === 't') {
      const categories = memStore.tables.categories || [];
      joinedRows = (memStore.tables.teams || []).map((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return {
          ...t,
          category_name_ru: cat ? cat.name_ru : '',
          category_name_ky: cat ? cat.name_ky : '',
        };
      });
    } else if (primaryTable === 'tests' || primaryTable === 't') {
      const categories = memStore.tables.categories || [];
      joinedRows = (memStore.tables.tests || []).map((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return {
          ...t,
          category_name_ru: cat ? cat.name_ru : '',
          category_name_ky: cat ? cat.name_ky : '',
        };
      });
    }
  }

  // Filter with WHERE
  const whereClause = fromMatch[4];
  let filtered = joinedRows;
  if (whereClause) {
    filtered = joinedRows.filter((row) => matchesWhere(row, whereClause, params, primaryTable));
  }

  // ORDER BY
  const orderClause = fromMatch[6];
  if (orderClause) {
    const orderParts = orderClause.split(',').map((s) => s.trim());
    filtered.sort((a, b) => {
      for (const part of orderParts) {
        const [rawCol, dir] = part.split(/\s+/);
        const col = rawCol.replace(/^[a-z0-9_]+\./i, '');
        const isDesc = dir && dir.toUpperCase() === 'DESC';
        const valA = a[col];
        const valB = b[col];

        if (valA === valB) continue;
        if (valA === null || valA === undefined) return isDesc ? 1 : -1;
        if (valB === null || valB === undefined) return isDesc ? -1 : 1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isDesc ? valB - valA : valA - valB;
        }
        return isDesc ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
      }
      return 0;
    });
  }

  return { rows: filtered, changes: 0, lastID: null };
}

function matchesWhere(row, whereClause, params, tableName) {
  if (!whereClause) return true;

  // Split by AND
  const parts = whereClause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const trimmed = part.trim();

    // Check special: expires_at::timestamp > NOW()
    if (trimmed.includes('expires_at') && trimmed.includes('NOW()')) {
      const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      if (exp <= Date.now()) return false;
      continue;
    }

    // Check equality or comparisons
    const eqMatch = trimmed.match(/^([a-z0-9_.]+)\s*(=|!=|>|<|>=|<=)\s*(.+)$/i);
    if (eqMatch) {
      let col = eqMatch[1].replace(/^[a-z0-9_]+\./i, '');
      const op = eqMatch[2];
      let valToken = eqMatch[3].trim();

      let targetVal;
      if (valToken.startsWith('$')) {
        const pIdx = parseInt(valToken.slice(1), 10) - 1;
        targetVal = params[pIdx];
      } else if (valToken === '1') {
        targetVal = 1;
      } else if (valToken === '0') {
        targetVal = 0;
      } else if (valToken.startsWith("'") && valToken.endsWith("'")) {
        targetVal = valToken.slice(1, -1);
      } else if (!isNaN(Number(valToken))) {
        targetVal = Number(valToken);
      } else {
        targetVal = valToken;
      }

      const rowVal = row[col];

      if (op === '=') {
        if (rowVal == null && targetVal == null) continue;
        if (String(rowVal) !== String(targetVal)) return false;
      } else if (op === '!=') {
        if (String(rowVal) === String(targetVal)) return false;
      } else if (op === '>') {
        if (Number(rowVal) <= Number(targetVal)) return false;
      } else if (op === '<') {
        if (Number(rowVal) >= Number(targetVal)) return false;
      }
    }
  }

  return true;
}

async function runAsync(sql, params = []) {
  if (!useInMemory && pool) {
    try {
      const result = await pool.query(sql, params);
      return {
        lastID: result.rows?.[0]?.id || null,
        rows: result.rows,
        changes: result.rowCount || 0,
      };
    } catch (err) {
      console.warn('⚠️  PostgreSQL query failed, falling back to memory:', err.message);
      useInMemory = true;
    }
  }
  return executeInMemory(sql, params);
}

async function allAsync(sql, params = []) {
  if (!useInMemory && pool) {
    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err) {
      console.warn('⚠️  PostgreSQL query failed, falling back to memory:', err.message);
      useInMemory = true;
    }
  }
  const res = executeInMemory(sql, params);
  return res.rows;
}

async function getAsync(sql, params = []) {
  if (!useInMemory && pool) {
    try {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    } catch (err) {
      console.warn('⚠️  PostgreSQL query failed, falling back to memory:', err.message);
      useInMemory = true;
    }
  }
  const res = executeInMemory(sql, params);
  return res.rows[0] || null;
}

async function exec(sql) {
  if (!useInMemory && pool) {
    try {
      await pool.query(sql);
      return;
    } catch (err) {
      useInMemory = true;
    }
  }
  executeInMemory(sql);
}

async function testConnection() {
  if (useInMemory || !pool) {
    console.log('✅ In-memory database ready');
    return true;
  }
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');
    return true;
  } catch (err) {
    console.warn('⚠️  PostgreSQL connection failed:', err.message);
    console.log('ℹ️  Switching to in-memory database fallback');
    useInMemory = true;
    return true;
  }
}

async function shutdown() {
  if (pool) {
    try {
      await pool.end();
      console.log('🔌 PostgreSQL pool closed');
    } catch {}
  }
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
  memStore,
};
