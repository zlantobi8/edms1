const path = require('path');
const fs = require('fs');
const { db } = require('../database/db');

const BACKUPS_DIR = path.resolve(process.env.BACKUPS_DIR || './database/backups');
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

/**
 * Creates a consistent snapshot of the live database using better-sqlite3's
 * native backup() API (safe to run while the app is serving requests).
 * Returns the absolute path of the new backup file.
 */
async function createBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(BACKUPS_DIR, `emdms-backup-${stamp}.db`);
  await db.backup(destPath);
  return destPath;
}

function listBackups() {
  return fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, created_at: stat.mtime };
    })
    .sort((a, b) => b.created_at - a.created_at);
}

function backupFilePath(name) {
  const safe = path.basename(name); // prevent path traversal
  return path.join(BACKUPS_DIR, safe);
}

/**
 * Restores the database from a backup file. Because SQLite keeps an open
 * file handle for the live database, a restore requires the process to
 * restart cleanly afterwards. This function copies the backup over the live
 * database file and returns; the caller (route) is responsible for telling
 * the operator to restart the server (`npm start`) to load the restored data.
 */
function restoreFromFile(sourcePath) {
  const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'database', 'emdms.db'));
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  fs.copyFileSync(sourcePath, dbPath);
  // Remove stale WAL/SHM files from the previous session, if any.
  ['-wal', '-shm'].forEach((suffix) => {
    const p = `${dbPath}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

module.exports = { createBackup, listBackups, backupFilePath, restoreFromFile, BACKUPS_DIR };
