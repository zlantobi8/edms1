const express = require('express');
const ctrl = require('../controllers/backupController');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(authenticate, requireRole('administrator'));

router.post('/', ctrl.backupNow);
router.get('/', ctrl.list);
router.get('/:name/download', ctrl.download);
router.post('/restore', upload.uploadMemory.single('file'), ctrl.restore);

module.exports = router;
