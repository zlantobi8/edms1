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
  setTimeout(() => {
    try {
      console.log('Opening browser to', url);
      shell.openExternal(url);
    } catch (err) {
      console.error('Failed to open browser:', err);
    }
  }, 5000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 700,
    height: 260,
    resizable: false,
    webPreferences: { nodeIntegration: false }
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>EMDMS</title></head><body style="font-family:Arial,Helvetica,sans-serif;margin:20px"><h2>EMDMS — Starting server</h2><p>The server will start and your browser will open to <strong>https://localhost:3000</strong>.</p><p>If the browser does not open automatically, open <strong>https://localhost:3000</strong> or the Network address shown in the terminal.</p></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

app.whenReady().then(() => {
  startServer();
  openBrowser('https://localhost:3000');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
