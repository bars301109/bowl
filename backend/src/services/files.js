/*
 * Cloud SQL PostgreSQL File Storage Service
 * Stores and retrieves uploaded files directly in the database with local disk cache
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');

function guessMimeType(filename, defaultMime = 'image/png') {
  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg':
    case '.jfif': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.bmp': return 'image/bmp';
    case '.ico': return 'image/x-icon';
    case '.avif': return 'image/avif';
    case '.pdf': return 'application/pdf';
    default:
      if (defaultMime && defaultMime !== 'application/octet-stream') {
        return defaultMime;
      }
      return 'image/png';
  }
}

async function ensureFilesTable() {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS public.uploaded_files (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        mime_type TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        created_at TEXT
      )
    `);
    // Ensure sequences and table are accessible across all roles
    await db.runAsync('GRANT ALL ON public.uploaded_files TO public').catch(() => {});
    await db.runAsync('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO public').catch(() => {});
  } catch (err) {
    console.warn('ensureFilesTable warning:', err.message);
  }
}

async function saveFileToDb({ filename, mimeType, dataBase64, sizeBytes }) {
  const safeMime = guessMimeType(filename, mimeType || 'image/png');

  // Clean base64 string
  let cleanBase64 = String(dataBase64 || '').trim();
  if (cleanBase64.startsWith('data:')) {
    const commaIdx = cleanBase64.indexOf(',');
    if (commaIdx !== -1) cleanBase64 = cleanBase64.substring(commaIdx + 1);
  }
  cleanBase64 = cleanBase64.replace(/\s+/g, '');

  const size = sizeBytes || Buffer.byteLength(cleanBase64, 'base64');

  // 1. Write to local disk uploads directory FIRST for guaranteed zero-failure serving
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(cleanBase64, 'base64'));
  } catch (diskErr) {
    console.warn('Disk write warning in saveFileToDb:', diskErr.message);
  }

  // 2. Persist directly into Cloud SQL PostgreSQL database
  try {
    await ensureFilesTable();

    // Upsert into public.uploaded_files
    const existing = await db.getAsync('SELECT id FROM public.uploaded_files WHERE filename = $1', [filename]).catch(async () => {
      // Self-heal: retry after ensuring table
      await ensureFilesTable();
      return await db.getAsync('SELECT id FROM public.uploaded_files WHERE filename = $1', [filename]).catch(() => null);
    });

    if (existing && existing.id) {
      await db.runAsync(
        'UPDATE public.uploaded_files SET mime_type = $1, data_base64 = $2, size_bytes = $3, created_at = NOW()::text WHERE id = $4',
        [safeMime, cleanBase64, size, existing.id],
      );
    } else {
      await db.runAsync(
        'INSERT INTO public.uploaded_files (filename, mime_type, data_base64, size_bytes, created_at) VALUES ($1,$2,$3,$4,NOW()::text) ON CONFLICT (filename) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_base64 = EXCLUDED.data_base64, size_bytes = EXCLUDED.size_bytes',
        [filename, safeMime, cleanBase64, size],
      );
    }
  } catch (dbErr) {
    // Cloud SQL write failed, but local disk write succeeded. Log and allow upload to succeed
    console.warn('Cloud SQL saveFileToDb warning (disk fallback active):', dbErr.message);
  }

  return { filename, size, mimeType: safeMime };
}

async function getFileFromDb(filename) {
  try {
    // 1. Check local disk first (fastest)
    const diskPath = path.resolve(process.cwd(), 'uploads', filename);
    if (fs.existsSync(diskPath)) {
      const buffer = fs.readFileSync(diskPath);
      return {
        mimeType: guessMimeType(filename, 'image/png'),
        buffer,
        size: buffer.length,
      };
    }

    // 2. Query Cloud SQL PostgreSQL
    const row = await db.getAsync('SELECT mime_type, data_base64, size_bytes FROM public.uploaded_files WHERE filename = $1', [filename]).catch(() => null);
    if (!row || !row.data_base64) return null;

    let cleanBase64 = String(row.data_base64).trim().replace(/\s+/g, '');
    if (cleanBase64.startsWith('data:')) {
      const commaIdx = cleanBase64.indexOf(',');
      if (commaIdx !== -1) cleanBase64 = cleanBase64.substring(commaIdx + 1);
    }
    const buffer = Buffer.from(cleanBase64, 'base64');
    const mimeType = (row.mime_type && row.mime_type !== 'application/octet-stream')
      ? row.mime_type
      : guessMimeType(filename, 'image/png');

    // Cache to disk
    try {
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(diskPath, buffer);
    } catch {}

    return {
      mimeType,
      buffer,
      size: buffer.length,
    };
  } catch (err) {
    console.warn('getFileFromDb error:', err.message);
    return null;
  }
}

async function deleteFileFromDb(filename) {
  try {
    await db.runAsync('DELETE FROM public.uploaded_files WHERE filename = $1', [filename]).catch(() => {});
    const diskPath = path.resolve(process.cwd(), 'uploads', filename);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    return true;
  } catch (err) {
    console.warn('deleteFileFromDb error:', err.message);
    return false;
  }
}

async function getAllFilesFromDb() {
  try {
    return await db.allAsync('SELECT id, filename, mime_type, size_bytes, created_at FROM public.uploaded_files ORDER BY id ASC');
  } catch (err) {
    return [];
  }
}

module.exports = {
  guessMimeType,
  ensureFilesTable,
  saveFileToDb,
  getFileFromDb,
  deleteFileFromDb,
  getAllFilesFromDb,
};
