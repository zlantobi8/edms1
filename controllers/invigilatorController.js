const Invigilator = require('../models/Invigilator');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');
const { studentRoom } = require('../sockets');
const { canAccessExam } = require('../services/examAccess');

const myExams = (req, res) => res.json({ success: true, data: Invigilator.examsForInvigilator(req.user.id) });

const monitorExam = (req, res) => {
  if (!canAccessExam(req.user, req.params.examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  const students = Submission.activeForExam(req.params.examId);
  res.json({ success: true, data: students });
};

const examLogs = (req, res) => {
  if (!canAccessExam(req.user, req.params.examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  res.json({ success: true, data: ActivityLog.forExam(req.params.examId) });
};

/** Locks a student's account (they will be unable to log back in until unlocked by an administrator). */
const lockStudent = (req, res) => {
  const examId = req.body.exam_id;
  if (!examId || !canAccessExam(req.user, examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  Student.setLocked(req.params.studentId, true);
  ActivityLog.record({ student_id: req.params.studentId, exam_id: examId, event_type: 'account_locked_by_invigilator' });
  const io = req.app.get('io');
  if (io && req.body.submission_id) {
    io.to(studentRoom(req.body.submission_id)).emit('student:locked_by_invigilator');
  }
  res.json({ success: true });
};

/** Force-submits a student's in-progress exam and grades it immediately. */
const forceSubmit = (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const submission = Submission.findById(submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });
    if (!canAccessExam(req.user, submission.exam_id)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
    }
    if (submission.status === 'in_progress') {
      Submission.finish(submission.id, 'force_submitted');
      Result.gradeSubmission(submission.id);
      ActivityLog.record({
        submission_id: submission.id, student_id: submission.student_id, exam_id: submission.exam_id,
        event_type: 'force_submitted_by_invigilator', details: { invigilator_id: req.user.id },
      });
      const io = req.app.get('io');
      if (io) io.to(studentRoom(submission.id)).emit('student:force_submitted');
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { myExams, monitorExam, examLogs, lockStudent, forceSubmit };
