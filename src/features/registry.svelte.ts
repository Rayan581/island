import type { Store } from '../lib/store.svelte';
import type { IslandAPI } from '../lib/types';
import type { FeatureCtx, IslandFeature } from './types';

// Every src/features/<id>/index.ts that default-exports an IslandFeature is registered automatically.
const mods = import.meta.glob<{ default: IslandFeature }>('./*/index.ts', { eager: true });
export const features: IslandFeature[] = Object.values(mods).map((m) => m.default).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label));

export const ctxs: Record<string, FeatureCtx> = {};

export function initFeatures(store: Store, api: IslandAPI) {
  for (const f of features) {
    const ctx: FeatureCtx = {
      id: f.id, store, api,
      get enabled() { return store.settings.features?.[f.id] ?? f.defaultEnabled; },
      call: (action, arg) => api.featureCall(f.id, action, arg) as never,
      getConfig: () => api.featureCall(f.id, 'config:get').then((c) => (c ?? {}) as never),
      setConfig: (c) => api.featureCall(f.id, 'config:set', c) as never,
      on: (cb) => api.onFeature((m) => { if (m.id === f.id) cb(m.data); })
    };
    ctxs[f.id] = ctx;
    try { f.init?.(ctx); } catch (e) { console.error(`[feature ${f.id}] init failed`, e); }
  }
}

/** The enabled feature that wants the pill most, if any. */
export function topFeaturePill(): { feature: IslandFeature; priority: number } | null {
  let best: { feature: IslandFeature; priority: number } | null = null;
  for (const f of features) {
    const ctx = ctxs[f.id];
    if (!f.pill || !ctx?.enabled) continue;
    const p = f.pill.priority(ctx);
    if (p !== null && (!best || p > best.priority)) best = { feature: f, priority: p };
  }
  return best;
}

export function liveBadges(exceptId?: string) {
  return features.filter((f) => f.badge && f.id !== exceptId && ctxs[f.id]?.enabled && f.badge.live(ctxs[f.id]));
}
