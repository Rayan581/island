// Where the cursor is, in the island window's own coordinates. Fed by the main process because the window is click-through.
/** System-wide idle time as last reported by the main process; s = -1 until the first report. */
export const sysIdle = $state({ s: -1, at: 0 });
export const cursor = $state({ x: 0, y: 0, near: false });
