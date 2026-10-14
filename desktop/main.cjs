/**
 * The desktop shell: one window showing the game (the Vite build, copied into
 * ./app by `npm run build:desktop` at the repo root). Saves, settings and the
 * error log live in the game's own storage, which Electron keeps in the
 * user-data folder.
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// One copy of the game at a time (a second launch brings the first forward).
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function log(line) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // nowhere to write: nothing to do
  }
}

function create() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Underfoot',
    backgroundColor: '#0b0806',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      // The colony keeps living when the window is behind another (the game pauses itself only if asked).
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Links open in the player's browser; the window never navigates away from the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
  });
  // If the page itself dies, note it and bring it back (the colony was autosaved).
  win.webContents.on('render-process-gone', (_e, d) => {
    log(`renderer gone: ${d.reason} (${d.exitCode})`);
    if (d.reason !== 'clean-exit') win.reload();
  });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') log(`console: ${e.message}`);
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
