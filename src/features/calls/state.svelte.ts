export interface CallApp { name: string; call: boolean }

/** Shared state for the pill, badge, tab and settings. Filled from the helper via electron/features/calls.cjs. */
export const calls = $state({
  /** The helper has reported at least once (so detection works). */
  helper: false,
  mic: [] as CallApp[],
  cam: [] as CallApp[],
  muted: false,
  /** Timestamp the current call started, 0 when there is none. */
  callSince: 0
});

export const callApp = (): string => calls.mic.find((a) => a.call)?.name ?? '';
export const inCall = (): boolean => calls.callSince > 0;

export const MIC_COLOR = '#ff9f0a';
export const CAM_COLOR = '#30d158';
export const MUTE_COLOR = '#ff453a';
export const MIC_PATH = 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3';
export const MIC_OFF_PATH = MIC_PATH + 'M4 4l16 16';
export const CAM_PATH = 'M3 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM16 11l5-3v8l-5-3';
// A filled disc drawn with strokes (the Icon component strokes paths): concentric rings plus a centre dot.
export const DOT_PATH = 'M12 12h.01M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4zM12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z';
