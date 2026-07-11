const Invigilator = require('../models/Invigilator');

/**
 * Administrators can access any exam's sensitive data (recordings, incident
 * logs, etc). Invigilators may only access exams they are assigned to.
 */
function canAccessExam(user, examId) {
  if (user.role === 'administrator') return true;
  if (user.role === 'invigilator') {
    return Invigilator.examsForInvigilator(user.id).some((e) => e.id === Number(examId));
  }
  return false;
}

module.exports = { canAccessExam };
