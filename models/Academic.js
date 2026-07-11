const { db } = require('../database/db');

const Faculty = {
  all() { return db.prepare('SELECT * FROM faculties ORDER BY name').all(); },
  findById(id) { return db.prepare('SELECT * FROM faculties WHERE id = ?').get(id); },
  create(name) {
    const info = db.prepare('INSERT INTO faculties (name) VALUES (?)').run(name);
    return this.findById(info.lastInsertRowid);
  },
  remove(id) { return db.prepare('DELETE FROM faculties WHERE id = ?').run(id); },
};

const Department = {
  all() {
    return db.prepare(
      `SELECT d.*, f.name AS faculty_name FROM departments d
       JOIN faculties f ON f.id = d.faculty_id ORDER BY d.name`
    ).all();
  },
  findById(id) { return db.prepare('SELECT * FROM departments WHERE id = ?').get(id); },
  create(faculty_id, name) {
    const info = db.prepare('INSERT INTO departments (faculty_id, name) VALUES (?, ?)').run(faculty_id, name);
    return this.findById(info.lastInsertRowid);
  },
  remove(id) { return db.prepare('DELETE FROM departments WHERE id = ?').run(id); },
};

const SessionModel = {
  all() { return db.prepare('SELECT * FROM sessions ORDER BY name DESC').all(); },
  findById(id) { return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id); },
  create(name) {
    const info = db.prepare('INSERT INTO sessions (name) VALUES (?)').run(name);
    return this.findById(info.lastInsertRowid);
  },
  setActive(id) {
    db.prepare('UPDATE sessions SET is_active = 0').run();
    return db.prepare('UPDATE sessions SET is_active = 1 WHERE id = ?').run(id);
  },
  remove(id) { return db.prepare('DELETE FROM sessions WHERE id = ?').run(id); },
};

const Semester = {
  all(session_id) {
    if (session_id) {
      return db.prepare('SELECT * FROM semesters WHERE session_id = ? ORDER BY id').all(session_id);
    }
    return db.prepare(
      `SELECT sem.*, s.name AS session_name FROM semesters sem
       JOIN sessions s ON s.id = sem.session_id ORDER BY sem.id DESC`
    ).all();
  },
  findById(id) { return db.prepare('SELECT * FROM semesters WHERE id = ?').get(id); },
  create(session_id, name) {
    const info = db.prepare('INSERT INTO semesters (session_id, name) VALUES (?, ?)').run(session_id, name);
    return this.findById(info.lastInsertRowid);
  },
  setActive(id) {
    db.prepare('UPDATE semesters SET is_active = 0').run();
    return db.prepare('UPDATE semesters SET is_active = 1 WHERE id = ?').run(id);
  },
  remove(id) { return db.prepare('DELETE FROM semesters WHERE id = ?').run(id); },
};

const ClassModel = {
  all() {
    return db.prepare(
      `SELECT c.*, d.name AS department_name FROM classes c
       JOIN departments d ON d.id = c.department_id ORDER BY c.name`
    ).all();
  },
  findById(id) { return db.prepare('SELECT * FROM classes WHERE id = ?').get(id); },
  create(department_id, name) {
    const info = db.prepare('INSERT INTO classes (department_id, name) VALUES (?, ?)').run(department_id, name);
    return this.findById(info.lastInsertRowid);
  },
  remove(id) { return db.prepare('DELETE FROM classes WHERE id = ?').run(id); },
};

const Subject = {
  all() {
    return db.prepare(
      `SELECT sub.*, d.name AS department_name FROM subjects sub
       JOIN departments d ON d.id = sub.department_id ORDER BY sub.code`
    ).all();
  },
  findById(id) { return db.prepare('SELECT * FROM subjects WHERE id = ?').get(id); },
  create({ department_id, code, title, units }) {
    const info = db.prepare(
      'INSERT INTO subjects (department_id, code, title, units) VALUES (?, ?, ?, ?)'
    ).run(department_id, code, title, units || 1);
    return this.findById(info.lastInsertRowid);
  },
  remove(id) { return db.prepare('DELETE FROM subjects WHERE id = ?').run(id); },
};

module.exports = { Faculty, Department, SessionModel, Semester, ClassModel, Subject };
