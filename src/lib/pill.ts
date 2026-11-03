import type { Store } from './store.svelte';
import { robo } from './mood.svelte';

import { topFeaturePill, liveBadges, ctxs } from '../features/registry.svelte';
const ctxOf = (f: IslandFeature) => ctxs[f.id];
import type { IslandFeature } from '../features/types';

export type PillKind = 'volume' | 'focus-done' | 'attention' | 'running' | 'done' | 'focus' | 'lyrics' | 'track' | 'idle' | 'feature';

/** Higher wins. Features compare their own `pill.priority()` against these. */
export const BUILTIN_PRIORITY: Record<Exclude<PillKind, 'feature'>, number> = {
  volume: 100, 'focus-done': 90, attention: 80, running: 70, done: 60, focus: 50, lyrics: 40, track: 30, idle: 0
};
export type Badge = 'claude' | 'focus' | 'music';

/** What the collapsed pill shows, highest priority first, plus small badges for anything else that's live. */
export function pillState(s: Store): { kind: PillKind; badges: Badge[]; width: number; feature: IslandFeature | null; featureBadges: IslandFeature[] } {
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

  // A feature that outranks the built-in choice takes the pill.
  const top = topFeaturePill();
  const builtinKind = kind;
  const feature = top && top.priority > BUILTIN_PRIORITY[builtinKind] ? top.feature : null;
  if (feature) kind = 'feature';

  const badges: Badge[] = [];
  const claudeKinds: PillKind[] = ['attention', 'running', 'done'];
  if (claudeLive && !claudeKinds.includes(kind)) badges.push('claude');
  if (f.running && kind !== 'focus') badges.push('focus');
  if (musicLive && kind !== 'lyrics' && kind !== 'track') badges.push('music');
  if (feature && builtinKind !== 'idle') { /* what the feature displaced still shows as a badge */
    if (['attention', 'running', 'done'].includes(builtinKind) && !badges.includes('claude')) badges.push('claude');
    if (builtinKind === 'focus' && !badges.includes('focus')) badges.push('focus');
    if ((builtinKind === 'lyrics' || builtinKind === 'track') && !badges.includes('music')) badges.push('music');
  }
  const featureBadges = kind === 'volume' ? [] : liveBadges(feature?.id);
  if (kind === 'volume') badges.length = 0;

  const { idleWidth, activeWidth } = s.settings;
  const featureW = feature && feature.pill ? feature.pill.width(ctxOf(feature)) : 0;
  const base = kind === 'feature' ? Math.max(featureW, idleWidth) : kind === 'idle' ? idleWidth : kind === 'volume' || kind === 'lyrics' ? activeWidth + 80 : activeWidth;
  const badgeW = badges.reduce((w, b) => w + (b === 'focus' ? 62 : 28), 0) + featureBadges.length * 22;
  const eyesW = robo.on && (kind === 'lyrics' || kind === 'track') ? 24 : 0; // Robo rides along in the music pill
  return { kind, badges, feature, featureBadges, width: base + badgeW + eyesW + (kind === 'idle' && (badges.length || featureBadges.length) ? 24 : 0) };
}
