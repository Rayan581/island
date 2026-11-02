import { DEFAULT_THRESHOLD } from './logic';

export type PeekKind = 'plug' | 'unplug' | 'low' | 'critical';

export const bat = $state({
  /** A real battery has been seen (not a desktop PC). Until then the feature is silent. */
  has: false,
  level: 100, // whole percent
  charging: false,
  threshold: DEFAULT_THRESHOLD,
  peek: { id: 0, kind: 'plug' as PeekKind, until: 0 }
});
