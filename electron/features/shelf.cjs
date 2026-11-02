// Drop zone shelf: park files on the island, drag them out later.
// Persisted as paths only (features/shelf.json); icons are fetched from the shell on demand.
const fs = require('fs');
const path = require('path');
const { dialog, shell, nativeImage, screen } = require('electron');
const { MAX_ITEMS, sanitizeRect, addPaths, pruneMissing, loadPaths, pathKey } = require('./shelf/logic.cjs');
const { createGate } = require('./shelf/gate.cjs');

// 1x1 transparent PNG: startDrag insists on a non-empty icon, so this is the fallback when the shell has none.
const BLANK_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

module.exports = {
  id: 'shelf',
  defaultEnabled: true,
  start(ctx) {
    let paths = loadPaths(ctx.config.get());
    const icons = new Map(); // path -> NativeImage (kept for startDrag)
    const iconUrls = new Map(); // path -> dataURL
    let stopped = false;

    const persist = () => ctx.config.set({ paths });
    const win = () => { const w = ctx.win(); return w && !w.isDestroyed() ? w : null; };

    const gate = createGate({
      getCursor: () => screen.getCursorScreenPoint(),
      getBounds: () => { const w = win(); return w ? w.getContentBounds() : null; },
      setIgnore: (on) => ctx.setClickThrough(!!on),
      isClickThrough: () => ctx.isClickThrough(),
      notify: (what) => { if (what === 'resync' && !stopped) ctx.send({ resync: true }); }
    });

    async function iconFor(p) {
      if (iconUrls.has(p)) return iconUrls.get(p);
      let url = '';
      try {
        const img = await ctx.app.getFileIcon(p, { size: 'large' });
        if (img && !img.isEmpty()) { icons.set(p, img); url = img.toDataURL(); }
      } catch { /* no icon: the renderer draws a generic one */ }
      iconUrls.set(p, url);
      return url;
    }

    async function describe(p) {
      let size = null, dir = false;
      try { const st = fs.statSync(p); dir = st.isDirectory(); size = dir ? null : st.size; } catch { /* vanished */ }
      return { path: p, name: path.basename(p) || p, dir, size, icon: await iconFor(p) };
    }

    async function payload(extra = {}) {
      const items = await Promise.all(paths.map(describe));
      return { items, max: MAX_ITEMS, ...extra };
    }

    function prune() {
      const r = pruneMissing(paths, exists);
      if (r.removed) { paths = r.paths; persist(); }
    }

    const onShelf = (p) => { const k = pathKey(p); return paths.find((x) => pathKey(x) === k) || null; };

    ctx.handle('list', async () => { prune(); return payload(); });

    ctx.handle('add', async (incoming) => {
      const list = Array.isArray(incoming) ? incoming.slice(0, 200) : [];
      const r = addPaths(paths, list, exists);
      if (r.added.length) { paths = r.paths; persist(); }
      return payload({ added: r.added.length, duplicates: r.duplicates, missing: r.missing, full: r.full });
    });

    // The fallback that always works, even when dropping into the click-through window doesn't.
    ctx.handle('pick', async () => {
      const w = win();
      let res;
      try {
        res = await dialog.showOpenDialog(...(w ? [w] : []), { title: 'Add to the Island shelf', properties: ['openFile', 'multiSelections'] });
      } catch (e) { ctx.log('open dialog failed:', e.message); res = { canceled: true, filePaths: [] }; }
      if (!stopped) ctx.send({ resync: true }); // the dialog swallowed mouse events; let the renderer re-assert hover
      const r = addPaths(paths, res.canceled ? [] : res.filePaths, exists);
      if (r.added.length) { paths = r.paths; persist(); }
      return payload({ added: r.added.length, duplicates: r.duplicates, missing: r.missing, full: r.full });
    });

    ctx.handle('remove', async (p) => {
      const hit = typeof p === 'string' ? onShelf(p) : null;
      if (hit) { paths = paths.filter((x) => x !== hit); iconUrls.delete(hit); icons.delete(hit); persist(); }
      return payload();
    });

    ctx.handle('clear', async () => { paths = []; iconUrls.clear(); icons.clear(); persist(); return payload(); });

    ctx.handle('open', async (p) => {
      const hit = typeof p === 'string' ? onShelf(p) : null;
      if (!hit || !exists(hit)) return payload();
      const err = await shell.openPath(hit);
      if (err) ctx.log('open failed:', err);
      return payload();
    });

    ctx.handle('show', async (p) => {
      const hit = typeof p === 'string' ? onShelf(p) : null;
      if (hit && exists(hit)) shell.showItemInFolder(hit);
      return null;
    });

    // Called from the tile's dragstart (default action prevented): hand the real files to the OS drag.
    ctx.handle('startDrag', async (list) => {
      const w = win();
      if (!w) return false;
      const files = (Array.isArray(list) ? list : []).map((p) => (typeof p === 'string' ? onShelf(p) : null)).filter((p) => p && exists(p));
      if (!files.length) return false;
      let icon = icons.get(files[0]);
      if (!icon || icon.isEmpty()) { await iconFor(files[0]); icon = icons.get(files[0]); }
      if (!icon || icon.isEmpty()) icon = nativeImage.createFromDataURL(BLANK_ICON);
      try { w.webContents.startDrag({ files, icon }); return true; }
      catch (e) { ctx.log('startDrag failed:', e.message); return false; }
    });

    // The renderer reports where the island is (window-relative CSS px) and whether Ctrl pass-through is on.
    ctx.handle('rect', async (arg) => { gate.setRect(sanitizeRect(arg && arg.r), arg && arg.passing); return null; });

    // The helper reports the left mouse button. No helper, no events, no drop-into-click-through (the button still works).
    ctx.helper.on('lbutton', (m) => { if (ctx.enabled()) gate.setButton(!!m.down); else gate.setButton(false); });

    return () => { stopped = true; gate.stop(); };
  }
};
