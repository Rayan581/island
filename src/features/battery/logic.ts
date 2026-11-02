// Pure battery rules, kept free of Svelte/Electron so tests/battery.test.cjs can load them.

export const CRITICAL = 10;
export const DEFAULT_THRESHOLD = 20;

export const clampThreshold = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(30, Math.max(10, v)) : DEFAULT_THRESHOLD;
};

/** Battery fraction (0..1) from the Battery API to a whole percent. */
export const toPercent = (level: number): number => Math.min(100, Math.max(0, Math.round((Number.isFinite(level) ? level : 0) * 100)));

/**
 * A desktop PC reports `charging, level 1, chargingTime 0`. A laptop sitting full on the charger reports the very same,
 * so this only says "looks like a desktop": the caller keeps the feature silent until a real change event proves otherwise.
 */
export const looksLikeDesktop = (b: { charging: boolean; level: number; chargingTime: number }): boolean =>
  b.charging && b.level === 1 && b.chargingTime === 0;

export interface WarnState { done: number[] }
export type Warning = { kind: 'low' | 'critical'; level: number } | null;

/**
 * When to warn. Warnings fire at `threshold` and at 10% while discharging, once each per discharge cycle (plugging in
 * starts a new cycle). If the level jumps past both (say 25% -> 8%) only the most urgent one shows.
 */
export function nextWarn(state: WarnState, input: { level: number; charging: boolean; threshold: number }): { state: WarnState; warn: Warning } {
  if (input.charging) return { state: state.done.length ? { done: [] } : state, warn: null };
  const thresholds = [...new Set([clampThreshold(input.threshold), CRITICAL])].sort((a, b) => b - a);
  const reached = thresholds.filter((t) => input.level <= t);
  const fresh = reached.filter((t) => !state.done.includes(t));
  if (!fresh.length) return { state, warn: null };
  const t = Math.min(...fresh);
  return { state: { done: [...new Set([...state.done, ...reached])] }, warn: { kind: t <= CRITICAL ? 'critical' : 'low', level: input.level } };
}

/** The badge shows while the battery is at or under the threshold and not charging. */
export const isLow = (level: number, charging: boolean, threshold: number): boolean => !charging && level <= clampThreshold(threshold);

export type Tone = 'charging' | 'normal' | 'low' | 'critical';
export const toneFor = (level: number, charging: boolean, threshold: number): Tone =>
  charging ? 'charging' : level <= CRITICAL ? 'critical' : level <= clampThreshold(threshold) ? 'low' : 'normal';

/** Plug/unplug announcements must alternate: the Battery API and powerMonitor both report each change, only the first counts. */
export const shouldAnnounce = (last: boolean | null, now: boolean): boolean => last !== now;
