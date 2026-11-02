const { contextBridge, ipcRenderer, webUtils } = require('electron');

// The callback's return value is dropped on purpose: returning it would send it back across the context bridge, and anything that can't be cloned throws.
const on = (ch) => (cb) => { const f = (_e, d) => { cb(d); }; ipcRenderer.on(ch, f); return () => ipcRenderer.off(ch, f); };

contextBridge.exposeInMainWorld('island', {
  ignoreMouse: (v, force) => ipcRenderer.send('ignore-mouse', v, !!force),
  media: (cmd, arg) => ipcRenderer.send('media', cmd, arg),
  config: () => ipcRenderer.invoke('config'),
  lyrics: (track) => ipcRenderer.invoke('lyrics', track),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: on('settings'),
  onCursor: on('cursor'),
  onCtrl: on('ctrl'),
  onFeature: on('feature'),
  onResync: on('resync'),
  /** Real path of a File from a drop event (File.path no longer exists in Electron 32+). */
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  featureCall: (id, action, arg) => ipcRenderer.invoke('feature:call', id, action, arg),
  onConfig: on('config'),
  onClaude: on('claude'),
  onMedia: on('media'),
  onVolume: on('volume')
});
