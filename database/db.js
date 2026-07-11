const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

// Determine the database path based on environment
let DB_PATH;
let SCHEMA_PATH;

if (process.env.DB_PATH) {
  DB_PATH = process.env.DB_PATH;
  SCHEMA_PATH = path.join(__dirname, 'schema.sql');
} else {
  // Check if running in Electron
  const isElectron = process.type === 'browser' || process.versions.electron;
  if (isElectron) {
    // Use userData directory which is writable even in packaged Electron app
    const app = require('electron').app;
    const userDataPath = app.getPath('userData');
    DB_PATH = path.join(userDataPath, 'emdms.db');
    SCHEMA_PATH = path.join(__dirname, 'schema.sql');
  } else {
    // Running as plain Node.js
    DB_PATH = path.join(__dirname, 'emdms.db');
    SCHEMA_PATH = path.join(__dirname, 'schema.sql');
  }
}

// Ensure the folder that will hold the database file exists.
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Runs the schema (idempotent — uses CREATE TABLE IF NOT EXISTS) and seeds a
 * default administrator account the first time the database is created so
 * the system is usable immediately after `npm install && npm start`.
 */
function initializeDatabase() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM administrators').get().count;
  if (adminCount === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345';
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      `INSERT INTO administrators (username, full_name, email, password_hash)
       VALUES (?, ?, ?, ?)`
    ).run(username, 'System Administrator', 'admin@emdms.local', hash);
    console.log(`[EMDMS] Seeded default administrator account -> username: "${username}"`);
  }

  // Seed a starter session/semester so the academic structure isn't empty.
  const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
  if (sessionCount === 0) {
    const info = db.prepare('INSERT INTO sessions (name, is_active) VALUES (?, 1)').run('2025/2026');
    db.prepare('INSERT INTO semesters (session_id, name, is_active) VALUES (?, ?, 1)')
      .run(info.lastInsertRowid, 'First Semester');
  }
}

module.exports = { db, initializeDatabase };
