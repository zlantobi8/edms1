const { db } = require('../database/db');

const Submission = {
  findById(id) {
    return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  },
  findByExamAndStudent(examId, studentId) {
    return db.prepare('SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  },
  startOrResume(examId, studentId, questionOrderIds, durationSeconds) {
    const existing = this.findByExamAndStudent(examId, studentId);
    if (existing) return existing;
    const info = db.prepare(
      `INSERT INTO submissions
       (exam_id, student_id, status, question_order, started_at, time_remaining_seconds, last_seen_at, is_online)
       VALUES (?, ?, 'in_progress', ?, datetime('now'), ?, datetime('now'), 1)`
    ).run(examId, studentId, JSON.stringify(questionOrderIds), durationSeconds);
    return this.findById(info.lastInsertRowid);
  },
  touch(id, { time_remaining_seconds, is_online, webcam_connected } = {}) {
    const sets = ["last_seen_at = datetime('now')"];
    const params = [];
    if (time_remaining_seconds !== undefined) { sets.push('time_remaining_seconds = ?'); params.push(time_remaining_seconds); }
    if (is_online !== undefined) { sets.push('is_online = ?'); params.push(is_online ? 1 : 0); }
    if (webcam_connected !== undefined) { sets.push('webcam_connected = ?'); params.push(webcam_connected ? 1 : 0); }
    params.push(id);
    db.prepare(`UPDATE submissions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },
  setOnline(id, isOnline) {
    return db.prepare("UPDATE submissions SET is_online = ?, last_seen_at = datetime('now') WHERE id = ?")
      .run(isOnline ? 1 : 0, id);
  },
  finish(id, status = 'submitted') {
    db.prepare(
      `UPDATE submissions SET status = ?, submitted_at = datetime('now'), is_online = 0 WHERE id = ?`
    ).run(status, id);
    return this.findById(id);
  },
  upsertAnswer(submissionId, questionId, optionId, markedForReview) {
    const existing = db.prepare(
      'SELECT id FROM answers WHERE submission_id = ? AND question_id = ?'
    ).get(submissionId, questionId);
    if (existing) {
      db.prepare(
        `UPDATE answers SET option_id = ?, is_marked_for_review = ?, answered_at = datetime('now') WHERE id = ?`
      ).run(optionId ?? null, markedForReview ? 1 : 0, existing.id);
      return existing.id;
    }
    const info = db.prepare(
      `INSERT INTO answers (submission_id, question_id, option_id, is_marked_for_review, answered_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(submissionId, questionId, optionId ?? null, markedForReview ? 1 : 0);
    return info.lastInsertRowid;
  },
  answersFor(submissionId) {
    return db.prepare('SELECT * FROM answers WHERE submission_id = ?').all(submissionId);
  },
  answeredCount(submissionId) {
    return db.prepare(
      'SELECT COUNT(*) AS count FROM answers WHERE submission_id = ? AND option_id IS NOT NULL'
    ).get(submissionId).count;
  },
  activeForExam(examId) {
    return db.prepare(
      `SELECT sub.*, st.reg_number, st.full_name, st.department_id, d.name AS department_name
       FROM submissions sub
       JOIN students st ON st.id = sub.student_id
       LEFT JOIN departments d ON d.id = st.department_id
       WHERE sub.exam_id = ?
       ORDER BY st.full_name`
    ).all(examId);
  },
};

module.exports = Submission;
