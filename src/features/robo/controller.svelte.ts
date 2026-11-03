import { untrack } from 'svelte';
import type { FeatureCtx } from '../types';
import { robo, type Mood } from '../../lib/mood.svelte';
import { cursor, sysIdle } from '../../lib/cursor.svelte';
import { islandEvents } from '../../lib/events';
import { bat } from '../battery/state.svelte';
import {
  baseMood, resolveMood, nextTransient, shakeTurns, isStartle, dayKey, ENERGY,
  HAPPY_MS, SURPRISED_MS, YAWN_IDLE_MS, SLEEPY_IDLE_MS, type Transient
} from './mood';
import { roboSettings, loadRoboSettings, saveRoboSettings } from './state.svelte';
import { playMood } from './sound';

let transient: Transient | null = null;
const trigger = (mood: Mood, ms: number) => {
  transient = nextTransient(transient, mood, ms, Date.now());
  if (roboSettings.sounds && robo.on) playMood(mood);
};
const blink = (kind: 1 | 2) => { robo.blinkKind = kind; robo.blinkTick++; };

let glanceTimer = 0;
function glance(ms: number) {
  robo.glance = Math.random() < 0.5 ? -1 : 1;
  clearTimeout(glanceTimer);
  glanceTimer = window.setTimeout(() => (robo.glance = 0), ms);
}

/** Where the collapsed pill's eyes are on screen (window coordinates), or null when they aren't showing. */
function eyesCenter(): { x: number; y: number } | null {
  const el = document.querySelector('.pill .eyes') as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

const ACTIVE_LIMIT_MS = 5 * 60_000;   // this much quiet ends a "long session"
const TIRED_AFTER_MS = 3 * 3600_000;  // working this long without a break earns tired eyes
const TIRED_EVERY_MS = 30 * 60_000;

/** Starts Robo's mood logic; called once from the feature's init. */
export function startRobo(ctx: FeatureCtx) {
  const store = ctx.store;
  let lastMove = Date.now(), lx = cursor.x, ly = cursor.y;
  let nextLife = Date.now() + 4000, nextBored = 0;
  /** Quiet time: Windows' own idle time (any mouse or keyboard input) when it's reporting, so typing or reading never looks idle and a laptop waking from sleep doesn't either; otherwise "the cursor hasn't moved". */
  const idleFor = (wall: number) => {
    const byCursor = wall - lastMove;
    const fresh = sysIdle.s >= 0 && wall - sysIdle.at < 6000;
    return fresh ? sysIdle.s * 1000 + (wall - sysIdle.at) : byCursor;
  };
  const cfg = () => ENERGY[roboSettings.energy];

  // ---- events from the rest of the app ----
  islandEvents.on('success', () => { if (ctx.enabled) trigger('happy', HAPPY_MS); });
  islandEvents.on('error', () => { if (ctx.enabled) trigger('surprised', SURPRISED_MS); });
  islandEvents.on('notice', () => {
    if (!ctx.enabled) return;
    blink(1);
    if (Date.now() - lastMove > 3000) glance(1100);
  });

  // ---- the cursor, from anywhere on screen (the pill hides the eyes once you hover it, so this is how Robo notices you) ----
  const samples: { t: number; x: number; y: number }[] = [];
  let lastStartle = 0, lastShake = 0, lastWink = 0, stillSince = Date.now();
  function onCursorMove(x: number, y: number) {
    const now = Date.now(), c = cfg();
    if (!ctx.enabled || !c.cursor) { samples.length = 0; return; }
    const prev = samples[samples.length - 1];
    samples.push({ t: now, x, y });
    while (samples.length && now - samples[0].t > 1100) samples.shift();
    if (prev && (Math.abs(x - prev.x) > 3 || Math.abs(y - prev.y) > 3)) stillSince = now;
    // shaking the mouse back and forth -> dizzy
    if (now - lastShake > 10_000 && samples.length >= 8 && shakeTurns(samples.map((s) => s.x)) >= c.shakeTurns) {
      lastShake = now; trigger('dizzy', 2200);
    }
    // darting at the pill -> startled
    const e = eyesCenter();
    if (e && prev && now - lastStartle > 6000 && !store.expanded) {
      const dt = (now - prev.t) / 1000;
      if (dt > 0) {
        const speed = Math.hypot(x - prev.x, y - prev.y) / dt;
        if (isStartle(speed, Math.hypot(prev.x - e.x, prev.y - e.y), Math.hypot(x - e.x, y - e.y), c)) { lastStartle = now; trigger('surprised', 750); }
      }
    }
  }

  // ---- one-off reactions that watch app state ----
  let prevTrack = store.music.key, prevCharging = bat.charging;
  let yawned = false, asleep = false, greeted = false, ready = false;
  let activeSince = Date.now(), lastTired = 0;
  loadRoboSettings(ctx).then(() => { ready = true; });

  function wake() {
    trigger('surprised', 550);
    window.setTimeout(() => { blink(1); trigger('happy', 1500); }, 600);
  }
  function greet(wall: number, hour: number) {
    greeted = true;
    const today = dayKey(wall);
    if (roboSettings.lastGreet === today || hour < 4 || hour >= 12) return;
    roboSettings.lastGreet = today; saveRoboSettings(ctx);
    trigger('wink', 900);
    window.setTimeout(() => trigger('happy', 1600), 950);
  }

  $effect.root(() => {
    // The cursor feed updates ~25x a second while the pointer moves.
    $effect(() => { const x = cursor.x, y = cursor.y; untrack(() => onCursorMove(x, y)); });

    // A new song starts: sometimes heart eyes.
    $effect(() => {
      const key = store.music.key, playing = store.music.playing;
      if (key !== prevTrack) {
        prevTrack = key;
        if (key && playing && ctx.enabled && Math.random() < cfg().loveChance) trigger('love', 2300);
      }
    });
    // Plugged in: happy.
    $effect(() => {
      const ch = bat.charging;
      if (bat.has && ch && !prevCharging && ctx.enabled) trigger('happy', 2200);
      prevCharging = ch;
    });

    $effect(() => {
      void store.now; // ticks every 250 ms; also re-runs when the inputs below change
      const wall = Date.now(), c = cfg();
      if (cursor.x !== lx || cursor.y !== ly) { lx = cursor.x; ly = cursor.y; lastMove = wall; }
      const idleMs = idleFor(wall), hour = new Date(wall).getHours();
      const e = c.cursor && cursor.near && !store.expanded ? eyesCenter() : null;
      const near = !!e && Math.hypot(cursor.x - e.x, cursor.y - e.y) < c.nearPx;
      const inputs = {
        enabled: ctx.enabled, claudeRunning: store.runningCount > 0, hour, idleMs, sleepyAtNight: roboSettings.sleepyAtNight,
        focusRunning: store.focus.running, batteryLow: bat.has && !bat.charging && bat.level <= bat.threshold,
        musicPlaying: store.music.active && store.music.playing, near
      };
      if (robo.on !== ctx.enabled) robo.on = ctx.enabled;

      if (inputs.enabled && ready) {
        // idle ladder: bored (base mood) -> a yawn -> sleepy (base mood); coming back wakes Robo up
        if (idleMs < 30_000) yawned = false;
        if (!yawned && idleMs >= YAWN_IDLE_MS && !inputs.claudeRunning) { yawned = true; trigger('yawn', 1600); }
        if (idleMs >= SLEEPY_IDLE_MS) asleep = true;
        else if (asleep && idleMs < 4000) { asleep = false; wake(); }
        // a cheerful wink the first time you're back each morning
        if (!greeted && idleMs < 4000) untrack(() => greet(wall, hour));
        // long stretch without a break: tired eyes now and then
        if (idleMs >= ACTIVE_LIMIT_MS) activeSince = wall;
        else if (wall - activeSince >= TIRED_AFTER_MS && wall - lastTired >= TIRED_EVERY_MS) { lastTired = wall; trigger('tired', 9000); }
        // the cursor has rested near the pill for a while: a wink
        if (near && wall - stillSince > c.winkStillMs && wall - lastWink > 25_000) { lastWink = wall; trigger('wink', 700); }
      }

      const mood = resolveMood(inputs, transient, wall);
      if (robo.mood !== mood) {
        console.log(`[robo] ${robo.mood} -> ${mood} (idle ${Math.round(idleMs / 1000)}s, hour ${hour}, claude running ${store.runningCount})`);
        robo.mood = mood;
      }
      const until = inputs.enabled && transient && transient.until > wall ? transient.until : 0;
      if (robo.until !== until) robo.until = until;

      // Small idle life: now and then a double blink, a look to the side, or (rarely) a wink while the cursor is still.
      if (!inputs.enabled) { if (robo.glance) robo.glance = 0; return; }
      if (mood === 'bored' && wall >= nextBored) { nextBored = wall + 2200 + Math.random() * 1500; glance(1100); }
      if (wall >= nextLife) {
        nextLife = wall + (5000 + Math.random() * 7000) * c.lifeMult;
        if (mood === 'normal' || mood === 'sleepy' || mood === 'music') {
          const r = Math.random();
          if (r < 0.45) blink(2);
          else if (r < 0.8 && idleMs > 3500 && mood !== 'sleepy') glance(1300);
          else if (mood === 'normal' && Math.random() < c.randomWink * 4) trigger('wink', 650);
        }
      }
    });
  });
  // Handle for trying moods from devtools: __robo.set('happy', 5000)
  (window as unknown as Record<string, unknown>).__robo = {
    state: robo, set: (m: Mood, ms = 4000) => { transient = null; trigger(m, ms); }, clear: () => { transient = null; }, base: baseMood
  };
}
