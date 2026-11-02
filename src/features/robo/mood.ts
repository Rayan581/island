import type { Mood } from '../../lib/mood.svelte';

/** Everything the resting mood depends on. Pure data so it can be unit-tested. */
export interface MoodInputs {
  enabled: boolean;
  claudeRunning: boolean;
  /** Local hour 0-23. */
  hour: number;
  /** Milliseconds since the cursor last moved. */
  idleMs: number;
  sleepyAtNight: boolean;
}
export interface Transient { mood: Mood; until: number }

export const SLEEPY_IDLE_MS = 10 * 60_000;
export const HAPPY_MS = 2500;
export const SURPRISED_MS = 2000;

/** Working beats sleepy (a late-night Claude run still looks focused); night or long idle means sleepy. */
export function baseMood(i: MoodInputs): Mood {
  if (!i.enabled) return 'normal';
  if (i.claudeRunning) return 'squint';
  if (i.sleepyAtNight && i.hour >= 0 && i.hour < 6) return 'sleepy';
  if (i.idleMs >= SLEEPY_IDLE_MS) return 'sleepy';
  return 'normal';
}

/** A transient mood overrides the base until it expires. Disabled always means normal. */
export function resolveMood(i: MoodInputs, t: Transient | null, now: number): Mood {
  if (!i.enabled) return 'normal';
  if (t && t.until > now) return t.mood;
  return baseMood(i);
}

const RANK: Partial<Record<Mood, number>> = { happy: 1, surprised: 2 };

/** Combine a newly triggered transient with the current one: surprise isn't cut short by a cheerful event. */
export function nextTransient(cur: Transient | null, mood: Mood, ms: number, now: number): Transient {
  const next = { mood, until: now + ms };
  if (cur && cur.until > now && (RANK[cur.mood] ?? 0) > (RANK[mood] ?? 0)) return cur;
  return next;
}
