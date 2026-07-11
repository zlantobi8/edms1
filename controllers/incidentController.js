const ActivityLog = require('../models/ActivityLog');
const Exam = require('../models/Exam');
const { canAccessExam } = require('../services/examAccess');
const { toCsv } = require('../services/csvService');
const { streamIncidentReportPdf } = require('../services/pdfService');

// Human-readable labels and severity used consistently across the
// dashboard UI and exported reports.
const EVENT_LABELS = {
  no_face: 'No face detected',
  multiple_faces: 'Multiple faces detected',
  head_turned_away: 'Head turned away',
  unusual_noise: 'Unusual/loud noise',
  tab_switch: 'Switched browser tab',
  fullscreen_exit: 'Exited full-screen',
  webcam_disconnected: 'Webcam disconnected',
  copy_attempt: 'Copy attempt blocked',
  paste_attempt: 'Paste attempt blocked',
  cut_attempt: 'Cut attempt blocked',
  account_locked_by_invigilator: 'Account locked by invigilator',
  force_submitted_by_invigilator: 'Exam force-submitted by invigilator',
  exam_started: 'Exam started',
  exam_submitted: 'Exam submitted',
};
const HIGH_SEVERITY = new Set(['no_face', 'multiple_faces', 'unusual_noise', 'fullscreen_exit']);

function listForExam(req, res) {
  const examId = req.params.examId;
  if (!canAccessExam(req.user, examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  res.json({
    success: true,
    data: {
      summary: ActivityLog.summaryForExam(examId),
      timeline: ActivityLog.forExam(examId),
      labels: EVENT_LABELS,
    },
  });
}

function exportCsv(req, res) {
  const examId = req.params.examId;
  if (!canAccessExam(req.user, examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  const timeline = ActivityLog.forExam(examId);
  const rows = timeline.map((r) => ({
    student: r.full_name || '(unknown)',
    reg_number: r.reg_number || '',
    event: EVENT_LABELS[r.event_type] || r.event_type,
    severity: HIGH_SEVERITY.has(r.event_type) ? 'High' : 'Normal',
    details: r.details || '',
    time: r.created_at,
  }));
  const csv = toCsv(rows, ['student', 'reg_number', 'event', 'severity', 'details', 'time']);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="incident_report_exam_${examId}.csv"`);
  res.send(csv);
}

function exportPdf(req, res) {
  const examId = req.params.examId;
  if (!canAccessExam(req.user, examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  const exam = Exam.findById(examId);
  const summary = ActivityLog.summaryForExam(examId);
  const timeline = ActivityLog.forExam(examId);
  streamIncidentReportPdf(res, exam, summary, timeline, EVENT_LABELS, HIGH_SEVERITY);
}

module.exports = { listForExam, exportCsv, exportPdf, EVENT_LABELS, HIGH_SEVERITY };
