// Fake Spotify + Claude Code activity so the island can be developed and shown off anywhere.
import type { Store } from './store.svelte';
import type { LyricLine } from './types';

const TRACKS = [
  { title: 'Summer Rain', artist: 'Nova Lane', album: 'Weather Report', duration: 173, hue: 162,
    lines: ['Windows open, the city hums', 'Puddles holding pieces of the sun', 'I can feel it getting brighter', 'Every drop a little louder', 'Let the grey clouds roll on past', 'Summer rain, it never lasts'] },
  { title: 'Golden Hour', artist: 'Nova Lane', album: 'Weather Report', duration: 201, hue: 348,
    lines: ['Half past six and the light turns gold', 'Every shadow growing long and bold', 'Hold the moment, let it stay', 'Golden hour, don\u2019t fade away'] },
  { title: 'Night Shift', artist: 'Kite Collective', album: 'Low Orbit', duration: 188, hue: 265,
    lines: ['Neon on the window glass', 'Coffee cold, the hours pass', 'Typing till the morning breaks', 'One more build is all it takes'] }
];

function makeArt(hue: number): string {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 160, 160);
  bg.addColorStop(0, `hsl(${hue} 70% 42%)`); bg.addColorStop(1, `hsl(${hue + 35} 65% 18%)`);
  g.fillStyle = bg; g.fillRect(0, 0, 160, 160);
  g.fillStyle = `hsl(${hue - 10} 85% 70%)`; g.beginPath(); g.arc(112, 46, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = `hsl(${hue + 20} 60% 26%)`;
  g.beginPath(); g.moveTo(0, 160); g.lineTo(0, 112); g.quadraticCurveTo(50, 78, 92, 110); g.quadraticCurveTo(128, 136, 160, 104); g.lineTo(160, 160); g.fill();
  return c.toDataURL('image/png');
}

const timed = (lines: string[]): LyricLine[] => [{ t: 0, text: '' }, ...lines.map((text, i) => ({ t: 6 + i * 7, text })), { t: 6 + lines.length * 7, text: '' }];

export class Demo {
  private timers: number[] = [];
  private track = 0; private position = 30; private playing = true; private startedAt = Date.now();
  constructor(private store: Store) {}

  start() {
    const s = this.store;
    s.lyricsSource = async ({ title }) => {
      const t = TRACKS.find((x) => x.title === title);
      return t ? { lines: timed(t.lines), instrumental: false } : null;
    };
    s.mediaOverride = (cmd, arg) => {
      if (cmd === 'toggle') { this.position = this.pos(); this.startedAt = Date.now(); this.playing = !this.playing; }
      if (cmd === 'next' || cmd === 'prev') { this.track = (this.track + (cmd === 'next' ? 1 : TRACKS.length - 1)) % TRACKS.length; this.position = 0; this.startedAt = Date.now(); this.playing = true; }
      if (cmd === 'seek' && arg !== undefined) { this.position = arg; this.startedAt = Date.now(); }
      this.pushMedia();
    };
    this.pushMedia();
    s.volumeEvent({ type: 'volume', level: 0.42, muted: false, device: 'Speakers (Realtek Audio)', changed: false });
    this.timers.push(window.setInterval(() => { if (this.pos() >= TRACKS[this.track].duration) s.mediaCmd('next'); }, 1000));
    this.runClaude();
  }

  stop() {
    this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    this.timers = [];
    Object.assign(this.store, { lyricsSource: null, mediaOverride: null });
    delete this.store.sessions['demo-webshop'];
    this.store.mediaEvent({ type: 'media', active: false });
  }

  private pos() { return this.playing ? this.position + (Date.now() - this.startedAt) / 1000 : this.position; }

  private pushMedia() {
    const t = TRACKS[this.track];
    this.store.mediaEvent({
      type: 'media', active: true, key: `demo|${t.title}`, title: t.title, artist: t.artist, album: t.album,
      playing: this.playing, position: this.pos(), duration: t.duration, updatedAt: Date.now(), source: 'Spotify.exe', canSeek: true,
      art: makeArt(t.hue)
    });
  }

  private runClaude() {
    const base = { session_id: 'demo-webshop', cwd: 'C:\\dev\\webshop' };
    const steps: [number, Record<string, unknown>][] = [
      [1500, { hook_event_name: 'UserPromptSubmit', prompt: 'Fix the checkout total when a coupon is applied' }],
      [2500, { hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'applyCoupon' } }],
      [1200, { hook_event_name: 'PostToolUse' }],
      [800, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'C:\\dev\\webshop\\src\\checkout\\total.ts' } }],
      [2000, { hook_event_name: 'PostToolUse' }],
      [600, { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\dev\\webshop\\src\\checkout\\total.ts' } }],
      [2500, { hook_event_name: 'PostToolUse' }],
      [600, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test -- checkout' } }],
      [5000, { hook_event_name: 'PostToolUse' }],
      [800, { hook_event_name: 'Stop' }]
    ];
    let i = 0;
    const next = () => {
      const [delay, ev] = steps[i % steps.length];
      this.timers.push(window.setTimeout(() => {
        this.store.claudeEvent({ ...base, ...ev } as never);
        i++;
        if (i % steps.length === 0) this.timers.push(window.setTimeout(next, 20000)); else next();
      }, delay));
    };
    next();
  }
}
