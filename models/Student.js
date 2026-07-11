const { db } = require('../database/db');

const Student = {
  findByRegNumber(regNumber) {
    return db.prepare('SELECT * FROM students WHERE reg_number = ?').get(regNumber);
  },
  findById(id) {
    return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  },
  all({ department_id, class_id } = {}) {
    let query = `SELECT s.*, d.name AS department_name, c.name AS class_name
                 FROM students s
                 LEFT JOIN departments d ON d.id = s.department_id
                 LEFT JOIN classes c ON c.id = s.class_id
                 WHERE 1=1`;
    const params = [];
    if (department_id) { query += ' AND s.department_id = ?'; params.push(department_id); }
    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    query += ' ORDER BY s.full_name';
    return db.prepare(query).all(...params);
  },
  create({ reg_number, full_name, email, phone, department_id, class_id, passport_path, password_hash }) {
    const info = db.prepare(
      `INSERT INTO students (reg_number, full_name, email, phone, department_id, class_id, passport_path, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(reg_number, full_name, email || null, phone || null, department_id || null, class_id || null, passport_path || null, password_hash);
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['full_name', 'email', 'phone', 'department_id', 'class_id', 'passport_path'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    params.push(id);
    db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },
  setLocked(id, locked) {
    return db.prepare('UPDATE students SET is_locked = ? WHERE id = ?').run(locked ? 1 : 0, id);
  },
  resetPassword(id, password_hash) {
    return db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(password_hash, id);
  },
  remove(id) {
    return db.prepare('DELETE FROM students WHERE id = ?').run(id);
  },
};

module.exports = Student;
