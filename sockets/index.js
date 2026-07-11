const jwt = require('jsonwebtoken');
const Submission = require('../models/Submission');
const ActivityLog = require('../models/ActivityLog');
const { canAccessExam } = require('../services/examAccess');

const JWT_SECRET = process.env.JWT_SECRET;

function examRoom(examId) { return `exam:${examId}`; }
function studentRoom(submissionId) { return `submission:${submissionId}`; }

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid or expired session'));
  }
}

function registerSocketHandlers(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { role } = socket.user;

    // ---------------- STUDENT ----------------
    if (role === 'student') {
      socket.on('student:join_exam', ({ exam_id, submission_id }) => {
        socket.join(examRoom(exam_id));
        socket.join(studentRoom(submission_id));
        Submission.setOnline(submission_id, true);
        io.to(examRoom(exam_id)).emit('invigilator:student_status', {
          submission_id, is_online: true, event: 'login',
        });
      });

      socket.on('student:progress', ({ exam_id, submission_id, answered_count, seconds_remaining }) => {
        io.to(examRoom(exam_id)).emit('invigilator:progress_update', {
          submission_id, answered_count, seconds_remaining,
        });
      });

      socket.on('student:webcam_status', ({ exam_id, submission_id, connected }) => {
        Submission.touch(submission_id, { webcam_connected: connected });
        io.to(examRoom(exam_id)).emit('invigilator:webcam_status', { submission_id, connected });
        if (!connected) {
          ActivityLog.record({ submission_id, exam_id, event_type: 'webcam_disconnected' });
        }
      });

      socket.on('student:suspicious_event', ({ exam_id, submission_id, event_type, details }) => {
        ActivityLog.record({ submission_id, exam_id, event_type, details });
        io.to(examRoom(exam_id)).emit('invigilator:suspicious_event', { submission_id, event_type, details, at: new Date().toISOString() });
      });

      socket.on('student:finished', ({ exam_id, submission_id }) => {
        io.to(examRoom(exam_id)).emit('invigilator:student_status', { submission_id, is_online: false, event: 'finished' });
      });

      // WebRTC signaling: student is the media source, forwards SDP/ICE to invigilator room.
      socket.on('webrtc:signal', ({ exam_id, submission_id, signal }) => {
        io.to(examRoom(exam_id)).emit('webrtc:signal_from_student', { submission_id, signal });
      });

      // NOTE: we listen on 'disconnecting' rather than 'disconnect' — by the
      // time 'disconnect' fires, Socket.IO has already removed the socket
      // from all of its rooms, so socket.rooms would be empty here and we'd
      // have no way to know which submission this connection belonged to.
      socket.on('disconnecting', () => {
        const rooms = [...socket.rooms].filter((r) => r.startsWith('submission:'));
        rooms.forEach((r) => {
          const submissionId = r.split(':')[1];
          Submission.setOnline(submissionId, false);
          const submission = Submission.findById(submissionId);
          if (submission && submission.status === 'in_progress') {
            // Only worth flagging if the exam wasn't already finished — a
            // disconnect after submission is expected and already handled
            // by the 'student:finished' event above.
            io.to(examRoom(submission.exam_id)).emit('invigilator:student_status', {
              submission_id: Number(submissionId), is_online: false, event: 'disconnected',
            });
          }
        });
      });
    }

    // ---------------- INVIGILATOR ----------------
    if (role === 'invigilator') {
      socket.on('invigilator:watch_exam', ({ exam_id }) => {
        if (!canAccessExam(socket.user, exam_id)) return;
        socket.join(examRoom(exam_id));
      });

      socket.on('invigilator:send_warning', ({ exam_id, submission_id, message }) => {
        const submission = Submission.findById(submission_id);
        if (!submission || !canAccessExam(socket.user, submission.exam_id)) return;
        io.to(studentRoom(submission_id)).emit('student:warning', { message, at: new Date().toISOString() });
      });

      socket.on('invigilator:lock_exam_view', ({ exam_id, submission_id }) => {
        const submission = Submission.findById(submission_id);
        if (!submission || !canAccessExam(socket.user, submission.exam_id)) return;
        io.to(studentRoom(submission_id)).emit('student:locked_by_invigilator');
      });

      socket.on('invigilator:end_exam', ({ exam_id, submission_id }) => {
        const submission = Submission.findById(submission_id);
        if (!submission || !canAccessExam(socket.user, submission.exam_id)) return;
        io.to(studentRoom(submission_id)).emit('student:force_submitted');
      });

      // Relay WebRTC answer/ICE from invigilator back to the specific student.
      socket.on('webrtc:signal_to_student', ({ submission_id, signal }) => {
        const submission = Submission.findById(submission_id);
        if (!submission || !canAccessExam(socket.user, submission.exam_id)) return;
        io.to(studentRoom(submission_id)).emit('webrtc:signal_from_invigilator', { signal });
      });

      socket.on('invigilator:request_stream', ({ submission_id }) => {
        const submission = Submission.findById(submission_id);
        if (!submission || !canAccessExam(socket.user, submission.exam_id)) return;
        io.to(studentRoom(submission_id)).emit('webrtc:stream_requested');
      });
    }

    // ---------------- ADMINISTRATOR ----------------
    if (role === 'administrator') {
      socket.on('admin:watch_exam', ({ exam_id }) => socket.join(examRoom(exam_id)));
    }
  });
}

module.exports = { registerSocketHandlers, examRoom, studentRoom };
