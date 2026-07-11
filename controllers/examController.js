const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Invigilator = require('../models/Invigilator');
const { parseCsv } = require('../services/csvService');

const listExams = (req, res) => res.json({ success: true, data: Exam.all() });

const getExam = (req, res) => {
  const exam = Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
  const questions = Question.allForExam(exam.id);
  const invigilators = Invigilator.invigilatorsForExam(exam.id);
  res.json({ success: true, data: { ...exam, questions, invigilators } });
};

const createExam = (req, res, next) => {
  try {
    const b = req.body;
    const required = ['title', 'subject_id', 'class_id', 'session_id', 'semester_id', 'exam_date', 'start_time', 'end_time'];
    for (const field of required) {
      if (!b[field]) return res.status(400).json({ success: false, message: `Field "${field}" is required.` });
    }
    const exam = Exam.create({
      title: b.title.trim(),
      subject_id: b.subject_id,
      class_id: b.class_id,
      session_id: b.session_id,
      semester_id: b.semester_id,
      duration_minutes: b.duration_minutes || 60,
      pass_mark: b.pass_mark ?? 50,
      total_marks: b.total_marks ?? 100,
      exam_date: b.exam_date,
      start_time: b.start_time,
      end_time: b.end_time,
      randomize_questions: b.randomize_questions ? 1 : 0,
      randomize_options: b.randomize_options ? 1 : 0,
      created_by: req.user.id,
    });
    res.status(201).json({ success: true, data: exam });
  } catch (err) { next(err); }
};

const updateExam = (req, res, next) => {
  try {
    const exam = Exam.update(req.params.id, req.body);
    res.json({ success: true, data: exam });
  } catch (err) { next(err); }
};

const publishExam = (req, res) => { Exam.setPublished(req.params.id, true); res.json({ success: true }); };
const unpublishExam = (req, res) => { Exam.setPublished(req.params.id, false); res.json({ success: true }); };
const removeExam = (req, res) => { Exam.remove(req.params.id); res.json({ success: true }); };

// ---------- Questions ----------

const listQuestions = (req, res) => res.json({ success: true, data: Question.allForExam(req.params.examId) });

const createQuestion = (req, res, next) => {
  try {
    const { question_text, marks, position, options } = req.body;
    if (!question_text || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'Question text and at least two options are required.' });
    }
    if (!options.some((o) => o.is_correct)) {
      return res.status(400).json({ success: false, message: 'At least one option must be marked correct.' });
    }
    const question = Question.create({ exam_id: req.params.examId, question_text, marks, position, options });
    res.status(201).json({ success: true, data: question });
  } catch (err) { next(err); }
};

const updateQuestion = (req, res, next) => {
  try {
    const question = Question.update(req.params.id, req.body);
    res.json({ success: true, data: question });
  } catch (err) { next(err); }
};

const removeQuestion = (req, res) => { Question.remove(req.params.id); res.json({ success: true }); };

const importQuestionsCsv = (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'A CSV file is required.' });
    const rows = parseCsv(req.file.buffer.toString('utf8'));
    const created = Question.bulkImport(req.params.examId, rows);
    res.json({ success: true, message: `${created} question(s) imported successfully.` });
  } catch (err) {
    res.status(400).json({ success: false, message: `Could not parse CSV: ${err.message}` });
  }
};

module.exports = {
  listExams, getExam, createExam, updateExam, publishExam, unpublishExam, removeExam,
  listQuestions, createQuestion, updateQuestion, removeQuestion, importQuestionsCsv,
};
