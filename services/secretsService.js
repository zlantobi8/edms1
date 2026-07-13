const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Secrets (currently just the JWT signing key) need to live somewhere
// writable that survives app restarts but is NEVER committed to git or
// baked into the packaged build. When running as a packaged Electron app,
// __dirname may be inside a read-only asar archive, so prefer the Electron
// `userData` folder — same approach already used by certService.js.
let SECRETS_DIR;
if (process.env.SECRETS_DIR) {
  SECRETS_DIR = process.env.SECRETS_DIR;
} else {
  const isElectron = process.type === 'browser' || !!process.versions.electron;
  if (isElectron) {
    const { app } = require('electron');
    SECRETS_DIR = path.join(app.getPath('userData'), 'secrets');
  } else {
    SECRETS_DIR = path.join(__dirname, '..', 'database', 'secrets');
  }
}

const SECRETS_PATH = path.join(SECRETS_DIR, 'secrets.json');

let cached = null;

/**
 * Returns the JWT signing secret. If DISABLE_HTTPS-style override
 * process.env.JWT_SECRET is set (e.g. for local `npm run dev`), that value
 * wins. Otherwise a random 64-byte secret is generated on first run and
 * cached to disk so tokens keep working across restarts.
 */
function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (cached) return cached;

  fs.mkdirSync(SECRETS_DIR, { recursive: true });

  if (fs.existsSync(SECRETS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
      if (data.jwtSecret) {
        cached = data.jwtSecret;
        return cached;
      }
    } catch (e) {
      // fall through and regenerate below
    }
  }

  console.log('[EMDMS] No JWT_SECRET configured — generating and persisting a new one.');
  const secret = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(SECRETS_PATH, JSON.stringify({ jwtSecret: secret }, null, 2));
  cached = secret;
  return cached;
}

module.exports = { getJwtSecret };
