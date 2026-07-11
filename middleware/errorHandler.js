/* eslint-disable no-unused-vars */

function notFoundHandler(req, res, next) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error('[EMDMS ERROR]', err);

  // Multer throws plain errors (not HTTP-aware) for upload problems like an
  // oversized file — surface these as a proper 413/400 instead of a opaque 500.
  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'The uploaded file exceeds the allowed size limit.'
      : `Upload error: ${err.message}`;
    return res.status(status).json({ success: false, message });
  }

  const status = err.status || 500;
  const message = err.expose ? err.message : (status === 500 ? 'An unexpected server error occurred.' : err.message);
  res.status(status).json({ success: false, message });
}

module.exports = { notFoundHandler, errorHandler };
