import type { Mood } from '../../lib/mood.svelte';

export type Energy = 'calm' | 'normal' | 'playful';

/** Everything the resting mood depends on. Pure data so it can be unit-tested. */
export interface MoodInputs {
  enabled: boolean;
  claudeRunning: boolean;
  /** Local hour 0-23. */
  hour: number;
  /** Milliseconds without any mouse or keyboard input. */
  idleMs: number;
  sleepyAtNight: boolean;
  focusRunning?: boolean;
  /** Battery at or below the warning level and not charging. */
  batteryLow?: boolean;
  musicPlaying?: boolean;
  /** The cursor is close to the (collapsed) pill's eyes. */
  near?: boolean;
}
export interface Transient { mood: Mood; until: number }

export const BORED_IDLE_MS = 90_000;
export const YAWN_IDLE_MS = 150_000;
export const SLEEPY_IDLE_MS = 240_000;
export const HAPPY_MS = 2500;
export const SURPRISED_MS = 2000;

/**
 * The resting mood, most important first: working, focusing, a low battery, then the sleep ladder (night, then
 * bored -> sleepy as you stay away), then a curious cursor nearby, music, and plain normal.
 */
export function baseMood(i: MoodInputs): Mood {
  if (!i.enabled) return 'normal';
  if (i.claudeRunning) return 'squint';
  if (i.focusRunning) return 'determined';
  if (i.batteryLow) return 'worried';
  if (i.sleepyAtNight && i.hour >= 0 && i.hour < 6) return 'sleepy';
  if (i.idleMs >= SLEEPY_IDLE_MS) return 'sleepy';
  if (i.idleMs >= BORED_IDLE_MS) return 'bored';
  if (i.near) return 'curious';
  if (i.musicPlaying) return 'music';
  return 'normal';
}

/** A transient mood overrides the base until it expires. Disabled always means normal. */
export function resolveMood(i: MoodInputs, t: Transient | null, now: number): Mood {
  if (!i.enabled) return 'normal';
  if (t && t.until > now) return t.mood;
  return baseMood(i);
}

/** Higher ranks are not cut short by lower ones (a surprise isn't ended by a cheerful event). */
const RANK: Partial<Record<Mood, number>> = { happy: 1, wink: 1, tired: 1, love: 2, yawn: 2, surprised: 3, dizzy: 3 };

/** Combine a newly triggered transient with the current one. */
export function nextTransient(cur: Transient | null, mood: Mood, ms: number, now: number): Transient {
  const next = { mood, until: now + ms };
  if (cur && cur.until > now && (RANK[cur.mood] ?? 0) > (RANK[mood] ?? 0)) return cur;
  return next;
}

/** How lively Robo is. Calm keeps to event reactions; Playful reacts to the cursor more and fidgets more. */
export interface EnergyCfg {
  /** React to the cursor (curious, startled, dizzy, wink). */
  cursor: boolean;
  /** Cursor closer than this to the eyes (px) counts as "near". */
  nearPx: number;
  /** Cursor speed (px/s) towards the pill that startles it. */
  startleSpeed: number;
  /** Back-and-forth direction changes within ~1 s that count as shaking the mouse. */
  shakeTurns: number;
  /** A still cursor this close for this long earns a wink. */
  winkStillMs: number;
  /** Multiplies the gap between idle fidgets (bigger = calmer). */
  lifeMult: number;
  /** Chance of heart eyes when a new song starts. */
  loveChance: number;
  /** Chance per fidget of a random wink. */
  randomWink: number;
}
export const ENERGY: Record<Energy, EnergyCfg> = {
  calm: { cursor: false, nearPx: 0, startleSpeed: Infinity, shakeTurns: Infinity, winkStillMs: Infinity, lifeMult: 2, loveChance: 0.35, randomWink: 0 },
  normal: { cursor: true, nearPx: 130, startleSpeed: 1900, shakeTurns: 5, winkStillMs: 2400, lifeMult: 1, loveChance: 0.6, randomWink: 0.04 },
  playful: { cursor: true, nearPx: 180, startleSpeed: 1400, shakeTurns: 4, winkStillMs: 1600, lifeMult: 0.6, loveChance: 1, randomWink: 0.12 }
};

/** Counts back-and-forth direction changes in a series of x positions; each swing must cover at least `minSeg` px. */
export function shakeTurns(xs: number[], minSeg = 24): number {
  if (!xs.length) return 0;
  let turns = 0, dir = 0, ext = xs[0];
  for (const x of xs) {
    if (dir === 0) { if (Math.abs(x - ext) >= minSeg) { dir = Math.sign(x - ext); ext = x; } }
    else if (dir > 0) { if (x > ext) ext = x; else if (ext - x >= minSeg) { turns++; dir = -1; ext = x; } }
    else { if (x < ext) ext = x; else if (x - ext >= minSeg) { turns++; dir = 1; ext = x; } }
  }
  return turns;
}

/** Did the cursor just dart towards the pill fast enough to startle it? */
export function isStartle(speed: number, distBefore: number, distAfter: number, cfg: EnergyCfg): boolean {
  return cfg.cursor && speed >= cfg.startleSpeed && distAfter < distBefore && distAfter < 280;
}

/** Local calendar day as YYYY-MM-DD (for the once-a-day morning greeting). */
export function dayKey(ms: number): string {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
