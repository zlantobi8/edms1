const { db } = require('../database/db');

const Exam = {
  findById(id) {
    return db.prepare(
      `SELECT e.*, sub.title AS subject_title, sub.code AS subject_code,
              c.name AS class_name, sess.name AS session_name, sem.name AS semester_name
       FROM examinations e
       JOIN subjects sub ON sub.id = e.subject_id
       JOIN classes c ON c.id = e.class_id
       JOIN sessions sess ON sess.id = e.session_id
       JOIN semesters sem ON sem.id = e.semester_id
       WHERE e.id = ?`
    ).get(id);
  },
  all({ published_only = false } = {}) {
    let query = `SELECT e.*, sub.title AS subject_title, sub.code AS subject_code, c.name AS class_name
                 FROM examinations e
                 JOIN subjects sub ON sub.id = e.subject_id
                 JOIN classes c ON c.id = e.class_id`;
    if (published_only) query += ' WHERE e.is_published = 1';
    query += ' ORDER BY e.exam_date DESC, e.start_time DESC';
    return db.prepare(query).all();
  },
  create(data) {
    const info = db.prepare(
      `INSERT INTO examinations
       (title, subject_id, class_id, session_id, semester_id, duration_minutes, pass_mark, total_marks,
        exam_date, start_time, end_time, randomize_questions, randomize_options, created_by)
       VALUES (@title, @subject_id, @class_id, @session_id, @semester_id, @duration_minutes, @pass_mark, @total_marks,
               @exam_date, @start_time, @end_time, @randomize_questions, @randomize_options, @created_by)`
    ).run(data);
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = [
      'title', 'subject_id', 'class_id', 'session_id', 'semester_id', 'duration_minutes',
      'pass_mark', 'total_marks', 'exam_date', 'start_time', 'end_time',
      'randomize_questions', 'randomize_options',
    ];
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
    db.prepare(`UPDATE examinations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },
  setPublished(id, published) {
    return db.prepare('UPDATE examinations SET is_published = ? WHERE id = ?').run(published ? 1 : 0, id);
  },
  remove(id) {
    return db.prepare('DELETE FROM examinations WHERE id = ?').run(id);
  },
  examsForClass(classId, { published_only = true } = {}) {
    let query = 'SELECT * FROM examinations WHERE class_id = ?';
    if (published_only) query += ' AND is_published = 1';
    query += ' ORDER BY exam_date, start_time';
    return db.prepare(query).all(classId);
  },
};

module.exports = Exam;
