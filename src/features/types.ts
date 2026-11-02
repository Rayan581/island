import type { Component } from 'svelte';
import type { Store } from '../lib/store.svelte';
import type { IslandAPI } from '../lib/types';

/**
 * What every feature gets. A feature lives in its own folder (src/features/<id>/index.ts) and is picked up
 * automatically, so adding one never means editing App.svelte, Pill.svelte or pill.ts.
 */
export interface FeatureCtx {
  id: string;
  store: Store;
  api: IslandAPI;
  /** Whether the user has this feature switched on (Settings → Features). Reactive. */
  readonly enabled: boolean;
  /** Ask this feature's Electron side (electron/features/<id>.cjs) to do something. */
  call<T = unknown>(action: string, arg?: unknown): Promise<T>;
  /** This feature's saved JSON config (%APPDATA%\\Island\\features\\<id>.json). */
  getConfig<T = Record<string, unknown>>(): Promise<T>;
  setConfig<T = Record<string, unknown>>(cfg: T): Promise<T>;
  /** Messages pushed by this feature's Electron side. Returns an unsubscribe function. */
  on(cb: (data: unknown) => void): () => void;
}

/** Props every feature component receives. */
export interface FeatureProps { ctx: FeatureCtx }

export interface IslandFeature {
  /** Lowercase, dash-separated; must match electron/features/<id>.cjs if the feature has an Electron side. */
  id: string;
  label: string;
  description: string;
  /** Default for the on/off switch. */
  defaultEnabled: boolean;
  /** Called once at startup. Keep state in a module-level `$state` object (see src/features/README.md). */
  init?(ctx: FeatureCtx): void;
  /**
   * Take over the collapsed pill. `priority()` returns a number (higher wins) or null when there is nothing to show.
   * Built-in priorities are in BUILTIN_PRIORITY (src/lib/pill.ts): e.g. volume 100, Claude running 70, lyrics 40, idle 0.
   */
  pill?: {
    priority(ctx: FeatureCtx): number | null; width(ctx: FeatureCtx): number; component: Component<FeatureProps>;
    /** Hovering the island while this feature owns the pill opens straight to its tab (needs `panel`). Default true. */
    openTab?: boolean;
  };
  /** A small dot/icon at the edge of the pill while live but not the main thing being shown. */
  badge?: { live(ctx: FeatureCtx): boolean; icon: string; color?: string };
  /** Adds a tab to the opened island. `icon` is a name from Icon.svelte or a raw SVG path (24x24 viewBox). */
  panel?: { label: string; icon: string; component: Component<FeatureProps>; height?: number };
  /** Extra controls under this feature's switch in Settings → Features. */
  settings?: Component<FeatureProps>;
}
