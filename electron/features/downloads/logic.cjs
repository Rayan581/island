// Pure logic for the "Download done" feature: which files are temp/partial downloads, and when is a file "done".
// No Electron or fs access in here, so it can be unit-tested (tests/downloads.test.cjs).

// Partial-download markers: Chrome/Edge .crdownload, Firefox .part, Opera .opdownload, Safari-style .download, generic .tmp/.partial.
const TEMP_EXT = new Set(['crdownload', 'part', 'partial', 'tmp', 'temp', 'download', 'opdownload']);

/** True for names that are never a finished download: partial files, Office lock files, dotfiles, desktop.ini. */
function isTempName(name) {
  if (typeof name !== 'string' || !name) return true;
  const base = name.split(/[\\/]/).pop();
  if (!base || base.startsWith('.') || base.startsWith('~$')) return true;
  if (base.toLowerCase() === 'desktop.ini' || base.toLowerCase() === 'thumbs.db') return true;
  const dot = base.lastIndexOf('.');
  if (dot > 0 && TEMP_EXT.has(base.slice(dot + 1).toLowerCase())) return true;
  return false;
}

/** Lower-case extension without the dot ("" when none). */
function extOf(name) {
  const base = String(name || '').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

/** A file is stable once it has had a non-zero size that did not change (size or mtime) for `stableMs`. */
function isStable(entry, now, stableMs = 1500) {
  return !!entry && entry.size > 0 && now - entry.changedAt >= stableMs;
}

/**
 * Tracks candidate files between scans. Feed it `observe(path, stat, now)` for every file an fs event or poll touched
 * (stat = { isFile, size, mtimeMs, birthtimeMs } or null if the file is gone) and call `ready(now)` to collect the
 * ones that just finished. Each (path, size, mtime) is reported once.
 */
function createTracker({ startedAt, stableMs = 1500, giveUpMs = 30000, maxReported = 500 } = {}) {
  const pending = new Map();   // path -> { size, mtimeMs, changedAt }
  const reported = new Set();  // `${path}|${size}|${mtimeMs}`
  const keyOf = (p, e) => `${p}|${e.size}|${Math.round(e.mtimeMs)}`;

  return {
    observe(path, stat, now) {
      if (!stat || !stat.isFile || isTempName(path)) { pending.delete(path); return; }
      // Only things created/modified after Island started (a moved-in old file keeps its mtime but gets a new birthtime).
      if (Math.max(stat.mtimeMs || 0, stat.birthtimeMs || 0) < startedAt) { pending.delete(path); return; }
      const prev = pending.get(path);
      if (!prev || prev.size !== stat.size || Math.round(prev.mtimeMs) !== Math.round(stat.mtimeMs)) {
        pending.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, changedAt: now });
      }
    },
    /** Entries that have become stable and were not reported before. They leave the pending set. */
    ready(now) {
      const out = [];
      for (const [path, e] of [...pending]) {
        if (isStable(e, now, stableMs)) {
          pending.delete(path);
          const k = keyOf(path, e);
          if (reported.has(k)) continue;
          reported.add(k);
          if (reported.size > maxReported) reported.delete(reported.values().next().value);
          out.push({ path, size: e.size, mtimeMs: e.mtimeMs });
        } else if (e.size === 0 && now - e.changedAt > giveUpMs) {
          pending.delete(path); // an empty file that never got any data: not a download
        }
      }
      return out;
    },
    /** Paths still waiting to become stable (so the caller knows whether to keep a follow-up timer running). */
    pendingPaths() { return [...pending.keys()]; },
    forget(path) { pending.delete(path); },
    clear() { pending.clear(); reported.clear(); }
  };
}

/** Newest first, no duplicate paths, at most `max`. */
function pushRecent(list, item, max = 8) {
  return [item, ...list.filter((x) => x.path !== item.path)].slice(0, max);
}

module.exports = { TEMP_EXT, isTempName, extOf, isStable, createTracker, pushRecent };
