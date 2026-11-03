import type { Settings } from './types';

// Keep in step with electron/settings.cjs (tests/settings.test.cjs checks that they agree).
export const DEFAULT_SETTINGS: Settings = {
  style: 'floating', idleWidth: 132, activeWidth: 280, height: 36, topOffset: 6, radius: 18, radiusX: 18, ear: 0,
  expandedWidth: 520, eyesFollow: true, keepOnTop: true, features: {}, styles: {}
};

/** What the two styles set when you pick them; sliders then tweak from there. */
export const PRESETS: Record<Settings['style'], Partial<Settings>> = {
  floating: { style: 'floating', topOffset: 6, height: 36, radius: 18, radiusX: 18, ear: 0, idleWidth: 132, activeWidth: 280, expandedWidth: 520 },
  notch: { style: 'notch', topOffset: 0, height: 32, radius: 20, radiusX: 20, ear: 15, idleWidth: 288, activeWidth: 340, expandedWidth: 510 }
};

/** The sliders that belong to a style (what gets remembered per style). */
export const LOOK_KEYS = ['idleWidth', 'activeWidth', 'height', 'topOffset', 'radius', 'radiusX', 'ear', 'expandedWidth'] as const;

export interface Control { key: keyof Settings; label: string; min: number; max: number; step: number; notchOnly?: boolean; floatingOnly?: boolean }

export const CONTROLS: Control[] = [
  { key: 'idleWidth', label: 'Idle width', min: 80, max: 560, step: 2 },
  { key: 'activeWidth', label: 'Active width', min: 180, max: 560, step: 2 },
  { key: 'height', label: 'Height', min: 26, max: 64, step: 1 },
  { key: 'topOffset', label: 'Gap from top', min: 0, max: 30, step: 1, floatingOnly: true },
  { key: 'radius', label: 'Bottom curve', min: 4, max: 40, step: 1 },
  { key: 'radiusX', label: 'Side curve', min: 4, max: 260, step: 2 },
  { key: 'ear', label: 'Ear size', min: 0, max: 28, step: 1, notchOnly: true },
  { key: 'expandedWidth', label: 'Opened width', min: 420, max: 600, step: 2 }
];

/**
 * CSS corner radii for the collapsed pill. The horizontal radius is capped so the browser never rescales the vertical one,
 * and in the notch style the side stays straight for as tall as the ears so they join the body cleanly.
 */
export function collapsedRadius(s: Settings, width: number): string {
  const ry = Math.max(0, Math.min(s.radius, s.height - (s.style === 'notch' ? s.ear : 0)));
  const rx = Math.min(s.radiusX, Math.floor(width / 2));
  return s.style === 'notch' ? `0 0 ${rx}px ${rx}px / 0 0 ${ry}px ${ry}px` : `${rx}px / ${ry}px`;
}
