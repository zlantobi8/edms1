const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');

// Deterministic seeded shuffle so option order stays stable across page
// reloads for a given student+question, without needing extra storage.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(array, seed) {
  const rand = mulberry32(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function elapsedSecondsRemaining(submission, exam) {
  const totalSeconds = exam.duration_minutes * 60;
  const startedAtMs = new Date(`${submission.started_at.replace(' ', 'T')}Z`).getTime();
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  return Math.max(0, totalSeconds - elapsed);
}

function sanitizeQuestionForStudent(question, submissionId) {
  let options = question.options.map((o) => ({ id: o.id, option_text: o.option_text }));
  options = seededShuffle(options, submissionId * 100000 + question.id);
  return {
    id: question.id,
    question_text: question.question_text,
    marks: question.marks,
    options,
  };
}

/**
 * Starts a new attempt or resumes an existing in-progress one. Enforces the
 * exam's scheduled window and prevents duplicate submissions for exams
 * already finished.
 */
function startExam(req, res, next) {
  try {
    const exam = Exam.findById(req.params.examId);
    if (!exam || !exam.is_published) return res.status(404).json({ success: false, message: 'Exam not found or not yet published.' });

    const now = new Date();
    const examStart = new Date(`${exam.exam_date}T${exam.start_time}:00`);
    const examEnd = new Date(`${exam.exam_date}T${exam.end_time}:00`);
    if (now < examStart) return res.status(403).json({ success: false, message: 'This exam has not started yet.' });
    if (now > examEnd) return res.status(403).json({ success: false, message: 'The scheduled window for this exam has closed.' });

    let submission = Submission.findByExamAndStudent(exam.id, req.user.id);
    if (submission && submission.status !== 'in_progress') {
      return res.status(409).json({ success: false, message: 'You have already submitted this exam. Duplicate submissions are not allowed.' });
    }

    const allQuestions = Question.allForExam(exam.id);
    if (!allQuestions.length) return res.status(400).json({ success: false, message: 'This exam has no questions yet. Please contact your administrator.' });

    if (!submission) {
      let order = allQuestions.map((q) => q.id);
      if (exam.randomize_questions) order = shuffleArray(order);
      submission = Submission.startOrResume(exam.id, req.user.id, order, exam.duration_minutes * 60);
      ActivityLog.record({ submission_id: submission.id, student_id: req.user.id, exam_id: exam.id, event_type: 'exam_started' });
    }

    const remaining = elapsedSecondsRemaining(submission, exam);
    if (remaining <= 0) {
      Submission.finish(submission.id, 'auto_submitted');
      Result.gradeSubmission(submission.id);
      return res.status(409).json({ success: false, message: 'Time is up — this exam has been automatically submitted.' });
    }

    const order = JSON.parse(submission.question_order);
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
    const orderedQuestions = order.map((id) => byId.get(id)).filter(Boolean)
      .map((q) => sanitizeQuestionForStudent(q, submission.id));

    const existingAnswers = Submission.answersFor(submission.id);
    const answerMap = {};
    existingAnswers.forEach((a) => { answerMap[a.question_id] = { option_id: a.option_id, marked: !!a.is_marked_for_review }; });

    res.json({
      success: true,
      data: {
        submission_id: submission.id,
        exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes, pass_mark: exam.pass_mark },
        questions: orderedQuestions,
        answers: answerMap,
        seconds_remaining: remaining,
      },
    });
  } catch (err) { next(err); }
}

function saveAnswer(req, res, next) {
  try {
    const { submissionId } = req.params;
    const { question_id, option_id, marked_for_review } = req.body;
    const submission = Submission.findById(submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    if (submission.status !== 'in_progress') {
      return res.status(409).json({ success: false, message: 'This exam has already been submitted.' });
    }
    const exam = Exam.findById(submission.exam_id);
    const remaining = elapsedSecondsRemaining(submission, exam);
    if (remaining <= 0) {
      Submission.finish(submission.id, 'auto_submitted');
      Result.gradeSubmission(submission.id);
      return res.status(409).json({ success: false, message: 'Time is up — this exam has been automatically submitted.' });
    }
    Submission.upsertAnswer(submission.id, question_id, option_id, marked_for_review);
    const answeredCount = Submission.answeredCount(submission.id);
    Submission.touch(submission.id, { time_remaining_seconds: remaining });
    res.json({ success: true, answered_count: answeredCount, seconds_remaining: remaining });
  } catch (err) { next(err); }
}

function heartbeat(req, res, next) {
  try {
    const { submissionId } = req.params;
    const submission = Submission.findById(submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    if (submission.status !== 'in_progress') {
      return res.json({ success: true, status: submission.status, seconds_remaining: 0 });
    }
    const exam = Exam.findById(submission.exam_id);
    const remaining = elapsedSecondsRemaining(submission, exam);
    if (remaining <= 0) {
      Submission.finish(submission.id, 'auto_submitted');
      Result.gradeSubmission(submission.id);
      return res.json({ success: true, status: 'auto_submitted', seconds_remaining: 0 });
    }
    Submission.touch(submission.id, { time_remaining_seconds: remaining, is_online: true });
    res.json({ success: true, status: 'in_progress', seconds_remaining: remaining });
  } catch (err) { next(err); }
}

function submitExam(req, res, next) {
  try {
    const { submissionId } = req.params;
    const submission = Submission.findById(submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    if (submission.status !== 'in_progress') {
      return res.status(409).json({ success: false, message: 'This exam has already been submitted. Duplicate submission blocked.' });
    }
    Submission.finish(submission.id, 'submitted');
    const result = Result.gradeSubmission(submission.id);
    ActivityLog.record({ submission_id: submission.id, student_id: req.user.id, exam_id: submission.exam_id, event_type: 'exam_submitted' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

function logActivity(req, res, next) {
  try {
    const { submissionId } = req.params;
    const submission = Submission.findById(submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    const { event_type, details } = req.body;
    const log = ActivityLog.record({
      submission_id: submission.id, student_id: req.user.id, exam_id: submission.exam_id, event_type, details,
    });
    res.json({ success: true, data: log });
  } catch (err) { next(err); }
}

module.exports = { startExam, saveAnswer, heartbeat, submitExam, logActivity, elapsedSecondsRemaining };
