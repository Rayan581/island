const { contextBridge, ipcRenderer } = require('electron');

// The callback's return value is dropped on purpose: returning it would send it back across the context bridge, and anything that can't be cloned throws.
const on = (ch) => (cb) => { const f = (_e, d) => { cb(d); }; ipcRenderer.on(ch, f); return () => ipcRenderer.off(ch, f); };

contextBridge.exposeInMainWorld('island', {
  ignoreMouse: (v) => ipcRenderer.send('ignore-mouse', v),
  media: (cmd, arg) => ipcRenderer.send('media', cmd, arg),
  config: () => ipcRenderer.invoke('config'),
  lyrics: (track) => ipcRenderer.invoke('lyrics', track),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: on('settings'),
  onCursor: on('cursor'),
  onCtrl: on('ctrl'),
  onConfig: on('config'),
  onClaude: on('claude'),
  onMedia: on('media'),
  onVolume: on('volume')
});
