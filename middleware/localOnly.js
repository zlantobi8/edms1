const path = require('path');

/**
 * True if the given IP is the machine talking to itself — 127.0.0.1, ::1,
 * or an IPv4-mapped IPv6 form of those (::ffff:127.0.0.1). Anything else
 * (including other devices on the same LAN) is NOT loopback.
 */
function isLoopback(ip) {
  if (!ip) return false;
  const normalized = ip.replace('::ffff:', '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

/**
 * Restricts a route (API or static) to requests made from the server
 * machine itself. Used for the Administrator portal: invigilators and
 * students connect over the LAN, but only whoever is sitting at the exam
 * server (opening https://localhost:3000 locally) should ever be able to
 * see the admin login exists, let alone use it.
 *
 * Deliberately responds as if the route doesn't exist at all (matching
 * notFoundHandler's shape for API calls, and falling through to the normal
 * SPA page for everything else) rather than a 403 — a 403 confirms to
 * anyone scanning the network that an admin portal is there to attack.
 */
function localOnly(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (isLoopback(ip)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
  }
  return res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
}

module.exports = { localOnly, isLoopback };
