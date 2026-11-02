import type { Store } from './store.svelte';

export type PillKind = 'volume' | 'focus-done' | 'attention' | 'running' | 'done' | 'focus' | 'lyrics' | 'track' | 'idle';
export type Badge = 'claude' | 'focus' | 'music';

/** What the collapsed pill shows, highest priority first, plus small badges for anything else that's live. */
export function pillState(s: Store): { kind: PillKind; badges: Badge[]; width: number } {
  const c = s.claude, m = s.music, f = s.focus, now = s.now;
  const claudeLive = !!c && (c.status === 'running' || c.status === 'attention' || (c.status === 'done' && !c.seen));
  const musicLive = m.active && m.playing;

  let kind: PillKind = 'idle';
  if (s.volume.showUntil > now) kind = 'volume';
  else if (f.flashUntil > now) kind = 'focus-done';
  else if (c?.status === 'attention') kind = 'attention';
  else if (c?.status === 'running') kind = 'running';
  else if (c?.status === 'done' && !c.seen) kind = 'done';
  else if (f.running) kind = 'focus';
  else if (musicLive && s.lyricsState === 'ready') kind = 'lyrics';
  else if (musicLive) kind = 'track';

  const badges: Badge[] = [];
  const claudeKinds: PillKind[] = ['attention', 'running', 'done'];
  if (claudeLive && !claudeKinds.includes(kind)) badges.push('claude');
  if (f.running && kind !== 'focus') badges.push('focus');
  if (musicLive && kind !== 'lyrics' && kind !== 'track') badges.push('music');
  if (kind === 'volume') badges.length = 0;

  const { idleWidth, activeWidth } = s.settings;
  const base = kind === 'idle' ? idleWidth : kind === 'volume' || kind === 'lyrics' ? activeWidth + 80 : activeWidth;
  const badgeW = badges.reduce((w, b) => w + (b === 'focus' ? 62 : 28), 0);
  return { kind, badges, width: base + badgeW + (kind === 'idle' && badges.length ? 24 : 0) };
}
