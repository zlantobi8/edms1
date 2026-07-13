const { app, shell, BrowserWindow, dialog } = require('electron');
const path = require('path');
const https = require('https');

// Allow loading the local server using a self-signed certificate (localhost only)
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');

function probeServer(timeout = 1000) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
      rejectUnauthorized: false,
      timeout,
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function startServer() {
  try {
    const up = await probeServer();
    if (up) {
      console.log('Server already running on https://localhost:3000; skipping start.');
      return true;
    }
    console.log('Starting Express server...');
    const serverPath = path.join(__dirname, 'server.js');
    require(serverPath);
    console.log('Express server loaded.');
    return true;
  } catch (err) {
    console.error('Failed to start server:', err);
    dialog.showErrorBox(
      'EMDMS failed to start',
      `The local server could not start.\n\n${err.stack || err.message || err}`
    );
    app.quit();
    return false;
  }
}

function openBrowser(url) {
  // No longer needed — Electron window displays server info page directly
  console.log('Server started. Electron window will display server info at', url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  win.loadURL('https://localhost:3000/server-info.html');
  win.webContents.openDevTools();
}

// More targeted certificate bypass for localhost (safer than a global ignore)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('https://localhost')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

app.whenReady().then(async () => {
  const ok = await startServer();
  if (!ok) return;
  createWindow();
  openBrowser('https://localhost:3000');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
