import type { Config, IslandAPI, Settings } from './types';
import { DEFAULT_SETTINGS } from './settings';

declare global { interface Window { island?: IslandAPI } }

/** Inside Electron the preload provides `window.island`. In a plain browser (vite dev, tests) we fall back to a demo-only stub. */
export function getApi(): IslandAPI {
  if (window.island) return window.island;
  const cfg: Config = { demo: true, platform: 'browser', helper: 'unsupported', claudeConnected: false, hookPort: 47821 };
  const noop = () => () => {};
  let local: Settings = { ...DEFAULT_SETTINGS };
  return {
    getSettings: async () => local,
    setSettings: async (patch) => (local = { ...local, ...patch }),
    onSettings: noop, onCursor: noop, onIdle: noop, onCtrl: noop, onFeature: noop, onResync: noop, featureCall: async () => null, pathForFile: () => '',
    ignoreMouse: () => {}, media: () => {}, config: async () => cfg, lyrics: async () => null,
    onConfig: noop, onClaude: noop, onMedia: noop, onVolume: noop
  };
}
