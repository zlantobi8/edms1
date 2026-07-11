const path = require('path');
const fs = require('fs');

// Deliberately NOT under public/ — recordings are sensitive footage and must
// only ever be served through the authenticated streaming route in
// recordingController.js, never as a static file.
const RECORDINGS_DIR = path.resolve(process.env.RECORDINGS_DIR || './storage/recordings');

function ensureExamDir(examId) {
  const dir = path.join(RECORDINGS_DIR, String(examId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePathFor(examId, submissionId) {
  return path.join(ensureExamDir(examId), `${submissionId}.webm`);
}

/** Returns total bytes used by all recordings, for disk-space visibility in the admin UI. */
function totalStorageBytes() {
  let total = 0;
  if (!fs.existsSync(RECORDINGS_DIR)) return 0;
  const examDirs = fs.readdirSync(RECORDINGS_DIR);
  examDirs.forEach((examDir) => {
    const full = path.join(RECORDINGS_DIR, examDir);
    if (!fs.statSync(full).isDirectory()) return;
    fs.readdirSync(full).forEach((file) => {
      total += fs.statSync(path.join(full, file)).size;
    });
  });
  return total;
}

module.exports = { RECORDINGS_DIR, filePathFor, totalStorageBytes };
