const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell, powerMonitor, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const claude = require('./claude-hooks.cjs');
const { Lyrics } = require('./lyrics.cjs');
const { Helper, helperPath } = require('./helper.cjs');
const { Relay, ensureConfig } = require('./relay.cjs');
const { SettingsStore } = require('./settings.cjs');
const { cursorRelative } = require('./cursor.cjs');
const { loadFeatures } = require('./features/index.cjs');

const DEV = !!process.env.ISLAND_DEV;
let demo = process.argv.includes('--demo');
let win, tray, helper, lyrics, relay, settings, relayConfigPath, topTimer, cursorTimer, hidden = false, suppressed = new Set(), stopFeatures, helperListeners = new Map(), lastCursor = '', helperStatus = 'starting', relayStatus = 'starting';
const WIN_W = 700, WIN_H = 400; // room for the expanded island, its curved ears and its shadow

if (!app.requestSingleInstanceLock()) app.quit();

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const config = () => ({ demo, platform: process.platform, helper: helperStatus, claudeConnected: claude.isInstalled(), hookPort: claude.PORT });

const RELAY_LABELS = {
  connected: 'connected', waiting: 'waiting for the chat', offline: 'offline', 'needs-token': 'needs a GitHub token',
  'bad-token': 'token rejected', forbidden: 'no access / rate limited', 'bad-config': 'check relay.json', starting: 'starting'
};

// Open in Notepad directly: shell.openPath defers to the .json file association, which can be broken or point at an app that won't open it.
function openRelaySettings() {
  ensureConfig(relayConfigPath);
  if (process.platform === 'win32') spawn('notepad.exe', [relayConfigPath], { detached: true, stdio: 'ignore' }).unref();
  else shell.openPath(relayConfigPath);
}

// ---- keep the pill above other windows ----
// Windows lets another "topmost" window (or a lock/unlock, or a display change) push ours down the z-order, and a
// non-focusable window never gets a chance to react. So re-assert it regularly.
function assertTop() {
  if (!win || win.isDestroyed() || hidden || suppressed.size) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.showInactive();
    if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  } catch { /* window is closing */ }
}
// Hide / show the whole island (tray item or Ctrl+Alt+I), e.g. to click something it covers.
function setHidden(h) {
  hidden = !!h;
  applyVisibility();
  buildTray();
}
/** Features (e.g. game mode) can keep the island out of the way without touching the user's own Hide switch. */
function setSuppressed(reason, on) {
  if (on) suppressed.add(reason); else suppressed.delete(reason);
  applyVisibility();
}
function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  if (hidden || suppressed.size) { if (win.isVisible()) win.hide(); }
  else { win.showInactive(); assertTop(); }
}
function applyKeepOnTop() {
  clearInterval(topTimer);
  if (settings.value.keepOnTop) topTimer = setInterval(assertTop, 1500);
}

// ---- cursor position for Robo's eyes ----
// The window is click-through, so it can't rely on mouse events. Poll the cursor instead and send window-relative
// coordinates whenever it moves (only changes cross the bridge).
function pollCursor() {
  clearTimeout(cursorTimer);
  if (!settings.value.eyesFollow || !win || win.isDestroyed()) return;
  const rel = cursorRelative(screen.getCursorScreenPoint(), win.getBounds());
  const key = `${rel.x},${rel.y}`;
  if (key !== lastCursor) { lastCursor = key; send('cursor', rel); }
  cursorTimer = setTimeout(pollCursor, 40);
}
function applyCursorPolling() {
  clearTimeout(cursorTimer);
  lastCursor = '';
  if (settings.value.eyesFollow) pollCursor(); else send('cursor', null);
}

function placeWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({ x: Math.round(workArea.x + (workArea.width - WIN_W) / 2), y: workArea.y, width: WIN_W, height: WIN_H });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H, show: false,
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true }); // renderer flips this while the pointer is on the island
  placeWindow();
  if (DEV) win.loadURL('http://localhost:5173'); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (!hidden && !suppressed.size) win.showInactive(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  if (!tray) { tray = new Tray(icon); tray.setToolTip('Island'); }
  const connected = claude.isInstalled();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: connected ? 'Claude Code: connected' : 'Claude Code: not connected', enabled: false },
    connected
      ? { label: 'Disconnect Claude Code', click: () => toggleClaude(false) }
      : { label: 'Connect Claude Code…', click: () => toggleClaude(true) },
    { type: 'separator' },
    { label: `Music helper: ${helperStatus}`, enabled: false },
    { type: 'separator' },
    { label: `Cloud chat relay: ${RELAY_LABELS[relayStatus] || relayStatus}`, enabled: false },
    { label: 'Relay settings…', click: openRelaySettings },
    { label: 'Hide Island (Ctrl+Alt+I)', type: 'checkbox', checked: hidden, click: (i) => setHidden(i.checked) },
    { label: 'Demo mode', type: 'checkbox', checked: demo, click: (i) => { demo = i.checked; send('config', config()); } },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit Island', click: () => app.quit() }
  ]));
}

function toggleClaude(on) {
  try {
    if (on) {
      const response = dialog.showMessageBoxSync({
        type: 'question', buttons: ['Connect', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Connect Claude Code',
        message: 'Add Island hooks to your Claude Code settings?',
        detail: `This edits ${claude.settingsFile()} (a backup is saved next to it). Claude Code sessions started after this will show up in the island.`
      });
      if (response !== 0) return;
      claude.install();
    } else claude.uninstall();
  } catch (e) {
    dialog.showErrorBox('Island', `Could not update Claude Code settings:\n${e.message}`);
  }
  buildTray(); send('config', config());
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.ryn.island');
  lyrics = new Lyrics(path.join(app.getPath('userData'), 'lyrics-cache.json'));
  settings = new SettingsStore(path.join(app.getPath('userData'), 'island-settings.json'));
  createWindow();
  claude.startServer((ev) => send('claude', ev));
  helper = new Helper(helperPath(app), (msg) => {
    for (const cb of helperListeners.get(msg.type) || []) try { cb(msg); } catch (e) { console.error(e); }
    if (msg.type === 'ctrl') send('ctrl', !!msg.down); else if (msg.type === 'media' || msg.type === 'volume') send(msg.type, msg);
  }, (s) => { helperStatus = s; buildTray(); send('config', config()); });
  helper.start();
  relayConfigPath = path.join(app.getPath('userData'), 'relay.json');
  relay = new Relay({ configPath: relayConfigPath, onEvent: (ev) => send('claude', ev), onStatus: (s) => { relayStatus = s; buildTray(); } });
  relay.start();
  buildTray();
  screen.on('display-metrics-changed', placeWindow);
  screen.on('display-added', placeWindow);
  screen.on('display-removed', placeWindow);
  for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => { placeWindow(); assertTop(); });
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, assertTop);
  stopFeatures = loadFeatures({
    app, ipcMain, getWin: () => win, send, settings, helper: () => helper, dataDir: app.getPath('userData'), setSuppressed,
    onHelper: (type, cb) => { if (!helperListeners.has(type)) helperListeners.set(type, []); helperListeners.get(type).push(cb); }
  });
  applyKeepOnTop();
  applyCursorPolling();
  try { globalShortcut.register('Control+Alt+I', () => setHidden(!hidden)); } catch { /* shortcut taken: the tray item still works */ }

  ipcMain.on('ignore-mouse', (_e, ignore) => win.setIgnoreMouseEvents(!!ignore, { forward: true }));
  ipcMain.on('media', (_e, cmd, arg) => {
    if (!['toggle', 'next', 'prev', 'seek'].includes(cmd)) return;
    helper.send(arg === undefined ? cmd : `${cmd} ${Number(arg)}`);
  });
  ipcMain.handle('config', () => config());
  ipcMain.handle('settings:get', () => settings.value);
  ipcMain.handle('settings:set', (_e, patch) => {
    const before = settings.value;
    const v = settings.update(patch);
    if (v.keepOnTop !== before.keepOnTop) applyKeepOnTop();
    if (v.eyesFollow !== before.eyesFollow) applyCursorPolling();
    send('settings', v);
    return v;
  });
  ipcMain.handle('lyrics', (_e, track) => lyrics.get(track));
});

app.on('second-instance', () => { if (win) setHidden(false); });
app.on('before-quit', () => { globalShortcut.unregisterAll(); stopFeatures && stopFeatures(); helper && helper.stop(); relay && relay.stop(); settings && settings.flush(); clearInterval(topTimer); clearTimeout(cursorTimer); });
app.on('window-all-closed', () => app.quit());
