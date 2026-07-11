const { db } = require('../database/db');

const Invigilator = {
  findByStaffId(staffId) {
    return db.prepare('SELECT * FROM invigilators WHERE staff_id = ?').get(staffId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM invigilators WHERE id = ?').get(id);
  },
  all() {
    return db.prepare('SELECT id, staff_id, full_name, email, phone, created_at FROM invigilators ORDER BY full_name').all();
  },
  create({ staff_id, full_name, email, phone, password_hash }) {
    const info = db.prepare(
      `INSERT INTO invigilators (staff_id, full_name, email, phone, password_hash)
       VALUES (?, ?, ?, ?, ?)`
    ).run(staff_id, full_name, email || null, phone || null, password_hash);
    return this.findById(info.lastInsertRowid);
  },
  remove(id) {
    return db.prepare('DELETE FROM invigilators WHERE id = ?').run(id);
  },
  assignToExam(examId, invigilatorId) {
    return db.prepare(
      `INSERT OR IGNORE INTO exam_invigilators (exam_id, invigilator_id) VALUES (?, ?)`
    ).run(examId, invigilatorId);
  },
  unassignFromExam(examId, invigilatorId) {
    return db.prepare(
      `DELETE FROM exam_invigilators WHERE exam_id = ? AND invigilator_id = ?`
    ).run(examId, invigilatorId);
  },
  examsForInvigilator(invigilatorId) {
    return db.prepare(
      `SELECT e.* FROM examinations e
       JOIN exam_invigilators ei ON ei.exam_id = e.id
       WHERE ei.invigilator_id = ?
       ORDER BY e.exam_date DESC, e.start_time DESC`
    ).all(invigilatorId);
  },
  invigilatorsForExam(examId) {
    return db.prepare(
      `SELECT i.id, i.staff_id, i.full_name, i.email FROM invigilators i
       JOIN exam_invigilators ei ON ei.invigilator_id = i.id
       WHERE ei.exam_id = ?`
    ).all(examId);
  },
};

module.exports = Invigilator;
