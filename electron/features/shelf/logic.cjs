// Pure logic for the shelf feature (no Electron): hit-testing the island rect and the add / dedupe / persist rules.
const MAX_ITEMS = 24;

/** Keeps a renderer-reported rect only if it is four finite numbers with a positive size; otherwise null. */
function sanitizeRect(r) {
  if (!r || typeof r !== 'object') return null;
  const x = Number(r.x), y = Number(r.y), w = Number(r.w), h = Number(r.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || w > 5000 || h > 5000) return null;
  return { x, y, w, h };
}

/** Is the point (window-relative CSS px) inside the rect grown by `margin` on every side? */
function inRect(pt, r, margin = 0) {
  if (!pt || !r) return false;
  return pt.x >= r.x - margin && pt.x <= r.x + r.w + margin && pt.y >= r.y - margin && pt.y <= r.y + r.h + margin;
}

/** Screen point -> window-relative point. */
function toWindow(screenPt, bounds) {
  return { x: screenPt.x - bounds.x, y: screenPt.y - bounds.y };
}

/** Case-insensitive on Windows (paths are), exact elsewhere; trailing separators ignored. */
function pathKey(p, platform = process.platform) {
  let k = String(p || '').replace(/[\\/]+$/, '');
  if (platform === 'win32') k = k.replace(/\//g, '\\').toLowerCase();
  return k;
}

/**
 * Adds paths to the shelf. `existing` is the current list of paths, `exists(p)` says whether a path is on disk.
 * Returns { paths, added, duplicates, missing, full }. New items go to the end; once the shelf holds `max`, extra
 * items are refused (never silently dropping something the user parked earlier).
 */
function addPaths(existing, incoming, exists, { max = MAX_ITEMS, platform = process.platform } = {}) {
  const paths = existing.slice();
  const seen = new Set(paths.map((p) => pathKey(p, platform)));
  const res = { paths, added: [], duplicates: 0, missing: 0, full: 0 };
  for (const raw of incoming || []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const k = pathKey(raw, platform);
    if (seen.has(k)) { res.duplicates++; continue; }
    let ok = false;
    try { ok = !!exists(raw); } catch { ok = false; }
    if (!ok) { res.missing++; continue; }
    if (paths.length >= max) { res.full++; continue; }
    seen.add(k); paths.push(raw); res.added.push(raw);
  }
  return res;
}

/** Drops paths that no longer exist. Returns { paths, removed }. */
function pruneMissing(paths, exists) {
  const kept = [];
  for (const p of paths) { let ok = false; try { ok = !!exists(p); } catch { ok = false; } if (ok) kept.push(p); }
  return { paths: kept, removed: paths.length - kept.length };
}

/** Reads the persisted config defensively: only strings, deduped, capped. */
function loadPaths(cfg, platform = process.platform) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(cfg && cfg.paths) ? cfg.paths : []) {
    if (typeof p !== 'string' || !p) continue;
    const k = pathKey(p, platform);
    if (seen.has(k)) continue;
    seen.add(k); out.push(p);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

module.exports = { MAX_ITEMS, sanitizeRect, inRect, toWindow, pathKey, addPaths, pruneMissing, loadPaths };
