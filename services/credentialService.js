const crypto = require('crypto');

function randomPassword(length = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function generateRegNumber(deptCode = 'GEN') {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${deptCode.toUpperCase()}/${year}/${rand}`;
}

function generateStaffId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${rand}`;
}

module.exports = { randomPassword, generateRegNumber, generateStaffId };
