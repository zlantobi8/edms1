const { db } = require('../database/db');

const Admin = {
  findByUsername(username) {
    return db.prepare('SELECT * FROM administrators WHERE username = ?').get(username);
  },
  findById(id) {
    return db.prepare('SELECT * FROM administrators WHERE id = ?').get(id);
  },
  create({ username, full_name, email, password_hash }) {
    const info = db.prepare(
      `INSERT INTO administrators (username, full_name, email, password_hash) VALUES (?, ?, ?, ?)`
    ).run(username, full_name, email || null, password_hash);
    return this.findById(info.lastInsertRowid);
  },
};

module.exports = Admin;
