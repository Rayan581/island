import type { FeatureCtx } from '../types';
import { robo, type Mood } from '../../lib/mood.svelte';
import { cursor } from '../../lib/cursor.svelte';
import { islandEvents } from '../../lib/events';
import { baseMood, resolveMood, nextTransient, HAPPY_MS, SURPRISED_MS, type Transient } from './mood';
import { roboSettings } from './state.svelte';

let transient: Transient | null = null;
const trigger = (mood: Mood, ms: number) => { transient = nextTransient(transient, mood, ms, Date.now()); };
const blink = (kind: 1 | 2) => { robo.blinkKind = kind; robo.blinkTick++; };

let glanceTimer = 0;
function glance(ms: number) {
  robo.glance = Math.random() < 0.5 ? -1 : 1;
  clearTimeout(glanceTimer);
  glanceTimer = window.setTimeout(() => (robo.glance = 0), ms);
}

/** Starts Robo's mood logic; called once from the feature's init. */
export function startRobo(ctx: FeatureCtx) {
  let lastMove = Date.now(), lx = cursor.x, ly = cursor.y;
  let nextLife = Date.now() + 4000;

  islandEvents.on('success', () => { if (ctx.enabled) trigger('happy', HAPPY_MS); });
  islandEvents.on('error', () => { if (ctx.enabled) trigger('surprised', SURPRISED_MS); });
  islandEvents.on('notice', () => {
    if (!ctx.enabled) return;
    blink(1);
    if (Date.now() - lastMove > 3000) glance(1100);
  });

  $effect.root(() => {
    $effect(() => {
      void ctx.store.now; // ticks every 250 ms; also re-runs when the inputs below change
      const wall = Date.now();
      if (cursor.x !== lx || cursor.y !== ly) { lx = cursor.x; ly = cursor.y; lastMove = wall; }
      const inputs = {
        enabled: ctx.enabled, claudeRunning: ctx.store.runningCount > 0, hour: new Date(wall).getHours(),
        idleMs: wall - lastMove, sleepyAtNight: roboSettings.sleepyAtNight
      };
      if (robo.on !== ctx.enabled) robo.on = ctx.enabled;
      const mood = resolveMood(inputs, transient, wall);
      if (robo.mood !== mood) robo.mood = mood;
      const until = inputs.enabled && transient && transient.until > wall ? transient.until : 0;
      if (robo.until !== until) robo.until = until;

      // Small idle life: now and then a double blink, or a look to the side while the cursor is still.
      if (!inputs.enabled) { if (robo.glance) robo.glance = 0; return; }
      if (wall >= nextLife) {
        nextLife = wall + 5000 + Math.random() * 7000;
        if (mood === 'normal' || mood === 'sleepy') {
          const r = Math.random();
          if (r < 0.45) blink(2);
          else if (r < 0.8 && inputs.idleMs > 3500 && mood === 'normal') glance(1300);
        }
      }
    });
  });
  // Handle for trying moods from devtools: __robo.set('happy', 5000)
  (window as unknown as Record<string, unknown>).__robo = {
    state: robo, set: (m: Mood, ms = 4000) => { transient = null; trigger(m, ms); }, clear: () => { transient = null; }, base: baseMood
  };
}
