const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const CERT_DIR = path.join(__dirname, '..', 'database', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  Object.values(nets).forEach((ifaces) => {
    (ifaces || []).forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    });
  });
  return addresses;
}

/**
 * Returns { key, cert } for an HTTPS server. Generates a self-signed
 * certificate on first run (valid for 10 years, covering localhost, 127.0.0.1
 * and every LAN IPv4 address currently assigned to this machine) and caches
 * it to disk so it persists across restarts. Because the network's DHCP
 * lease can change the server's IP over time, the certificate is
 * regenerated automatically whenever the current LAN IPs are no longer
 * covered by the cached certificate.
 */
function getOrCreateCertificate() {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const lanAddresses = getLanAddresses();
  const altNames = [
    { type: 2, value: 'localhost' }, // DNS
    { type: 7, ip: '127.0.0.1' },    // IP
    ...lanAddresses.map((ip) => ({ type: 7, ip })),
  ];

  const cachedMeta = path.join(CERT_DIR, 'meta.json');
  let needsRegen = !fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH);

  if (!needsRegen && fs.existsSync(cachedMeta)) {
    try {
      const meta = JSON.parse(fs.readFileSync(cachedMeta, 'utf8'));
      const covered = lanAddresses.every((ip) => (meta.lanAddresses || []).includes(ip));
      if (!covered) needsRegen = true;
    } catch (e) { needsRegen = true; }
  } else if (!needsRegen) {
    needsRegen = true; // no metadata means we can't verify coverage — regenerate to be safe
  }

  if (needsRegen) {
    console.log('[EMDMS] Generating self-signed HTTPS certificate for:', ['localhost', '127.0.0.1', ...lanAddresses].join(', '));
    const attrs = [{ name: 'commonName', value: 'EMDMS Local Server' }];
    const pems = selfsigned.generate(attrs, {
      days: 3650,
      keySize: 2048,
      extensions: [
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
        { name: 'subjectAltName', altNames },
      ],
    });
    fs.writeFileSync(KEY_PATH, pems.private);
    fs.writeFileSync(CERT_PATH, pems.cert);
    fs.writeFileSync(cachedMeta, JSON.stringify({ lanAddresses }, null, 2));
  }

  return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
}

module.exports = { getOrCreateCertificate, getLanAddresses };
