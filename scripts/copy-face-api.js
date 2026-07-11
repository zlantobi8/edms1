// Ensures public/js/vendor-face-api.min.js always matches the installed
// face-api.js package. A pre-built copy already ships in public/js/ so the
// app works out of the box, but this keeps it in sync automatically if the
// dependency is ever reinstalled or upgraded — no manual step needed.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'face-api.js', 'dist', 'face-api.min.js');
const dest = path.join(__dirname, '..', 'public', 'js', 'vendor-face-api.min.js');

try {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('[EMDMS] Synced face-api.js browser bundle to public/js/vendor-face-api.min.js');
  }
} catch (err) {
  // Non-fatal — the pre-built copy already shipped in public/js/ still works.
  console.warn('[EMDMS] Could not sync face-api.js bundle (using existing copy):', err.message);
}
