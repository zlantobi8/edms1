const fs = require('fs');
const { db } = require('../database/db');
const { filePathFor } = require('../services/recordingStorage');

const Recording = {
  findBySubmission(submissionId) {
    return db.prepare('SELECT * FROM recordings WHERE submission_id = ?').get(submissionId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM recordings WHERE id = ?').get(id);
  },
  /** Gets the existing recording row for a submission, or creates one (and its file path) on first chunk. */
  getOrCreate(submissionId, examId, studentId) {
    const existing = this.findBySubmission(submissionId);
    if (existing) return existing;
    const filePath = filePathFor(examId, submissionId);
    db.prepare(
      `INSERT INTO recordings (submission_id, exam_id, student_id, file_path, status)
       VALUES (?, ?, ?, ?, 'recording')`
    ).run(submissionId, examId, studentId, filePath);
    return this.findBySubmission(submissionId);
  },
  appendChunkMeta(submissionId, byteLength) {
    db.prepare(
      `UPDATE recordings SET chunk_count = chunk_count + 1, total_bytes = total_bytes + ? WHERE submission_id = ?`
    ).run(byteLength, submissionId);
  },
  markCompleted(submissionId) {
    db.prepare(
      `UPDATE recordings SET status = 'completed', ended_at = datetime('now') WHERE submission_id = ?`
    ).run(submissionId);
  },
  forExam(examId) {
    return db.prepare(
      `SELECT r.*, st.reg_number, st.full_name, sub.status AS submission_status
       FROM recordings r
       JOIN students st ON st.id = r.student_id
       JOIN submissions sub ON sub.id = r.submission_id
       WHERE r.exam_id = ?
       ORDER BY st.full_name`
    ).all(examId);
  },
  remove(id) {
    const rec = this.findById(id);
    if (!rec) return;
    if (fs.existsSync(rec.file_path)) fs.unlinkSync(rec.file_path);
    db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
  },
};

module.exports = Recording;
