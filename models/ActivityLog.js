const { db } = require('../database/db');

const ActivityLog = {
  record({ submission_id, student_id, exam_id, event_type, details }) {
    const info = db.prepare(
      `INSERT INTO activity_logs (submission_id, student_id, exam_id, event_type, details)
       VALUES (?, ?, ?, ?, ?)`
    ).run(submission_id || null, student_id || null, exam_id || null, event_type, details ? JSON.stringify(details) : null);
    return db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(info.lastInsertRowid);
  },
  forExam(examId) {
    return db.prepare(
      `SELECT al.*, st.full_name, st.reg_number FROM activity_logs al
       LEFT JOIN students st ON st.id = al.student_id
       WHERE al.exam_id = ? ORDER BY al.created_at DESC`
    ).all(examId);
  },
  forSubmission(submissionId) {
    return db.prepare('SELECT * FROM activity_logs WHERE submission_id = ? ORDER BY created_at DESC').all(submissionId);
  },
  /**
   * Aggregates event counts per student for an exam — the basis of the
   * Incident Report's summary table (one row per flagged student rather
   * than one row per event).
   */
  summaryForExam(examId) {
    const rows = db.prepare(
      `SELECT al.student_id, st.full_name, st.reg_number, al.event_type, COUNT(*) AS count
       FROM activity_logs al
       LEFT JOIN students st ON st.id = al.student_id
       WHERE al.exam_id = ? AND al.student_id IS NOT NULL
       GROUP BY al.student_id, al.event_type`
    ).all(examId);

    const byStudent = new Map();
    rows.forEach((r) => {
      if (!byStudent.has(r.student_id)) {
        byStudent.set(r.student_id, {
          student_id: r.student_id, full_name: r.full_name, reg_number: r.reg_number,
          total_events: 0, by_type: {},
        });
      }
      const entry = byStudent.get(r.student_id);
      entry.by_type[r.event_type] = r.count;
      entry.total_events += r.count;
    });
    return [...byStudent.values()].sort((a, b) => b.total_events - a.total_events);
  },
};

module.exports = ActivityLog;
