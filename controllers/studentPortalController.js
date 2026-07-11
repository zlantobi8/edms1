const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Result = require('../models/Result');

const profile = (req, res) => {
  const student = Student.findById(req.user.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  const { password_hash, ...safe } = student;
  res.json({ success: true, data: safe });
};

const availableExams = (req, res) => {
  const student = Student.findById(req.user.id);
  if (!student || !student.class_id) return res.json({ success: true, data: [] });
  const exams = Exam.examsForClass(student.class_id, { published_only: true });
  const withStatus = exams.map((exam) => {
    const submission = Submission.findByExamAndStudent(exam.id, student.id);
    return { ...exam, submission_status: submission ? submission.status : 'not_started' };
  });
  res.json({ success: true, data: withStatus });
};

const myResults = (req, res) => res.json({ success: true, data: Result.forStudent(req.user.id) });

module.exports = { profile, availableExams, myResults };
