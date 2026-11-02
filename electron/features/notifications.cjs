// Notification mirror: reads Windows' own notification database (wpndatabase.db) and forwards new toasts to the island.
//
// Schema (verified against plaso's windows_push_notification plugin and Velociraptor's NotificationsDatabase artifact):
//   Notification        ([Order] INTEGER PRIMARY KEY, [Id] INTEGER NOT NULL UNIQUE ON CONFLICT REPLACE, [HandlerId] INTEGER,
//                        [Type] TEXT, [Payload] BLOB (toast XML), [PayloadType] TEXT, [ArrivalTime] INT64 (FILETIME), ...)
//   NotificationHandler ([RecordId] INTEGER PRIMARY KEY, [PrimaryId] TEXT NOT NULL COLLATE NOCASE = app id, ...)
// The database is in WAL mode and held open by Windows, so each poll works on a temporary copy that is deleted again
// straight away. Notification content stays in memory: it is never logged and never written anywhere by this file.
const fs = require('fs');
const os = require('os');
const path = require('path');

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const MAX_PER_POLL = 10;
const TMP_PREFIX = 'island-wpn-';

// ---------------------------------------------------------------- pure helpers (unit tested)

const FILETIME_EPOCH_MS = 11644473600000n; // 1601-01-01 -> 1970-01-01
/** FILETIME (100 ns ticks since 1601, number or BigInt) -> epoch ms. Returns `fallback` for missing/absurd values. */
function filetimeToMs(v, fallback = Date.now()) {
  try {
    const t = typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)));
    if (t <= 0n) return fallback;
    const ms = Number(t / 10000n - FILETIME_EPOCH_MS);
    return Number.isFinite(ms) && ms > 0 ? ms : fallback;
  } catch { return fallback; }
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    }
    const r = ENTITIES[e.toLowerCase()];
    return r === undefined ? m : r;
  });
}

/** The Payload BLOB is XML, normally UTF-8 (sometimes UTF-16). Always returns a string. */
function payloadToString(p) {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  const b = Buffer.from(p.buffer ? p.buffer : p, p.byteOffset || 0, p.byteLength ?? p.length);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 2 && b[0] !== 0 && b[1] === 0) return b.toString('utf16le');
  return b.toString('utf8');
}

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;
const clean = (s) => s.replace(UNSAFE_CHARS, '').replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Pulls the readable text out of a toast's XML: `<text>` elements inside the ToastGeneric binding. The first is the
 * title, the rest are the body. `placement="attribution"` text ("via Chrome", a site) is returned separately.
 * Images, actions, audio and attributes are ignored. A regex scan is enough here and avoids any dependency.
 */
function parseToast(xml) {
  const out = { title: '', body: '', attribution: '' };
  if (typeof xml !== 'string' || !xml) return out;
  const s = xml.replace(/<!--[\s\S]*?-->/g, '');
  const visual = (s.match(/<visual\b[\s\S]*?<\/visual\s*>/i) || [s])[0];
  const bindings = [...visual.matchAll(/<binding\b([^>]*?)(?:\/>|>([\s\S]*?)<\/binding\s*>)/gi)];
  const binding = bindings.find((b) => /ToastGeneric/i.test(b[1])) || bindings[0];
  const scope = binding ? binding[2] || '' : visual;
  const texts = [];
  for (const m of scope.matchAll(/<text\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text\s*>)/gi)) {
    let t = m[2] || '';
    t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_x, c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    t = clean(decodeEntities(t.replace(/<[^>]*>/g, '')));
    if (!t) continue;
    if (/placement\s*=\s*["']attribution["']/i.test(m[1])) out.attribution = clip(t, 80);
    else texts.push(t);
  }
  out.title = clip(texts[0] || '', 120);
  out.body = clip(texts.slice(1).join('\n'), 400);
  return out;
}

// Known apps. `def` = shown by default. Order matters (first regex that matches the app id wins).
const KNOWN = [
  { key: 'whatsapp', name: 'WhatsApp', color: '#25d366', re: /whatsapp/i, def: true },
  { key: 'discord', name: 'Discord', color: '#5865f2', re: /discord/i, def: true },
  { key: 'gmail', name: 'Gmail', color: '#ea4335', re: /gmail|mail\.google/i, def: true },
  { key: 'calendar', name: 'Calendar', color: '#0a84ff', re: /windowslive\.calendar|outlookforwindows.*calendar/i, def: false },
  { key: 'mail', name: 'Mail', color: '#2d8cf0', re: /windowscommunicationsapps|windowslive\.mail|outlookforwindows|outlook/i, def: true },
  { key: 'telegram', name: 'Telegram', color: '#2aabee', re: /telegram/i, def: true },
  { key: 'slack', name: 'Slack', color: '#e01e5a', re: /slack/i, def: true },
  { key: 'teams', name: 'Teams', color: '#6264a7', re: /msteams|microsoft\.teams|teams(\.|_|!|$)/i, def: true },
  { key: 'signal', name: 'Signal', color: '#3a76f0', re: /signal/i, def: false },
  { key: 'messenger', name: 'Messenger', color: '#0a7cff', re: /messenger/i, def: false },
  { key: 'phone', name: 'Phone Link', color: '#0a84ff', re: /yourphone|phonelink/i, def: false },
  { key: 'chrome', name: 'Chrome', color: '#4285f4', re: /(^|[\\.!_])chrome/i, def: false, browser: true },
  { key: 'edge', name: 'Edge', color: '#1fa6a1', re: /msedge|microsoftedge/i, def: false, browser: true },
  { key: 'firefox', name: 'Firefox', color: '#ff7139', re: /firefox/i, def: false, browser: true },
  { key: 'brave', name: 'Brave', color: '#fb542b', re: /brave/i, def: false, browser: true }
];
const DEFAULT_APPS = KNOWN.filter((k) => k.def).map(({ key, name, color }) => ({ key, name, color, def: true }));

function humanize(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/** A readable name from an app id nobody told us about. */
function cleanName(primaryId) {
  let s = String(primaryId || '').trim();
  s = s.split('!')[0];                                   // package family!app
  s = s.replace(/_[a-z0-9]{13}$/i, '');                    // _8wekyb3d8bbwe style publisher hash
  s = s.split(/[\\/]/).filter(Boolean).pop() || s;         // paths: take the file name
  s = s.replace(/\.(exe|lnk)$/i, '');
  const generic = new Set(['com', 'org', 'net', 'io', 'app', 'exe', 'desktop', 'squirrel', 'microsoft', 'windows']);
  const parts = s.split('.').filter(Boolean);
  let pick = parts.length ? parts[parts.length - 1] : s;
  for (let i = parts.length - 1; i >= 0; i--) { if (!generic.has(parts[i].toLowerCase()) && !/^[0-9a-f]{8}$/i.test(parts[i])) { pick = parts[i]; break; } }
  pick = pick.replace(/Desktop$/, '');
  return humanize(pick) || 'App';
}
function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }

/** App id (NotificationHandler.PrimaryId) -> { key, name, color, def, browser }. */
function appInfo(primaryId) {
  const id = String(primaryId || '');
  const k = KNOWN.find((x) => x.re.test(id));
  if (k) return { key: k.key, name: k.name, color: k.color, def: k.def, browser: !!k.browser };
  const name = cleanName(id);
  return { key: 'id:' + id.toLowerCase(), name, color: `hsl(${hashHue(id.toLowerCase())} 55% 48%)`, def: false, browser: false };
}

/** Browsers show the site as attribution: mail.google.com in Chrome/Edge counts as Gmail. */
function resolveApp(primaryId, attribution) {
  const info = appInfo(primaryId);
  if (info.browser && /(^|\.)mail\.google\.com/i.test(attribution || '')) {
    const g = KNOWN.find((x) => x.key === 'gmail');
    return { key: g.key, name: g.name, color: g.color, def: g.def, browser: false };
  }
  return info;
}

/** Whether to show a notification from this app. `cfg.apps` can be keyed by the app id (lower case) or by `info.key`. */
function isAllowed(primaryId, info, cfg) {
  const apps = (cfg && cfg.apps) || {};
  const byId = apps[String(primaryId || '').toLowerCase()];
  if (typeof byId === 'boolean') return byId;
  const byKey = apps[info.key];
  if (typeof byKey === 'boolean') return byKey;
  return !!info.def;
}

/** Turns a raw row ({ id, at, payload, app }) into what the renderer gets. Never throws. */
function toNotification(row, cfg) {
  try {
    const t = parseToast(payloadToString(row.payload));
    if (!t.title && !t.body) return null;
    const info = resolveApp(row.app, t.attribution);
    return {
      raw: { allowed: isAllowed(row.app, info, cfg), info },
      msg: {
        type: 'notification', id: String(row.id), appKey: info.key, app: info.name, color: info.color,
        initial: ((info.name.match(/[A-Za-z0-9]/) || ['•'])[0]).toUpperCase(),
        title: t.title, body: t.body, at: Math.min(filetimeToMs(row.at), Date.now())
      }
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- the reader

let sqliteMod = null;
/** node:sqlite, loaded lazily with its ExperimentalWarning silenced. null if this runtime doesn't have it. */
function loadSqlite() {
  if (sqliteMod !== null) return sqliteMod || null;
  const orig = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0] && rest[0].type;
    if (type === 'ExperimentalWarning' && /sqlite/i.test(String(w && w.message ? w.message : w))) return;
    return orig.call(process, w, ...rest);
  };
  try { sqliteMod = require('node:sqlite'); } catch { sqliteMod = false; } finally { process.emitWarning = orig; }
  return sqliteMod || null;
}

const NEEDED = {
  Notification: ['Id', 'HandlerId', 'Type', 'Payload', 'ArrivalTime'],
  NotificationHandler: ['RecordId', 'PrimaryId']
};

function sweepStaleTemp(root) {
  try {
    for (const n of fs.readdirSync(root)) {
      if (!n.startsWith(TMP_PREFIX)) continue;
      const p = path.join(root, n);
      try { if (Date.now() - fs.statSync(p).mtimeMs > 60000) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch {}
}

/** Prepared statement that returns INT64 columns as BigInt (FILETIMEs are above 2^53 and would otherwise throw). */
function prepBig(conn, sql) { const st = conn.prepare(sql); st.setReadBigInts(true); return st; }

class WpnReader {
  /** @param {{ dir: string, tmpRoot?: string, log?: Function }} o dir = folder that holds wpndatabase.db */
  constructor({ dir, tmpRoot = os.tmpdir(), log = () => {} }) {
    this.dir = dir; this.tmpRoot = tmpRoot; this.log = log;
    this.status = 'starting';   // starting | ok | missing | unsupported | error
    this.reason = '';
    this.reset();
  }
  /** Forget the baseline: the next successful read only records where we are, it doesn't report anything. */
  reset() { this.baselined = false; this.sig = null; this.lastId = 0n; this.lastAt = 0n; this.seen = new Set(); }
  setStatus(s, reason = '') { this.status = s; this.reason = reason; }

  /** Returns new raw rows ({ id, at, payload, app }), oldest first. Resolves to [] when nothing changed or on failure. */
  async poll() {
    if (this.status === 'unsupported') return [];
    const db = path.join(this.dir, 'wpndatabase.db');
    let st, wal = null;
    try { st = fs.statSync(db); } catch (e) { this.setStatus('missing', e.code || 'stat'); return []; }
    try { wal = fs.statSync(db + '-wal'); } catch {}
    // In WAL mode new rows land in the -wal file first, so its size/mtime must count too, not just the main file's.
    const sig = `${st.mtimeMs}:${st.size}:${wal ? wal.mtimeMs : 0}:${wal ? wal.size : 0}`;
    if (this.baselined && sig === this.sig) return [];
    const sqlite = loadSqlite();
    if (!sqlite) { this.setStatus('unsupported', 'node:sqlite is not available in this runtime'); return []; }

    let tmp = null, conn = null;
    try {
      tmp = fs.mkdtempSync(path.join(this.tmpRoot, TMP_PREFIX));
      for (const suffix of ['', '-wal', '-shm']) {
        try { await fs.promises.copyFile(db + suffix, path.join(tmp, 'wpndatabase.db' + suffix)); }
        catch (e) { if (suffix === '') throw e; /* -wal/-shm may legitimately not exist */ }
      }
      conn = new sqlite.DatabaseSync(path.join(tmp, 'wpndatabase.db'), { readOnly: true });
      const bad = this.schemaProblem(conn);
      if (bad) { this.setStatus('unsupported', bad); this.log('disabled:', bad); return []; }

      if (!this.baselined) {
        const r = prepBig(conn, 'SELECT MAX("Id") AS id, MAX("ArrivalTime") AS at FROM "Notification"').get();
        this.lastId = r && r.id != null ? BigInt(r.id) : 0n;
        this.lastAt = r && r.at != null ? BigInt(r.at) : 0n;
        this.baselined = true; this.sig = sig; this.setStatus('ok');
        return [];
      }
      // Id is a counter; ArrivalTime covers a row re-posted under a reused Id. `seen` dedupes the overlap.
      const rows = prepBig(conn,
        'SELECT n."Id" AS id, n."ArrivalTime" AS at, n."Payload" AS payload, h."PrimaryId" AS app ' +
        'FROM "Notification" n LEFT JOIN "NotificationHandler" h ON n."HandlerId" = h."RecordId" ' +
        'WHERE lower(n."Type") = \'toast\' AND (n."Id" > ? OR n."ArrivalTime" > ?) ORDER BY n."ArrivalTime", n."Id" LIMIT 200'
      ).all(this.lastId, this.lastAt);
      // Position moves past everything that was in the table, toast or not.
      const top = prepBig(conn, 'SELECT MAX("Id") AS id, MAX("ArrivalTime") AS at FROM "Notification"').get();
      const fresh = [];
      for (const r of rows) {
        const key = `${r.id}:${r.at}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        fresh.push({ id: r.id, at: r.at, payload: r.payload, app: r.app });
      }
      if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
      if (top && top.id != null && BigInt(top.id) > this.lastId) this.lastId = BigInt(top.id);
      if (top && top.at != null && BigInt(top.at) > this.lastAt) this.lastAt = BigInt(top.at);
      this.sig = sig; this.setStatus('ok');
      return fresh.slice(-MAX_PER_POLL);
    } catch (e) {
      // Locked, half-written copy (we raced Windows), file replaced... try again on the next poll. Never log the message.
      this.setStatus('error', String((e && (e.code || e.name)) || 'error'));
      return [];
    } finally {
      try { if (conn) conn.close(); } catch {}
      if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  }

  schemaProblem(conn) {
    for (const [table, cols] of Object.entries(NEEDED)) {
      const have = new Set(conn.prepare(`PRAGMA table_info("${table}")`).all().map((c) => String(c.name).toLowerCase()));
      if (!have.size) return `table ${table} not found`;
      const missing = cols.filter((c) => !have.has(c.toLowerCase()));
      if (missing.length) return `${table} is missing column(s): ${missing.join(', ')}`;
    }
    return '';
  }
}

// ---------------------------------------------------------------- the feature

module.exports = {
  id: 'notifications',
  defaultEnabled: true,
  // exported for tests
  filetimeToMs, decodeEntities, payloadToString, parseToast, appInfo, resolveApp, isAllowed, toNotification, cleanName, WpnReader, DEFAULT_APPS, loadSqlite,

  start(ctx) {
    if (process.platform !== 'win32' && !process.env.ISLAND_WPN_DIR) return;
    const dir = process.env.ISLAND_WPN_DIR || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications');
    if (!dir || (!process.env.ISLAND_WPN_DIR && !process.env.LOCALAPPDATA)) return;

    sweepStaleTemp(os.tmpdir());
    const reader = new WpnReader({ dir, log: (...a) => ctx.log(...a) });
    const seenApps = new Map(); // key -> { key, name, color, def }   (names only, never content)
    let cfg = ctx.config.get() || {};
    let timer = null, stopped = false, failures = 0, lastSent = '';
    const recent = []; // [app key + title + body hash-ish, at] for de-duplication of identical bursts

    const sendStatus = () => {
      const s = JSON.stringify([reader.status, reader.reason]);
      if (s === lastSent) return;
      lastSent = s;
      ctx.send({ type: 'status', status: reader.status, reason: reader.status === 'unsupported' ? reader.reason : '' });
    };

    ctx.handle('seenApps', async () => {
      const out = new Map();
      for (const a of DEFAULT_APPS) out.set(a.key, { ...a, seen: false });
      for (const a of seenApps.values()) out.set(a.key, { ...a, seen: true });
      return [...out.values()].map((a) => ({ key: a.key, name: a.name, color: a.color, seen: a.seen, enabled: isAllowed('', a, cfg) }))
        .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
    });
    ctx.handle('setApp', async ({ key, enabled } = {}) => {
      if (typeof key !== 'string' || !key) return cfg;
      cfg = { ...cfg, apps: { ...(cfg.apps || {}), [key]: !!enabled } };
      ctx.config.set(cfg);
      return cfg;
    });
    ctx.handle('status', async () => ({ status: reader.status, reason: reader.status === 'unsupported' ? reader.reason : '' }));

    const next = (ms) => { if (!stopped) timer = setTimeout(tick, ms); };
    async function tick() {
      timer = null;
      let delay = POLL_MS;
      try {
        if (!ctx.enabled()) {
          reader.reset();                // when switched back on, start from "now" instead of replaying
          delay = 5000;
        } else {
          const rows = await reader.poll();
          if (stopped) return;
          failures = reader.status === 'error' || reader.status === 'missing' ? failures + 1 : 0;
          if (reader.status === 'unsupported') delay = 0;
          for (const row of rows) {
            const n = toNotification(row, cfg);
            if (!n) continue;
            const { info } = n.raw;
            seenApps.set(info.key, { key: info.key, name: info.name, color: info.color, def: info.def });
            if (!n.raw.allowed) continue;
            const sig = `${info.key}\u0000${n.msg.title}\u0000${n.msg.body}`;
            const now = Date.now();
            while (recent.length && now - recent[0][1] > 3000) recent.shift();
            if (recent.some((r) => r[0] === sig)) continue;
            recent.push([sig, now]);
            ctx.send(n.msg);
          }
          sendStatus();
          if (failures) delay = Math.min(POLL_MS * 2 ** Math.min(failures, 5), MAX_BACKOFF_MS);
        }
      } catch (e) { failures++; delay = Math.min(POLL_MS * 2 ** Math.min(failures, 5), MAX_BACKOFF_MS); ctx.log('poll failed:', e && e.name); }
      if (delay > 0) next(delay); // 'unsupported' stops polling for good
    }
    next(1500);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sweepStaleTemp(os.tmpdir());
    };
  }
};
