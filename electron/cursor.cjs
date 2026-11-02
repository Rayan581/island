// Cursor position relative to the island window. The eyes follow it from anywhere on screen.
function cursorRelative(point, bounds) {
  return { x: point.x - bounds.x, y: point.y - bounds.y };
}
module.exports = { cursorRelative };
