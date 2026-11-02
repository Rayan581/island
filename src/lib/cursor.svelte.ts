// Where the cursor is, in the island window's own coordinates. Fed by the main process because the window is click-through.
export const cursor = $state({ x: 0, y: 0, near: false });
