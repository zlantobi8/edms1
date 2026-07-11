const fs = require('fs');
const path = require('path');
const Recording = require('../models/Recording');
const Submission = require('../models/Submission');
const { canAccessExam } = require('../services/examAccess');
const { totalStorageBytes } = require('../services/recordingStorage');

// ============== STUDENT: chunk upload ==============

/**
 * Appends one small video chunk to this submission's recording file on
 * disk. Deliberately lightweight: no transcoding, no buffering beyond a
 * single chunk in memory, and a synchronous (sub-millisecond) SQLite
 * metadata update — this is what lets it scale to a full exam hall of
 * concurrent students without taxing the server.
 */
async function uploadChunk(req, res, next) {
  try {
    const submission = Submission.findById(req.params.submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    if (submission.status !== 'in_progress') {
      // Exam already ended — silently accept-and-drop rather than erroring,
      // in case a last in-flight chunk arrives just after submission.
      return res.json({ success: true, dropped: true });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No video chunk received.' });

    const recording = Recording.getOrCreate(submission.id, submission.exam_id, submission.student_id);
    await fs.promises.appendFile(recording.file_path, req.file.buffer);
    Recording.appendChunkMeta(submission.id, req.file.buffer.length);

    res.json({ success: true });
  } catch (err) { next(err); }
}

function finishRecording(req, res, next) {
  try {
    const submission = Submission.findById(req.params.submissionId);
    if (!submission || submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized for this submission.' });
    }
    const recording = Recording.findBySubmission(submission.id);
    if (recording) Recording.markCompleted(submission.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ============== ADMIN / INVIGILATOR: review ==============

function listForExam(req, res) {
  const examId = req.params.examId;
  if (!canAccessExam(req.user, examId)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  res.json({ success: true, data: Recording.forExam(examId) });
}

/** Streams a recording with HTTP Range support so the <video> player can seek. */
function streamRecording(req, res) {
  const recording = Recording.findById(req.params.id);
  if (!recording) return res.status(404).json({ success: false, message: 'Recording not found.' });
  if (!canAccessExam(req.user, recording.exam_id)) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this examination.' });
  }
  if (!fs.existsSync(recording.file_path)) {
    return res.status(404).json({ success: false, message: 'Recording file is missing from disk.' });
  }

  const stat = fs.statSync(recording.file_path);
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': recording.mime_type });
    fs.createReadStream(recording.file_path).pipe(res);
    return;
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': recording.mime_type,
  });
  fs.createReadStream(recording.file_path, { start, end }).pipe(res);
}

function removeRecording(req, res) {
  // Admin-only route (enforced by router) — used to free disk space.
  Recording.remove(req.params.id);
  res.json({ success: true });
}

function storageSummary(req, res) {
  res.json({ success: true, data: { total_bytes: totalStorageBytes() } });
}

module.exports = {
  uploadChunk, finishRecording, listForExam, streamRecording, removeRecording, storageSummary,
};
