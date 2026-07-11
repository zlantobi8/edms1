const { app, shell, BrowserWindow } = require('electron');
const path = require('path');

function startServer() {
  try {
    console.log('Starting Express server...');
    const serverPath = path.join(__dirname, 'server.js');
    require(serverPath);
    console.log('Express server loaded.');
  } catch (err) {
    console.error('Failed to start server:', err);
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
    webPreferences: { nodeIntegration: false }
  });

  win.loadURL('https://localhost:3000/server-info.html');
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  openBrowser('https://localhost:3000');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
