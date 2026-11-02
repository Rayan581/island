// Game mode: hide the island while a fullscreen game or video is in front, and show "Played 1h 12m" afterwards.
// Detection is in the C# helper (helper/Features/Fullscreen.cs), which sends { type: 'fullscreen', on, exe, title, d3d }.
// The classification and session logic below is pure and tested (tests/game-mode.test.cjs).

const DEBOUNCE_MS = 1500;        // a fullscreen change must hold this long before the island reacts (no flicker)
const MIN_SESSION_S = 120;       // shorter sessions are not worth a pill
const RESUME_GRACE_MS = 20000;   // alt-tabbing away and back within this keeps one session
const STALE_MS = 25000;          // the helper repeats its state every 10 s; silence this long while hidden means it died
const DEFAULT_CONFIG = { hideForVideo: true, showSessionTime: true };

// Process names (lowercase, no .exe). Anything not listed here, in a d3d fullscreen or not, is assumed to be a game.
const VIDEO_APPS = new Set([
  'chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'vivaldi', 'arc', 'zen', 'iexplore', 'waterfox', 'librewolf',
  'vlc', 'mpc-hc', 'mpc-hc64', 'mpc-be', 'mpc-be64', 'mpv', 'mpvnet', 'potplayer', 'potplayermini', 'potplayermini64', 'wmplayer',
  'video.ui', 'movies', 'kodi', 'plex', 'plexamp', 'plexmediaplayer', 'netflix', 'disneyplus', 'primevideo', 'hbomax', 'max', 'crunchyroll',
  'spotify', 'zoom', 'teams', 'ms-teams', 'slack', 'discord', 'skype', 'obs64', 'obs32', 'streamlabs', 'applicationframehost'
]);
const OTHER_APPS = new Set([
  'powerpnt', 'winword', 'excel', 'onenote', 'outlook', 'acrobat', 'acrord32', 'acrord64', 'code', 'devenv', 'idea64', 'pycharm64',
  'notepad', 'notepad++', 'mspaint', 'photoshop', 'illustrator', 'figma', 'notion', 'obsidian', 'sumatrapdf', 'foxitreader',
  'teamviewer', 'anydesk', 'mstsc', 'vmware', 'vmware-vmx', 'virtualboxvm', 'vmconnect', 'parsecd', 'moonlight', 'sunshine'
]);

/** 'chrome.exe' / 'C:\\x\\Chrome.EXE' -> 'chrome' */
function normExe(exe) {
  const base = String(exe || '').split(/[\\/]/).pop().trim().toLowerCase();
  return base.replace(/\.exe$/, '');
}

/** 'game' | 'video' | 'other' | 'unknown' for a fullscreen foreground app. An unnamed one never starts a session. */
function classify(exe, d3d) {
  const n = normExe(exe);
  if (!n) return 'unknown';
  if (d3d) return 'game';
  if (VIDEO_APPS.has(n)) return 'video';
  if (OTHER_APPS.has(n)) return 'other';
  return 'game';
}

/** Should the island hide for this (debounced) fullscreen state? Games always do; the rest depends on hideForVideo. */
function shouldHide(state, cfg) {
  if (!state || !state.on) return false;
  return classify(state.exe, state.d3d) === 'game' || cfg.hideForVideo !== false;
}

/** 4320 -> '1h 12m', 2700 -> '45m', 150 -> '2m', 59 -> '<1m' */
function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return '<1m';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'a', 'an', 'in', 'on', 'to']);
/** 'eldenring.exe' -> 'Eldenring', 'Cyberpunk2077' -> 'Cyberpunk2077', 'hades_ii' -> 'Hades Ii', 'FactoryGame-Win64-Shipping' -> 'FactoryGame' */
function prettyExe(exe) {
  let n = String(exe || '').split(/[\\/]/).pop().trim().replace(/\.exe$/i, '');
  n = n.replace(/[-_ ]?(win(32|64)|x64|x86|shipping|dx\d+|vulkan|launcher)\b.*$/i, '');
  n = n.replace(/[_-]+/g, ' ').trim();
  if (!n) return '';
  return n.split(/\s+/).map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/** Window titles are usually the game's name; use one when it is short and tidy, else the exe's name. */
function displayName(exe, title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (t && t.length <= 40 && !/^(untitled|program manager|microsoft text input application)$/i.test(t)) return t;
  return prettyExe(exe) || t.slice(0, 40) || 'Game';
}

/**
 * Tracks play sessions from debounced fullscreen states. update() is called on every state change; tick() on a timer.
 * Both return an `ended` object ({ exe, title, seconds }) when a session of at least MIN_SESSION_S is over, else null.
 * A session ends RESUME_GRACE_MS after the game leaves fullscreen, so alt-tabbing out and back is one session.
 */
class SessionTracker {
  constructor({ minSeconds = MIN_SESSION_S, graceMs = RESUME_GRACE_MS } = {}) {
    this.minMs = minSeconds * 1000; this.graceMs = graceMs;
    this.s = null; // { exe, title, activeMs, since (ms | null while away), awayAt }
  }
  get active() { return !!this.s; }
  get current() { return this.s ? { exe: this.s.exe, title: this.s.title } : null; }

  update(state, now) {
    let ended = this.#expire(now);
    const game = state.on && classify(state.exe, state.d3d) === 'game';
    const same = game && !!this.s && normExe(state.exe) === normExe(this.s.exe);
    if (this.s && this.s.since !== null && !same) {
      // Left fullscreen, or switched to another game: stop the clock.
      this.s.activeMs += now - this.s.since; this.s.since = null; this.s.awayAt = now;
    }
    if (game) {
      if (same) {
        if (this.s.since === null) { this.s.since = now; this.s.awayAt = 0; } // came back in time
        if (state.title) this.s.title = state.title;
      } else {
        if (this.s) ended = this.#finish() || ended; // straight to another game: close the old one now
        this.s = { exe: state.exe, title: state.title || '', activeMs: 0, since: now, awayAt: 0 };
      }
    }
    return ended;
  }

  tick(now) { return this.#expire(now); }

  #expire(now) {
    if (this.s && this.s.since === null && now - this.s.awayAt >= this.graceMs) return this.#finish(now);
    return null;
  }
  #finish() {
    const s = this.s; this.s = null;
    if (!s || s.activeMs < this.minMs) return null;
    return { exe: s.exe, title: s.title, seconds: Math.round(s.activeMs / 1000) };
  }
}

function normalizeConfig(c) {
  const o = c && typeof c === 'object' ? c : {};
  return {
    hideForVideo: typeof o.hideForVideo === 'boolean' ? o.hideForVideo : DEFAULT_CONFIG.hideForVideo,
    showSessionTime: typeof o.showSessionTime === 'boolean' ? o.showSessionTime : DEFAULT_CONFIG.showSessionTime
  };
}

module.exports = {
  id: 'game-mode',
  defaultEnabled: true,
  // pure pieces, exported for tests
  DEBOUNCE_MS, MIN_SESSION_S, RESUME_GRACE_MS, STALE_MS, normExe, classify, shouldHide, formatDuration, prettyExe, displayName, SessionTracker, normalizeConfig,

  start(ctx) {
    let cfg = normalizeConfig(ctx.config.get());
    const tracker = new SessionTracker();
    let raw = null;          // latest message from the helper
    let stable = null;       // the debounced state the island acts on
    let lastMsgAt = 0;
    let seen = false;
    let debounce = null;
    let applied = false;     // is the island currently suppressed by us
    const timers = new Set();

    const apply = () => {
      const want = ctx.enabled() && shouldHide(stable, cfg);
      if (want !== applied) {
        applied = want;
        try { ctx.suppress(want); } catch (e) { ctx.log('suppress failed:', e.message); }
        ctx.log(want ? `hiding (${normExe(stable?.exe) || 'fullscreen'})` : 'showing again');
      }
    };
    const announce = (ended) => {
      if (!ended || !ctx.enabled() || !cfg.showSessionTime) return;
      ctx.send({ ended: { exe: ended.exe, name: displayName(ended.exe, ended.title), seconds: ended.seconds, label: formatDuration(ended.seconds), at: Date.now() } });
    };
    const sendStatus = () => ctx.send({ status: { seen, active: !!(stable && stable.on), exe: stable && stable.on ? normExe(stable.exe) : '' } });
    const settle = () => {
      debounce = null;
      if (!raw) return;
      const changed = !stable || stable.on !== raw.on || normExe(stable.exe) !== normExe(raw.exe) || stable.d3d !== raw.d3d;
      stable = raw;
      if (changed) { announce(tracker.update(stable, Date.now())); sendStatus(); }
      apply();
    };

    ctx.helper.on('fullscreen', (msg) => {
      try {
        seen = true; lastMsgAt = Date.now();
        raw = { on: !!msg.on, exe: String(msg.exe || ''), title: String(msg.title || ''), d3d: !!msg.d3d };
        if (!stable) { // the first report applies at once (the app starts in a game, or not)
          stable = raw; announce(tracker.update(stable, Date.now())); sendStatus(); apply(); return;
        }
        const same = stable.on === raw.on && normExe(stable.exe) === normExe(raw.exe) && stable.d3d === raw.d3d;
        if (same) { stable.title = raw.title || stable.title; if (debounce) { clearTimeout(debounce); debounce = null; } return; }
        clearTimeout(debounce);
        debounce = setTimeout(settle, DEBOUNCE_MS);
      } catch (e) { ctx.log('fullscreen message failed:', e.message); }
    });

    // Housekeeping once a second: finish sessions whose grace ran out, react to the switch or settings changing, and
    // never stay hidden if the helper went silent (it repeats its state every 10 s, so silence means it is gone).
    const housekeeping = setInterval(() => {
      try {
        announce(tracker.tick(Date.now()));
        if (applied && Date.now() - lastMsgAt > STALE_MS) {
          ctx.log('helper silent while hidden: showing the island again');
          stable = { on: false, exe: '', title: '', d3d: false }; raw = stable; tracker.update(stable, Date.now()); sendStatus();
        }
        apply();
      } catch (e) { ctx.log('housekeeping failed:', e.message); }
    }, 1000);
    timers.add(housekeeping);

    ctx.handle('config:set', async (obj) => { ctx.config.set(obj); cfg = normalizeConfig(obj); apply(); return obj; });
    ctx.handle('config:get', async () => cfg);
    ctx.handle('status', async () => ({ seen, active: !!(stable && stable.on), exe: stable && stable.on ? normExe(stable.exe) : '' }));

    return () => {
      clearTimeout(debounce);
      for (const t of timers) clearInterval(t);
      if (applied) { applied = false; try { ctx.suppress(false); } catch {} }
    };
  }
};
