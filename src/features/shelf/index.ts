import type { FeatureCtx, IslandFeature } from '../types';
import { islandEvents } from '../../lib/events';
import ShelfPanel from './ShelfPanel.svelte';
import ShelfSettings from './ShelfSettings.svelte';
import { shelf, applyPayload, setFlash, type ShelfPayload } from './state.svelte';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
const islandEl = () => document.querySelector<HTMLElement>('.island');

/** Window-relative rectangle of the island, ears included (what a drag has to hit). */
function islandRect(): { x: number; y: number; w: number; h: number } | null {
  const el = islandEl();
  if (!el) return null;
  let { left, top, right, bottom } = el.getBoundingClientRect();
  for (const ear of el.querySelectorAll<HTMLElement>('.ear')) {
    const r = ear.getBoundingClientRect();
    left = Math.min(left, r.left); right = Math.max(right, r.right); top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
  }
  return { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) };
}

function init(ctx: FeatureCtx) {
  const refresh = () => ctx.call<ShelfPayload>('list').then((p) => applyPayload(p)).catch(() => {});
  refresh();
  ctx.on((m) => {
    // The Electron side restored click-through (a drag ended, or a dialog closed): re-assert what the island itself wants.
    if ((m as { resync?: boolean } | null)?.resync) setTimeout(resync, 80);
  });

  function resync() {
    // App.svelte owns click-through and hit-tests the real pointer position; ask it to re-assert.
    window.dispatchEvent(new Event('island:resync'));
  }

  // ---- 1. tell Electron where the island is, so it can let a file drag in (see electron/features/shelf/gate.cjs) ----
  let lastKey = '', lastSent = 0;
  setInterval(() => {
    if (!ctx.enabled) return;
    const r = islandRect();
    if (!r) return;
    const passing = !!islandEl()?.classList.contains('passing');
    const key = `${r.x},${r.y},${r.w},${r.h},${passing}`;
    const now = Date.now();
    if (key === lastKey && now - lastSent < 3000) return;
    lastKey = key; lastSent = now;
    ctx.call('rect', { r, passing }).catch(() => {});
  }, 150);

  // ---- 2. file drags over the island ----
  let lastOver = 0, openedForDrop = false, prevView = '', collapseTimer = 0;

  function beginDrag() {
    lastOver = Date.now();
    if (shelf.dragging) return;
    shelf.dragging = true;
    clearTimeout(collapseTimer);
    const s = ctx.store;
    openedForDrop = !s.expanded;
    prevView = s.view;
    s.expanded = true;
    s.view = `f:${ctx.id}`;
  }
  function endDrag(delay: number) {
    if (!shelf.dragging) return;
    shelf.dragging = false;
    const s = ctx.store;
    if (!openedForDrop) return;
    openedForDrop = false;
    // No mouse events arrive during a drag, so the island's own "pointer left" never fires: close it ourselves.
    collapseTimer = window.setTimeout(() => {
      if (islandEl()?.matches(':hover')) return; // the pointer is on it: its own hover logic takes over
      s.expanded = false;
      if (s.view === `f:${ctx.id}` && prevView) s.view = prevView as typeof s.view;
      resync();
    }, delay);
  }
  setInterval(() => { if (shelf.dragging && Date.now() - lastOver > 700) endDrag(400); }, 150);

  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // also stops Electron from navigating to a file dropped outside our zone
    if (ctx.enabled) beginDrag();
  });
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!ctx.enabled) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    beginDrag();
    lastOver = Date.now();
    // The island's own hover-close timer may have fired just as the drag arrived; keep it open while a drag is over it.
    if (!ctx.store.expanded) ctx.store.expanded = true;
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!ctx.enabled) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const paths = files.map((f) => ctx.api.pathForFile(f)).filter(Boolean);
    endDrag(1800);
    if (!paths.length) { setFlash("Couldn't read the dropped items"); return; }
    ctx.call<ShelfPayload>('add', paths).then((p) => {
      applyPayload(p, true);
      if (p?.added) islandEvents.emit('notice', { source: ctx.id, added: p.added });
    }).catch(() => setFlash("Couldn't add the files"));
  });
}

const feature: IslandFeature = {
  id: 'shelf',
  label: 'Drop zone shelf',
  description: 'Drag files onto the island to park them, drag them out later.',
  defaultEnabled: true,
  init,
  badge: { live: () => shelf.items.length > 0, icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z', color: '#8ab4ff' },
  panel: { label: 'Shelf', icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z', component: ShelfPanel, height: 304 },
  settings: ShelfSettings
};
export default feature;
