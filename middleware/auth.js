const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../services/secretsService');

/**
 * Reads the token from the Authorization header (Bearer) or the
 * `emdms_token` cookie, verifies it, and attaches the decoded payload
 * ({ id, role, ... }) to req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const bearerToken = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearerToken || req.cookies?.emdms_token || req.query?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' });
  }
}

/**
 * Restricts a route to one or more roles: 'administrator' | 'invigilator' | 'student'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
