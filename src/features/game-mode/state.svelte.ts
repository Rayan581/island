/** Module-level state for game mode (a `.svelte.ts` file so `$state` works outside components). */
export const game = $state({
  /** The "Played …" pill shows until this time (ms since epoch). */
  until: 0,
  name: '',
  label: '',
  /** Has the helper ever reported a fullscreen state? (Tells "no data" apart from "nothing fullscreen".) */
  seen: false,
  /** A fullscreen app is in front right now (the island is hidden, or about to be), and which one. */
  active: false,
  exe: ''
});

export const PILL_MS = 6000;

export interface GameConfig { hideForVideo: boolean; showSessionTime: boolean }
export const DEFAULT_GAME_CONFIG: GameConfig = { hideForVideo: true, showSessionTime: true };
