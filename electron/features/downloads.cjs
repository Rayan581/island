// Download done: watches the Downloads folder and tells the island when a download has finished.
// Browsers write "x.crdownload" (or .part etc.) and rename it to "x" at the end; we only report files with a final
// name whose size has stopped changing. Pure rules live in ./downloads/logic.cjs (tested).
const fs = require('fs');
const path = require('path');
const { isTempName, extOf, createTracker, pushRecent } = require('./downloads/logic.cjs');

const DEBOUNCE_MS = 300;   // coalesce bursts of fs events
const POLL_MS = 500;       // re-check unfinished files (only while some are pending)
const STABLE_MS = 1500;    // size/mtime unchanged for this long = done
const RETRY_MS = 15000;    // re-attach the watcher if the folder is missing or the watcher dies
const MAX_RECENT = 8;

module.exports = {
  id: 'downloads',
  defaultEnabled: true,
  /** `dirOverride` is for tests; the app uses the user's Downloads folder. */
  start(ctx, dirOverride) {
    const { shell, nativeImage, app } = require('electron');
    const startedAt = Date.now();
    const tracker = createTracker({ startedAt, stableMs: STABLE_MS });
    let recent = [];
    let dir = null, watcher = null;
    let dirty = new Set(); let fullScan = false;
    let debounceT = null, pollT = null, retryT = null, stopped = false;

    try { dir = dirOverride || app.getPath('downloads'); } catch (e) { ctx.log('no downloads folder:', e.message); return; }

    const statOf = (p) => {
      try { const s = fs.statSync(p); return { isFile: s.isFile(), size: s.size, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs }; }
      catch { return null; }
    };

    async function iconOf(p) {
      try { const img = await app.getFileIcon(p, { size: 'normal' }); return img.isEmpty() ? null : img.toDataURL(); }
      catch { return null; }
    }

    async function report(entry) {
      if (stopped) return;
      const item = {
        name: path.basename(entry.path), path: entry.path, size: entry.size, ext: extOf(entry.path),
        at: Date.now(), icon: await iconOf(entry.path)
      };
      if (stopped || !fs.existsSync(entry.path)) return; // removed while we fetched the icon
      recent = pushRecent(recent, item, MAX_RECENT);
      if (ctx.enabled()) ctx.send(item);
    }

    function schedulePoll() {
      if (pollT || stopped || !tracker.pendingPaths().length) return;
      pollT = setTimeout(() => { pollT = null; scan(false); }, POLL_MS);
    }

    function scan(fromEvent) {
      if (stopped) return;
      try {
        const now = Date.now();
        let names;
        if (fromEvent && fullScan) { // the watcher gave no file name: look at everything
          names = [];
          try { for (const n of fs.readdirSync(dir)) if (!isTempName(n)) names.push(n); } catch {}
        } else names = fromEvent ? [...dirty] : [];
        if (fromEvent) { dirty = new Set(); fullScan = false; }
        for (const n of names) { const p = path.join(dir, n); tracker.observe(p, statOf(p), now); }
        // Re-stat files that are still settling (no fs event arrives while a file is merely idle).
        for (const p of tracker.pendingPaths()) tracker.observe(p, statOf(p), now);
        for (const entry of tracker.ready(now)) report(entry).catch((e) => ctx.log('report failed:', e.message));
      } catch (e) { ctx.log('scan failed:', e.message); }
      schedulePoll();
    }

    function onEvent(_type, filename) {
      if (stopped) return;
      if (filename) {
        const n = String(filename);
        if (isTempName(n)) tracker.forget(path.join(dir, n)); else dirty.add(n);
      } else fullScan = true;
      if (!dirty.size && !fullScan) return;
      clearTimeout(debounceT);
      debounceT = setTimeout(() => { debounceT = null; scan(true); }, DEBOUNCE_MS);
    }

    function attach() {
      if (stopped) return;
      try {
        watcher = fs.watch(dir, { persistent: false }, onEvent);
        watcher.on('error', (e) => { ctx.log('watcher error:', e.message); detach(); scheduleRetry(); });
      } catch (e) { ctx.log('cannot watch downloads:', e.message); watcher = null; scheduleRetry(); }
    }
    function detach() { try { watcher && watcher.close(); } catch {} watcher = null; }
    function scheduleRetry() { if (!stopped && !retryT) retryT = setTimeout(() => { retryT = null; attach(); }, RETRY_MS); }

    // Handlers only act on paths this feature reported, so the renderer can't ask for arbitrary files.
    const known = (p) => recent.find((x) => x.path === p);
    const gone = (p) => { recent = recent.filter((x) => x.path !== p); return { ok: false, error: 'missing' }; };
    const fallbackIcon = () => nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 160), { width: 16, height: 16 });

    ctx.handle('list', async () => recent);
    ctx.handle('open', async (p) => {
      if (!known(p)) return { ok: false, error: 'unknown' };
      if (!fs.existsSync(p)) return gone(p);
      const err = await shell.openPath(p);
      return err ? { ok: false, error: 'open-failed' } : { ok: true };
    });
    ctx.handle('showInFolder', async (p) => {
      if (!known(p)) return { ok: false, error: 'unknown' };
      if (!fs.existsSync(p)) return gone(p);
      shell.showItemInFolder(p); return { ok: true };
    });
    ctx.handle('startDrag', async (p) => {
      const win = ctx.win();
      if (!known(p) || !win || win.isDestroyed() || !fs.existsSync(p)) return { ok: false };
      let icon = null;
      try { const img = await app.getFileIcon(p, { size: 'normal' }); if (!img.isEmpty()) icon = img; } catch {}
      try { win.webContents.startDrag({ file: p, icon: icon || fallbackIcon() }); return { ok: true }; }
      catch (e) { ctx.log('drag failed:', e.message); return { ok: false }; }
    });

    attach();
    return () => {
      stopped = true;
      clearTimeout(debounceT); clearTimeout(pollT); clearTimeout(retryT);
      detach(); tracker.clear(); dirty.clear();
    };
  }
};
