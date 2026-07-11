const { db } = require('../database/db');

const Result = {
  /**
   * Grades a submission: compares every answer's chosen option against the
   * correct option for its question, sums marks, and stores/updates the
   * result row. Returns the computed result.
   */
  gradeSubmission(submissionId) {
    const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);
    if (!submission) throw new Error('Submission not found');

    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(submission.exam_id);
    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(submission.exam_id);
    const answers = db.prepare('SELECT * FROM answers WHERE submission_id = ?').all(submissionId);
    const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

    let score = 0;
    let totalMarks = 0;
    for (const q of questions) {
      totalMarks += q.marks;
      const answer = answerByQuestion.get(q.id);
      if (!answer || answer.option_id == null) continue;
      const option = db.prepare('SELECT * FROM options WHERE id = ?').get(answer.option_id);
      if (option && option.is_correct) score += q.marks;
    }

    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const passed = percentage >= exam.pass_mark ? 1 : 0;

    const existing = db.prepare('SELECT id FROM results WHERE submission_id = ?').get(submissionId);
    if (existing) {
      db.prepare(
        `UPDATE results SET score = ?, total_marks = ?, percentage = ?, passed = ?, graded_at = datetime('now')
         WHERE id = ?`
      ).run(score, totalMarks, percentage, passed, existing.id);
    } else {
      db.prepare(
        `INSERT INTO results (submission_id, exam_id, student_id, score, total_marks, percentage, passed)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(submissionId, submission.exam_id, submission.student_id, score, totalMarks, percentage, passed);
    }
    return db.prepare('SELECT * FROM results WHERE submission_id = ?').get(submissionId);
  },

  all({ exam_id, department_id, class_id } = {}) {
    let query = `
      SELECT r.*, st.reg_number, st.full_name, st.department_id, st.class_id,
             d.name AS department_name, c.name AS class_name,
             e.title AS exam_title, sub.status AS submission_status, sub.submitted_at
      FROM results r
      JOIN students st ON st.id = r.student_id
      JOIN examinations e ON e.id = r.exam_id
      JOIN submissions sub ON sub.id = r.submission_id
      LEFT JOIN departments d ON d.id = st.department_id
      LEFT JOIN classes c ON c.id = st.class_id
      WHERE 1=1`;
    const params = [];
    if (exam_id) { query += ' AND r.exam_id = ?'; params.push(exam_id); }
    if (department_id) { query += ' AND st.department_id = ?'; params.push(department_id); }
    if (class_id) { query += ' AND st.class_id = ?'; params.push(class_id); }
    query += ' ORDER BY r.percentage DESC';
    return db.prepare(query).all(...params);
  },

  forStudent(studentId) {
    return db.prepare(
      `SELECT r.*, e.title AS exam_title FROM results r
       JOIN examinations e ON e.id = r.exam_id
       WHERE r.student_id = ? ORDER BY r.graded_at DESC`
    ).all(studentId);
  },
};

module.exports = Result;
