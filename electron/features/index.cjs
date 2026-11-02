// Loads every electron/features/<id>.cjs (except this file) and gives each a small context.
const fs = require('fs');
const path = require('path');

function loadFeatures({ app, ipcMain, getWin, send, settings, helper, onHelper, dataDir, setSuppressed = () => {}, setClickThrough = () => {}, isClickThrough = () => true }) {
  const cfgDir = path.join(dataDir, 'features');
  try { fs.mkdirSync(cfgDir, { recursive: true }); } catch {}
  const handlers = new Map(); // `${id}:${action}` -> fn
  // Small per-feature JSON config in %APPDATA%\Island\features\<id>.json (renderer: ctx.getConfig / ctx.setConfig).
  const makeConfig = (id) => {
    const cfgFile = path.join(cfgDir, `${id}.json`);
    return {
      get: () => { try { return JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { return {}; } },
      set: (obj) => { try { fs.writeFileSync(cfgFile, JSON.stringify(obj ?? {}, null, 2)); } catch (e) { console.error(`[feature ${id}] config:`, e.message); } return obj; }
    };
  };
  const stops = [];
  ipcMain.handle('feature:call', async (_e, id, action, arg) => {
    let h = handlers.get(`${id}:${action}`);
    // Renderer-only features (no electron/features/<id>.cjs) still get their config file.
    if (!h && (action === 'config:get' || action === 'config:set') && /^[a-z0-9-]{1,40}$/.test(String(id))) {
      const c = makeConfig(String(id));
      h = action === 'config:get' ? async () => c.get() : async (obj) => c.set(obj);
    }
    if (!h) throw new Error(`no handler ${id}:${action}`);
    return h(arg);
  });
  for (const file of fs.readdirSync(__dirname)) {
    if (!file.endsWith('.cjs') || file === 'index.cjs') continue;
    let mod;
    try { mod = require(path.join(__dirname, file)); } catch (e) { console.error(`[feature ${file}] failed to load:`, e); continue; }
    const id = mod.id || file.replace(/\.cjs$/, '');
    const config = makeConfig(id);
    handlers.set(`${id}:config:get`, async () => config.get());
    handlers.set(`${id}:config:set`, async (obj) => config.set(obj));
    const ctx = {
      id, app, dataDir, config,
      /** Hide the island while `on` (e.g. a fullscreen game); several features can do this at once. */
      suppress: (on) => setSuppressed(id, !!on),
      /** Change the window's click-through state (always use this, never win.setIgnoreMouseEvents directly). */
      setClickThrough: (v) => setClickThrough(v),
      isClickThrough: () => isClickThrough(),
      win: getWin,
      settings: () => settings.value,
      enabled: () => { const f = settings.value.features || {}; return f[id] ?? (mod.defaultEnabled ?? true); },
      send: (data) => send('feature', { id, data }),
      handle: (action, fn) => handlers.set(`${id}:${action}`, fn),
      helper: { send: (cmd) => helper().send(cmd), on: (type, cb) => onHelper(type, cb) },
      log: (...a) => console.log(`[feature ${id}]`, ...a)
    };
    try { const stop = mod.start(ctx); if (typeof stop === 'function') stops.push(stop); }
    catch (e) { console.error(`[feature ${id}] failed to start:`, e); }
  }
  return () => { for (const s of stops) try { s(); } catch {} };
}

module.exports = { loadFeatures };
