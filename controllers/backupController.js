const path = require('path');
const fs = require('fs');
const { createBackup, listBackups, backupFilePath, restoreFromFile } = require('../services/backupService');

async function backupNow(req, res, next) {
  try {
    const filePath = await createBackup();
    res.json({ success: true, message: 'Backup created successfully.', file: path.basename(filePath) });
  } catch (err) { next(err); }
}

function list(req, res) {
  res.json({ success: true, data: listBackups() });
}

function download(req, res) {
  const filePath = backupFilePath(req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Backup file not found.' });
  res.download(filePath);
}

async function restore(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'A .db backup file is required.' });
    const tmpPath = path.join(require('os').tmpdir(), `emdms-restore-${Date.now()}.db`);
    fs.writeFileSync(tmpPath, req.file.buffer);
    restoreFromFile(tmpPath);
    fs.unlinkSync(tmpPath);
    res.json({
      success: true,
      message: 'Database restored successfully. Please restart the server (npm start) to load the restored data.',
    });
    // Give the response time to flush, then exit so the operator restarts the process cleanly.
    setTimeout(() => process.exit(0), 500);
  } catch (err) { next(err); }
}

module.exports = { backupNow, list, download, restore };
