// Clipboard peek + screenshot catch.
//
// What this relies on from Electron (checked in Electron 38 with `clipboard`):
//  - clipboard.availableFormats() reports only standard MIME types ('text/plain', 'text/html', 'image/png'), never
//    the Windows-private formats, so it is used to see what kind of content is there (text vs image).
//  - clipboard.has(name) / clipboard.readBuffer(name) accept arbitrary format names. On Windows they go through
//    RegisterClipboardFormat, which is how password managers' "don't record me" flags are detected:
//      ExcludeClipboardContentFromMonitorProcessing  (presence = skip; set by 1Password, Bitwarden, KeePass, ...)
//      CanIncludeInClipboardHistory                  (DWORD 0 = skip)
//      CanUploadToCloudClipboard                     (DWORD 0 = skip)
//      Clipboard Viewer Ignore                       (older convention, presence = skip)
//  - A Windows bitmap copy shows up as 'image/png'; readImage().getSize() / resize({width:32}).toBitmap() give the
//    cheap fingerprint. Nothing here can see key presses, so screenshots are recognised by (a) a new PNG in
//    Pictures\Screenshots, or (b) an image whose size equals a whole display.
// The pure helpers are exported for tests/clipboard.test.cjs; Electron is only required inside start().
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const POLL_MS = 400;
const TEXT_SEND = 2000;            // characters sent to the renderer
const TEXT_KEEP = 200000;          // characters kept in memory here, so a re-copy is not truncated
const KEEP_IMAGES = 10;
const KEEP_TEXTS = 20;
const MAX_PIXELS = 64e6;           // ignore absurd images instead of stalling the main process
const SCREENSHOT_MERGE_MS = 5000;  // a clipboard image and a Screenshots file this close (same size) are one screenshot
const FLAG_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore'];
const DWORD_FLAGS = ['CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard'];

// ---------- pure helpers ----------

/** First non-empty line (trimmed, whitespace collapsed, capped), the total length, and the part we send on. */
function summarize(text, max = TEXT_SEND) {
  const s = String(text ?? '');
  const sent = s.length > max ? s.slice(0, max) : s;
  let line = '';
  for (const l of sent.split(/\r\n|\r|\n/)) { const t = l.replace(/\s+/g, ' ').trim(); if (t) { line = t; break; } }
  if (line.length > 200) line = line.slice(0, 200);
  return { text: sent, chars: s.length, line, truncated: s.length > max };
}

/** True when a password manager (or any app) asked not to be recorded. `has(name)` / `readBuffer(name)` are clipboard's. */
function isExcluded(has, readBuffer) {
  try { for (const f of FLAG_FORMATS) if (has(f)) return true; } catch { /* unknown format: not excluded */ }
  try {
    for (const f of DWORD_FLAGS) {
      if (!has(f)) continue;
      const b = readBuffer(f);
      if (b && b.length >= 4 && b.readUInt32LE(0) === 0) return true;
    }
  } catch { /* ignore */ }
  return false;
}

const textKey = (text) => `t:${text.length}:${crypto.createHash('md5').update(text).digest('hex')}`;
/** Fingerprint of an image from its size and a tiny downscaled bitmap, so a 4K screenshot is never hashed whole. */
const imageKey = (w, h, smallBitmap) => `i:${w}x${h}:${crypto.createHash('md5').update(smallBitmap).digest('hex')}`;

/** Remembers the last clipboard fingerprint. `update` says whether it changed; `set` adopts one silently (our own writes). */
class ChangeTracker {
  constructor() { this.last = null; }
  update(key) { if (key == null || key === this.last) return false; this.last = key; return true; }
  set(key) { this.last = key; }
}

/** Names of our saved PNGs to delete so only `keep` newest remain (names are `<timestamp>[-n].png`). */
function pruneList(names, keep = KEEP_IMAGES) {
  const mine = names.filter((n) => /^\d{10,}(-\d+)?\.png$/.test(n)).sort().reverse();
  return mine.slice(keep);
}

/** Does this file name in Pictures\Screenshots look like a finished screenshot (not a temp/partial)? */
function isScreenshotFile(name) {
  if (!name || name.startsWith('.') || name.startsWith('~')) return false;
  return /\.(png|jpe?g)$/i.test(name);
}

/** Is w×h exactly one of the displays (physical pixels)? That is a full-screen capture (PrtScn). */
function matchesDisplay(w, h, displays) {
  return displays.some((d) => {
    const sf = d.scaleFactor || 1, dw = Math.round(d.size.width * sf), dh = Math.round(d.size.height * sf);
    return (w === dw && h === dh) || (w === d.size.width && h === d.size.height);
  });
}

/** Thumbnail size: at most maxH tall and maxW wide, never upscaled. */
function fitThumb(w, h, maxH = 96, maxW = 240) {
  if (!w || !h) return { width: 1, height: 1 };
  const k = Math.min(1, maxH / h, maxW / w);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// ---------- feature ----------

function start(ctx) {
  const { clipboard, nativeImage, shell, screen, app } = require('electron');
  const imgDir = path.join(ctx.dataDir, 'clipboard');
  const startedAt = Date.now();
  const tracker = new ChangeTracker();
  const fullTexts = new Map();       // id -> full text (memory only, last KEEP_TEXTS)
  const allowedFiles = new Map();    // resolved path -> small NativeImage (drag icon); bounded
  const seenShots = new Set();       // "path|mtime" of Screenshots files already reported
  let seq = 0, stopped = false, timer = null, retryTimer = null, watcher = null, wasEnabled = false;
  let nextImageCheck = 0, imageCost = 0, lastImage = null; // lastImage: { id, at, w, h, file, screenshot }
  const shotTimers = new Map();

  try { fs.mkdirSync(imgDir, { recursive: true }); } catch (e) { ctx.log('cannot create image dir:', e.message); }

  const newId = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;
  const keepHistory = () => { try { return ctx.config.get().keepHistory !== false; } catch { return true; } };
  const remember = (file, nimg) => {
    allowedFiles.set(path.resolve(file), nimg);
    if (allowedFiles.size > 80) allowedFiles.delete(allowedFiles.keys().next().value);
  };
  const thumbOf = (nimg, w, h) => {
    const t = fitThumb(w, h);
    const small = nimg.resize({ width: t.width, height: t.height, quality: 'good' });
    return { small, dataUrl: `data:image/jpeg;base64,${small.toJPEG(72).toString('base64')}` };
  };
  const send = (data) => { try { if (!stopped && ctx.enabled()) ctx.send(data); } catch (e) { ctx.log('send failed:', e.message); } };

  /** Read what is on the clipboard now into { key, kind, ... } without side effects, or null if nothing usable. */
  function sample() {
    const formats = clipboard.availableFormats();
    if (!formats.length) return null;
    if (isExcluded((f) => clipboard.has(f), (f) => clipboard.readBuffer(f))) return { key: 'excluded', kind: 'excluded' };
    const text = formats.includes('text/plain') ? clipboard.readText() : '';
    if (text && text.trim()) return { key: textKey(text), kind: 'text', text };
    if (formats.some((f) => f.startsWith('image/'))) {
      if (Date.now() < nextImageCheck) return { key: tracker.last, kind: 'skip' }; // adaptive back-off for huge images
      const t0 = Date.now();
      const img = clipboard.readImage();
      if (img.isEmpty()) return null;
      const { width: w, height: h } = img.getSize();
      if (!w || !h) return null;
      const small = img.resize({ width: 32, quality: 'good' });
      const key = imageKey(w, h, small.toBitmap());
      imageCost = Date.now() - t0;
      nextImageCheck = imageCost > 60 ? Date.now() + Math.min(2500, imageCost * 12) : 0;
      return { key, kind: 'image', img, w, h };
    }
    return null;
  }

  function emitText(s) {
    const id = newId();
    const sm = summarize(s.text);
    if (keepHistory()) {
      fullTexts.set(id, s.text.length > TEXT_KEEP ? s.text.slice(0, TEXT_KEEP) : s.text);
      while (fullTexts.size > KEEP_TEXTS) fullTexts.delete(fullTexts.keys().next().value);
    }
    send({ kind: 'text', id, text: sm.text, line: sm.line, chars: sm.chars, truncated: sm.truncated, at: Date.now() });
  }

  function emitImage(s) {
    if (s.w * s.h > MAX_PIXELS) { ctx.log('image too large, ignored'); return; }
    const at = Date.now();
    // A Screenshots file for this very capture already announced it: nothing new to say.
    if (lastImage && lastImage.fromFile && lastImage.w === s.w && lastImage.h === s.h && at - lastImage.at < SCREENSHOT_MERGE_MS) return;
    const id = newId();
    const file = path.join(imgDir, `${at}-${seq}.png`);
    let png;
    try { png = s.img.toPNG(); } catch (e) { ctx.log('toPNG failed:', e.message); return; }
    const { small, dataUrl } = thumbOf(s.img, s.w, s.h);
    const screenshot = matchesDisplay(s.w, s.h, screen.getAllDisplays());
    lastImage = { id, at, w: s.w, h: s.h, file, screenshot, fromFile: false };
    remember(file, small);
    fs.promises.writeFile(file, png).then(() => pruneOld()).catch((e) => ctx.log('save failed:', e.message));
    send({ kind: 'image', id, file, thumb: dataUrl, w: s.w, h: s.h, at, ...(screenshot ? { screenshot: true } : {}) });
  }

  function pruneOld() {
    fs.promises.readdir(imgDir).then((names) => {
      for (const n of pruneList(names)) fs.promises.unlink(path.join(imgDir, n)).catch(() => {});
    }).catch(() => {});
  }

  function poll() {
    timer = null;
    if (stopped) return;
    try {
      const on = ctx.enabled();
      const s = sample();
      if (!on || !wasEnabled) {
        // Disabled (or just re-enabled): adopt whatever is there as the baseline, say nothing.
        if (s && s.kind !== 'skip') tracker.set(s.key);
      } else if (s && s.kind !== 'skip' && tracker.update(s.key)) {
        if (s.kind === 'text') emitText(s);
        else if (s.kind === 'image') emitImage(s);
        // 'excluded': remembered as changed, never read or sent
      }
      wasEnabled = on;
    } catch (e) {
      ctx.log('poll failed:', e.message);
    }
    timer = setTimeout(poll, POLL_MS);
  }

  // ----- Screenshots folder (Windows 11 Snipping Tool / Win+PrtScn auto-save) -----
  function shotDir() {
    try { return path.join(app.getPath('pictures'), 'Screenshots'); } catch { return path.join(require('os').homedir(), 'Pictures', 'Screenshots'); }
  }

  function onShotFile(dir, name) {
    if (stopped || !ctx.enabled() || !isScreenshotFile(name)) return;
    clearTimeout(shotTimers.get(name));
    shotTimers.set(name, setTimeout(() => {
      shotTimers.delete(name);
      const file = path.join(dir, name);
      let st;
      try { st = fs.statSync(file); } catch { return; }
      if (!st.isFile() || st.size === 0 || st.mtimeMs < startedAt - 1000) return;
      // Stable for a moment (the tool may still be writing)?
      setTimeout(() => {
        try {
          const st2 = fs.statSync(file);
          if (st2.size !== st.size) return onShotFile(dir, name);
          const k = `${file}|${st2.mtimeMs}`;
          if (seenShots.has(k)) return;
          seenShots.add(k);
          if (seenShots.size > 60) seenShots.delete(seenShots.values().next().value);
          reportShotFile(file);
        } catch { /* gone again */ }
      }, 250);
    }, 250));
  }

  function reportShotFile(file) {
    if (stopped || !ctx.enabled()) return;
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return;
    const { width: w, height: h } = img.getSize();
    if (!w || !h || w * h > MAX_PIXELS) return;
    const at = Date.now();
    const { small, dataUrl } = thumbOf(img, w, h);
    remember(file, small);
    // Same capture as an image we just reported from the clipboard? Update that item instead of adding another.
    const merge = lastImage && !lastImage.fromFile && lastImage.w === w && lastImage.h === h && at - lastImage.at < SCREENSHOT_MERGE_MS;
    const id = merge ? lastImage.id : newId();
    lastImage = { id, at, w, h, file, screenshot: true, fromFile: true };
    send({ kind: 'image', id, file, thumb: dataUrl, w, h, at, screenshot: true, ...(merge ? { replaces: id } : {}) });
  }

  function watchShots() {
    if (stopped || watcher) return;
    const dir = shotDir();
    if (!fs.existsSync(dir)) { retryTimer = setTimeout(watchShots, 30000); return; } // the folder appears with the first screenshot
    try {
      watcher = fs.watch(dir, { persistent: false }, (_ev, name) => { if (name) onShotFile(dir, String(name)); });
      watcher.on('error', (e) => { ctx.log('screenshots watcher error:', e.message); try { watcher.close(); } catch {} watcher = null; retryTimer = setTimeout(watchShots, 30000); });
    } catch (e) {
      ctx.log('cannot watch screenshots folder:', e.message);
      watcher = null;
      retryTimer = setTimeout(watchShots, 30000);
    }
  }

  // ----- handlers -----
  const allowed = (file) => typeof file === 'string' && allowedFiles.has(path.resolve(file));
  const adopt = () => { try { const s = sample(); if (s && s.kind !== 'skip') tracker.set(s.key); } catch {} };

  ctx.handle('copyText', async (arg) => {
    const id = arg && typeof arg === 'object' ? arg.id : null;
    const text = (id && fullTexts.get(id)) ?? (typeof arg === 'string' ? arg : arg && typeof arg.text === 'string' ? arg.text : '');
    if (!text) return false;
    clipboard.writeText(text);
    adopt(); // our own write must not come back as a "new" copy
    return true;
  });
  ctx.handle('copyImage', async (file) => {
    if (!allowed(file)) return false;
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    nextImageCheck = 0;
    adopt();
    return true;
  });
  ctx.handle('showInFolder', async (file) => { if (!allowed(file)) return false; shell.showItemInFolder(path.resolve(file)); return true; });
  ctx.handle('startDrag', async (file) => {
    if (!allowed(file) || !fs.existsSync(file)) return false;
    const win = ctx.win();
    if (!win || win.isDestroyed()) return false;
    let icon = allowedFiles.get(path.resolve(file));
    if (!icon || icon.isEmpty()) { icon = nativeImage.createFromPath(file).resize({ height: 64 }); }
    win.webContents.startDrag({ file: path.resolve(file), icon });
    return true;
  });

  pruneOld();
  adopt();           // existing clipboard content is the baseline, not news
  wasEnabled = ctx.enabled();
  timer = setTimeout(poll, POLL_MS);
  if (process.platform === 'win32') watchShots();

  return () => {
    stopped = true;
    clearTimeout(timer); clearTimeout(retryTimer);
    for (const t of shotTimers.values()) clearTimeout(t);
    shotTimers.clear();
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    fullTexts.clear(); allowedFiles.clear();
  };
}

module.exports = {
  id: 'clipboard', defaultEnabled: true, start,
  summarize, isExcluded, textKey, imageKey, ChangeTracker, pruneList, isScreenshotFile, matchesDisplay, fitThumb
};
