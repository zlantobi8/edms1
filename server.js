require('dotenv').config();

const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');

const { initializeDatabase } = require('./database/db');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { registerSocketHandlers } = require('./sockets');
const { getOrCreateCertificate } = require('./services/certService');

// Initialize (or upgrade) the SQLite database and seed a default admin.
initializeDatabase();

const app = express();

// Browsers only allow camera/microphone access (getUserMedia, required for
// webcam proctoring) on a "secure context": https://, or http://localhost.
// Since students connect over a plain LAN IP (e.g. http://192.168.1.42),
// that would NOT be secure and the camera would be silently blocked. We
// therefore serve everything over HTTPS using a self-signed certificate
// that's generated automatically on first run and covers every LAN IP
// currently assigned to this machine. Browsers will show a one-time
// "not secure" warning per device — the operator/student must click
// "Advanced" -> "Proceed" once; after that the camera works normally.
const USE_HTTPS = process.env.DISABLE_HTTPS !== 'true';
let server;
if (USE_HTTPS) {
  const { key, cert } = getOrCreateCertificate();
  server = https.createServer({ key, cert }, app);
} else {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: { origin: '*' }, // LAN-only deployment; every device on the network is trusted here.
  maxHttpBufferSize: 2e6,
});
app.set('io', io);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------------- API ROUTES ----------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/academic', require('./routes/academic'));
app.use('/api/admin', require('./routes/adminUsers'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/results', require('./routes/results'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/student', require('./routes/student'));
app.use('/api/exam-session', require('./routes/examSession'));
app.use('/api/invigilator', require('./routes/invigilator'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/incidents', require('./routes/incidents'));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'EMDMS server is running.', time: new Date().toISOString() }));

// ---------------- STATIC FRONTEND ----------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Fallback: any unknown /api route -> 404 JSON. Any other unknown route -> index.
app.use('/api', notFoundHandler);
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(errorHandler);

registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lanAddresses = [];
  Object.values(nets).forEach((ifaces) => {
    (ifaces || []).forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) lanAddresses.push(iface.address);
    });
  });
  const scheme = USE_HTTPS ? 'https' : 'http';

  console.log('====================================================');
  console.log('  EMDMS — Examination Malpractice Detection & CBT System');
  console.log('====================================================');
  console.log(`  Local:   ${scheme}://localhost:${PORT}`);
  lanAddresses.forEach((addr) => console.log(`  Network: ${scheme}://${addr}:${PORT}  <-- share this with students`));
  if (USE_HTTPS) {
    console.log('----------------------------------------------------');
    console.log('  NOTE: this uses a self-signed certificate. The first time');
    console.log('  each device opens the address above, the browser will show');
    console.log('  a "Your connection is not private" warning — click');
    console.log('  "Advanced" then "Proceed" (one time per device/browser).');
    console.log('  This is required for webcam access to work over the network.');
  }
  console.log('====================================================');
});

process.on('SIGINT', () => {
  console.log('\n[EMDMS] Shutting down gracefully...');
  server.close(() => process.exit(0));
});
