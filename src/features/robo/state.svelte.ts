import type { FeatureCtx } from '../types';
import type { Energy } from './mood';

export const roboSettings = $state({
  /** Sleepy between 00:00 and 06:00. */
  sleepyAtNight: true,
  /** calm | normal | playful */
  energy: 'normal' as Energy,
  /** Soft blips on reactions. Off unless you turn it on. */
  sounds: false,
  /** The day (YYYY-MM-DD) Robo last said good morning. */
  lastGreet: ''
});

type Saved = { sleepyAtNight?: unknown; energy?: unknown; sounds?: unknown; lastGreet?: unknown };
let loading: Promise<void> | null = null;

/** Reads the saved settings once (the controller and the Settings panel both call this). */
export function loadRoboSettings(ctx: FeatureCtx): Promise<void> {
  return (loading ??= ctx.getConfig<Saved>().then((c) => {
    if (typeof c?.sleepyAtNight === 'boolean') roboSettings.sleepyAtNight = c.sleepyAtNight;
    if (c?.energy === 'calm' || c?.energy === 'normal' || c?.energy === 'playful') roboSettings.energy = c.energy;
    if (typeof c?.sounds === 'boolean') roboSettings.sounds = c.sounds;
    if (typeof c?.lastGreet === 'string') roboSettings.lastGreet = c.lastGreet;
  }).catch(() => {}));
}

/** Writes all of Robo's settings (a plain copy: reactive objects can't cross into the main process). */
export function saveRoboSettings(ctx: FeatureCtx) {
  ctx.setConfig({ ...$state.snapshot(roboSettings) }).catch(() => {});
}
