const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './public/uploads/passports');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeReg = (req.body.reg_number || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeReg}_${Date.now()}${ext}`);
  },
});

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp'];

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return cb(new Error('Only JPG, PNG or WEBP images are allowed for passport photos.'));
    }
    cb(null, true);
  },
});

// In-memory upload used for CSV question imports and one-off file reads
// (e.g. database restore) that don't need to be permanently saved to disk
// under their original path.
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Dedicated upload for surveillance recording chunks. Kept small and
// memory-based on purpose: each chunk is a few seconds of low-bitrate video
// (tens of KB), written straight to disk and discarded from memory
// immediately — this is what keeps the server responsive even with a large
// number of students uploading chunks concurrently. The size cap rejects
// anything that looks like a full recording being sent in one shot.
const uploadRecordingChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // ~6MB safety ceiling per chunk
});

module.exports = upload;
module.exports.uploadMemory = uploadMemory;
module.exports.uploadRecordingChunk = uploadRecordingChunk;
