import type { IslandFeature } from '../types';
import PlayedPill from './PlayedPill.svelte';
import GameSettings from './GameSettings.svelte';
import { game, PILL_MS } from './state.svelte';

interface Msg {
  ended?: { name: string; label: string; seconds: number };
  status?: { seen: boolean; active: boolean; exe: string };
}

const feature: IslandFeature = {
  id: 'game-mode',
  label: 'Game mode',
  description: 'Hides the island while a game or video is fullscreen, then shows how long you played.',
  defaultEnabled: true,
  init(ctx) {
    ctx.on((data) => {
      const m = data as Msg;
      if (m?.status) Object.assign(game, m.status);
      if (m?.ended) Object.assign(game, { name: m.ended.name, label: m.ended.label, until: Date.now() + PILL_MS });
    });
    ctx.call<Msg['status'] | null>('status').then((s) => { if (s) Object.assign(game, s); }).catch(() => {});
    // No Electron in the browser preview: expose the state so the pill can be driven from devtools.
    if (!window.island) (window as unknown as { __gameMode: typeof game }).__gameMode = game;
  },
  pill: {
    priority: (ctx) => (game.until > ctx.store.now ? 85 : null),
    width: () => 300,
    component: PlayedPill,
    openTab: false
  },
  settings: GameSettings
};
export default feature;
