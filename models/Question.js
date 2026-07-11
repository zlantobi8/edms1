const { db } = require('../database/db');

const Question = {
  findById(id) {
    return db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  },
  allForExam(examId) {
    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY position, id').all(examId);
    const optionStmt = db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY position, id');
    return questions.map((q) => ({ ...q, options: optionStmt.all(q.id) }));
  },
  create({ exam_id, question_text, marks, position, options }) {
    const insertQuestion = db.prepare(
      'INSERT INTO questions (exam_id, question_text, marks, position) VALUES (?, ?, ?, ?)'
    );
    const insertOption = db.prepare(
      'INSERT INTO options (question_id, option_text, is_correct, position) VALUES (?, ?, ?, ?)'
    );
    const txn = db.transaction(() => {
      const info = insertQuestion.run(exam_id, question_text, marks || 1, position || 0);
      const questionId = info.lastInsertRowid;
      (options || []).forEach((opt, idx) => {
        insertOption.run(questionId, opt.option_text, opt.is_correct ? 1 : 0, idx);
      });
      return questionId;
    });
    const questionId = txn();
    return this.findById(questionId);
  },
  update(id, { question_text, marks, options }) {
    const txn = db.transaction(() => {
      if (question_text !== undefined || marks !== undefined) {
        const sets = [];
        const params = [];
        if (question_text !== undefined) { sets.push('question_text = ?'); params.push(question_text); }
        if (marks !== undefined) { sets.push('marks = ?'); params.push(marks); }
        params.push(id);
        db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      }
      if (options !== undefined) {
        db.prepare('DELETE FROM options WHERE question_id = ?').run(id);
        const insertOption = db.prepare(
          'INSERT INTO options (question_id, option_text, is_correct, position) VALUES (?, ?, ?, ?)'
        );
        options.forEach((opt, idx) => {
          insertOption.run(id, opt.option_text, opt.is_correct ? 1 : 0, idx);
        });
      }
    });
    txn();
    return this.findById(id);
  },
  remove(id) {
    return db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  },
  bulkImport(examId, rows) {
    // rows: [{ question_text, marks, option_a, option_b, option_c, option_d, correct_option }]
    const insertQuestion = db.prepare(
      'INSERT INTO questions (exam_id, question_text, marks, position) VALUES (?, ?, ?, ?)'
    );
    const insertOption = db.prepare(
      'INSERT INTO options (question_id, option_text, is_correct, position) VALUES (?, ?, ?, ?)'
    );
    const txn = db.transaction(() => {
      let position = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM questions WHERE exam_id = ?').get(examId).maxPos + 1;
      let created = 0;
      for (const row of rows) {
        const text = (row.question_text || '').trim();
        if (!text) continue;
        const qInfo = insertQuestion.run(examId, text, Number(row.marks) || 1, position);
        const qId = qInfo.lastInsertRowid;
        const optionKeys = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
        const correctLetter = String(row.correct_option || '').trim().toUpperCase();
        const letters = ['A', 'B', 'C', 'D', 'E'];
        optionKeys.forEach((key, idx) => {
          const value = (row[key] || '').trim();
          if (!value) return;
          insertOption.run(qId, value, letters[idx] === correctLetter ? 1 : 0, idx);
        });
        position += 1;
        created += 1;
      }
      return created;
    });
    return txn();
  },
};

module.exports = Question;
