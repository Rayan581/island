import type { ClaudeSession, Config, HookEvent, IslandAPI, LyricLine, MediaEvent, Phase, Settings, View, VolumeEvent } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { cursor } from './cursor.svelte';
import { accentFromImage, fallbackAccent, type Accent } from './color';
import { basename } from './format';
import { islandEvents } from './events';

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const TEST_RE = /\b(test|tests|pytest|jest|vitest|mocha|cargo test|go test|dotnet test|npm run (test|check|lint|build)|tsc|ruff|eslint)\b/i;

function phaseFor(tool: string, input: Record<string, unknown> = {}): Phase | null {
  if (READ_TOOLS.has(tool)) return 0;
  if (EDIT_TOOLS.has(tool)) return 1;
  if (tool === 'Bash') return TEST_RE.test(String(input.command ?? '')) ? 2 : null;
  return null;
}

function describe(tool: string, input: Record<string, unknown> = {}): string {
  if (typeof input.command === 'string') return '$ ' + input.command;
  const v = input.file_path ?? input.notebook_path ?? input.pattern ?? input.url ?? input.query ?? input.description;
  return typeof v === 'string' ? (input.file_path || input.notebook_path ? basename(v) : v) : '';
}

const TOOL_LABEL: Record<string, string> = {
  Read: 'Reading', Grep: 'Searching', Glob: 'Searching', LS: 'Listing', WebFetch: 'Fetching', WebSearch: 'Searching the web',
  Edit: 'Editing', MultiEdit: 'Editing', Write: 'Writing', NotebookEdit: 'Editing', Bash: 'Running', Task: 'Delegating', TodoWrite: 'Planning'
};
export const toolLabel = (t: string) => TOOL_LABEL[t] ?? (t.startsWith('mcp__') ? t.split('__').pop()! : t);

export interface Music {
  active: boolean; key: string; title: string; artist: string; album: string; playing: boolean;
  position: number; anchor: number; duration: number; source: string; canSeek: boolean; art: string | null;
}

export class Store {
  api: IslandAPI;
  now = $state(Date.now());
  expanded = $state(false);
  view = $state<View>('home');
  config = $state<Config>({ demo: false, platform: 'win32', helper: 'starting', claudeConnected: false, hookPort: 47821 });

  sessions = $state<Record<string, ClaudeSession>>({});
  selectedSession = $state<string | null>(null);

  music = $state<Music>({ active: false, key: '', title: '', artist: '', album: '', playing: false, position: 0, anchor: 0, duration: 0, source: '', canSeek: false, art: null });
  accent = $state<Accent>({ h: 158, s: 64, l: 52 });
  lyrics = $state<LyricLine[] | null>(null);
  lyricsState = $state<'none' | 'loading' | 'ready' | 'instrumental' | 'missing'>('none');

  volume = $state({ level: 0.5, muted: false, device: '', showUntil: 0 });

  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  private pendingSettings: Partial<Settings> = {};
  private settingsTimer = 0;

  focus = $state({ total: 25 * 60, endsAt: 0, left: 25 * 60, running: false, flashUntil: 0 });

  /** Demo mode swaps these in so the UI can run without Windows, Spotify or Claude Code. */
  lyricsSource: IslandAPI['lyrics'] | null = null;
  mediaOverride: IslandAPI['media'] | null = null;

  constructor(api: IslandAPI) {
    this.api = api;
    api.onClaude((e) => this.claudeEvent(e));
    api.onMedia((e) => this.mediaEvent(e));
    api.onVolume((e) => this.volumeEvent(e));
    api.getSettings().then((v) => Object.assign(this.settings, v));
    api.onSettings((v) => { Object.assign(this.settings, v); }); // no return value: it would have to cross the context bridge
    api.onCursor((p) => { if (p) { cursor.x = p.x; cursor.y = p.y; cursor.near = true; } else cursor.near = false; });
    setInterval(() => this.tick(), 250);
  }

  /** Applies a settings change at once (so sliders feel live) and saves it a moment later. */
  updateSettings(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    Object.assign(this.pendingSettings, patch);
    clearTimeout(this.settingsTimer);
    this.settingsTimer = window.setTimeout(() => {
      const p = this.pendingSettings; this.pendingSettings = {};
      this.api.setSettings(p).then((v) => Object.assign(this.settings, v));
    }, 150);
  }

  setFeature(id: string, on: boolean) { this.updateSettings({ features: { ...this.settings.features, [id]: on } }); }

  // ---------------- Claude Code ----------------
  claudeEvent(e: HookEvent) {
    const id = e.session_id || 'default', now = Date.now();
    if (e.hook_event_name === 'SessionEnd') { delete this.sessions[id]; return; }
    const s = this.sessions[id] ?? (this.sessions[id] = {
      id, project: basename(e.cwd), status: 'idle', startedAt: now, endedAt: 0, updatedAt: now,
      tool: '', detail: '', toolCount: 0, phase: 0, seen: true
    });
    if (e.cwd) s.project = basename(e.cwd);
    s.updatedAt = now;
    switch (e.hook_event_name) {
      case 'UserPromptSubmit':
        Object.assign(s, { status: 'running', startedAt: e.started_at ?? now, endedAt: 0, toolCount: 0, phase: 0, tool: 'Thinking', detail: (e.prompt ?? '').slice(0, 140), seen: true });
        break;
      case 'PreToolUse': {
        if (s.status !== 'running') Object.assign(s, { status: 'running', seen: true, ...(s.status === 'done' || s.status === 'idle' ? { startedAt: now, toolCount: 0, phase: 0 } : {}) });
        const tool = e.tool_name ?? 'Tool';
        s.tool = tool; s.detail = e.detail ?? describe(tool, e.tool_input);
        if (e.started_at && s.toolCount === 0) s.startedAt = e.started_at;
        if (typeof e.tool_count === 'number') s.toolCount = e.tool_count;
        const p = phaseFor(tool, e.detail?.startsWith('$ ') ? { command: e.detail.slice(2) } : e.tool_input);
        if (p !== null && p > s.phase) s.phase = p;
        break;
      }
      case 'PostToolUse': s.toolCount++; break;
      case 'Notification': {
        const msg = e.message ?? 'Needs your attention';
        if (s.status === 'done' && /waiting for your input/i.test(msg)) break; // idle reminder after a finished turn
        Object.assign(s, { status: 'attention', detail: msg, seen: false });
        islandEvents.emit('error', { source: 'claude', project: s.project, message: msg });
        break;
      }
      case 'Stop':
        Object.assign(s, { status: 'done', endedAt: now, phase: 3, seen: false });
        islandEvents.emit('success', { source: 'claude', project: s.project });
        break;
    }
  }

  get sessionList() { return Object.values(this.sessions).sort((a, b) => b.updatedAt - a.updatedAt); }

  /** The session the island should talk about: attention > running > unseen done > most recent. */
  get claude(): ClaudeSession | null {
    const list = this.sessionList;
    if (this.selectedSession && this.sessions[this.selectedSession]) return this.sessions[this.selectedSession];
    return list.find((s) => s.status === 'attention') ?? list.find((s) => s.status === 'running')
      ?? list.find((s) => s.status === 'done' && !s.seen) ?? list[0] ?? null;
  }
  get runningCount() { return this.sessionList.filter((s) => s.status === 'running').length; }

  elapsed(s: ClaudeSession) { return ((s.status === 'running' || s.status === 'attention' ? this.now : s.endedAt || this.now) - s.startedAt) / 1000; }

  /** "Done stays blue until you look": finished sessions count as seen once the island has been opened and closed. */
  markSeen() { for (const s of Object.values(this.sessions)) if (s.status === 'done') s.seen = true; }

  // ---------------- Music ----------------
  mediaEvent(e: MediaEvent) {
    const m = this.music, now = Date.now();
    if (!e.active) { Object.assign(m, { active: false, playing: false, key: '', art: null }); this.lyrics = null; this.lyricsState = 'none'; return; }
    const changed = e.key !== m.key;
    // Use the player's own timestamp when it's sane, so the position (and lyrics) don't lag by our polling interval.
    const anchor = e.updatedAt && e.updatedAt > now - 6 * 3600e3 && e.updatedAt < now + 5000 ? e.updatedAt : now;
    Object.assign(m, {
      active: true, key: e.key ?? '', title: e.title ?? '', artist: e.artist ?? '', album: e.album ?? '',
      playing: !!e.playing, position: e.position ?? 0, anchor, duration: e.duration ?? 0, source: e.source ?? '', canSeek: !!e.canSeek
    });
    if (changed) {
      m.art = e.art ?? null;
      this.accent = fallbackAccent(m.title + m.artist);
      this.loadLyrics();
    }
    if (e.art && (changed || e.art !== m.art)) {
      m.art = e.art;
      const key = m.key;
      accentFromImage(e.art).then((a) => { if (a && this.music.key === key) this.accent = a; });
    }
  }

  mediaCmd(cmd: 'toggle' | 'next' | 'prev' | 'seek', arg?: number) {
    if (this.mediaOverride) return this.mediaOverride(cmd, arg);
    this.api.media(cmd, arg);
    if (cmd === 'toggle') this.music.playing = !this.music.playing; // optimistic; the helper confirms within ~0.5 s
    if (cmd === 'seek' && arg !== undefined) Object.assign(this.music, { position: arg, anchor: Date.now() });
  }

  get position() {
    const m = this.music;
    const p = m.playing ? m.position + (this.now - m.anchor) / 1000 : m.position;
    return m.duration ? Math.min(Math.max(p, 0), m.duration) : Math.max(p, 0);
  }

  /**
   * A miss is often temporary: the player publishes the duration/album a moment after the title, or LRCLIB/the network
   * hiccups. So a miss is retried a few times, with fresh metadata, before the pill settles on "no lyrics".
   */
  async loadLyrics(attempt = 0) {
    const m = this.music, key = m.key;
    if (attempt === 0) { this.lyrics = null; this.lyricsState = 'loading'; }
    const res = await (this.lyricsSource ?? this.api.lyrics)({ title: m.title, artist: m.artist, album: m.album, duration: m.duration, fresh: attempt > 0 }).catch(() => null);
    if (this.music.key !== key) return;
    if (!res) {
      this.lyricsState = 'missing';
      const delay = [2500, 8000, 25000][attempt];
      if (delay !== undefined) setTimeout(() => { if (this.music.key === key && this.lyricsState === 'missing') this.loadLyrics(attempt + 1); }, delay);
      return;
    }
    this.lyrics = res.lines; this.lyricsState = res.instrumental ? 'instrumental' : res.lines.length ? 'ready' : 'missing';
  }

  /** Index of the line being sung right now (slight lead so the text lands on the beat). */
  get lyricIndex() {
    const L = this.lyrics; if (!L?.length) return -1;
    const p = this.position + 0.3;
    let lo = 0, hi = L.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].t <= p) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  get lyricLine() { const i = this.lyricIndex; return i >= 0 ? this.lyrics![i].text : ''; }

  // ---------------- Volume ----------------
  volumeEvent(e: VolumeEvent) {
    Object.assign(this.volume, { level: e.level, muted: e.muted, device: e.device });
    if (e.changed) this.volume.showUntil = Date.now() + 1600;
  }

  // ---------------- Focus ----------------
  toggleFocus() {
    const f = this.focus;
    if (f.running) { f.left = Math.max(0, (f.endsAt - Date.now()) / 1000); f.running = false; return; }
    if (f.left <= 0) f.left = f.total;
    f.endsAt = Date.now() + f.left * 1000; f.running = true;
  }
  resetFocus() { Object.assign(this.focus, { running: false, left: this.focus.total }); }
  setFocusLength(min: number) { Object.assign(this.focus, { total: min * 60, left: min * 60, running: false }); }

  tick() {
    this.now = Date.now();
    const f = this.focus;
    if (f.running) {
      f.left = Math.max(0, (f.endsAt - this.now) / 1000);
      if (f.left <= 0) {
        f.running = false; f.flashUntil = this.now + 8000;
        islandEvents.emit('success', { source: 'focus' });
        try { new Notification('Focus session complete', { body: 'Nice work. Time for a short break.', silent: false }); } catch { /* no notifications in some contexts */ }
      }
    }
  }
}
