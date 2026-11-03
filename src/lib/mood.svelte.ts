// Robo's current mood, read by Eyes.svelte and written by the robo feature (src/features/robo).
export type Mood =
  | 'normal' | 'squint' | 'happy' | 'surprised' | 'sleepy'
  | 'curious' | 'dizzy' | 'wink' | 'love' | 'worried' | 'determined' | 'bored' | 'yawn' | 'tired' | 'music';

export const robo = $state({
  /** True while the Robo feature is switched on (the busy pills show eyes instead of icons only then). */
  on: false,
  /** The mood the eyes show right now (always 'normal' while the feature is off). */
  mood: 'normal' as Mood,
  /** When the active transient mood (happy / surprised / love ...) ends, ms epoch; 0 when none. */
  until: 0,
  /** Bumped to ask every pair of eyes for a blink (1 = single, 2 = double). */
  blinkKind: 0, blinkTick: 0,
  /** A brief sideways look while the cursor is still: -1 left, 0 none, 1 right. */
  glance: 0
});
