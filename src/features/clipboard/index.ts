import type { IslandFeature } from '../types';
import { islandEvents } from '../../lib/events';
import { CLIP_ICON } from './icons';
import ClipPill from './ClipPill.svelte';
import ClipPanel from './ClipPanel.svelte';
import ClipSettings from './ClipSettings.svelte';
import { clip, addItem, restoreImages, type ClipItem, type ImageItem } from './state.svelte';

const feature: IslandFeature = {
  id: 'clipboard',
  label: 'Clipboard',
  description: 'A peek when you copy, a short history, and screenshots you can drag out',
  defaultEnabled: true,
  init(ctx) {
    ctx.getConfig<{ peekText?: boolean; keepHistory?: boolean }>().then((c) => {
      clip.cfg.peekText = c?.peekText !== false;
      clip.cfg.keepHistory = c?.keepHistory !== false;
    }).catch(() => {}).then(() => ctx.call<ImageItem[]>('history')).then((items) => { if (items) restoreImages(items); }).catch(() => {});
    ctx.on((data) => {
      const it = data as ClipItem | null;
      if (!it || typeof it !== 'object' || !ctx.enabled) return;
      if (it.kind !== 'text' && it.kind !== 'image') return;
      addItem(it);
      if (it.kind === 'image' && it.screenshot) islandEvents.emit('notice', { source: 'clipboard', kind: 'screenshot' });
    });
  },
  pill: {
    priority: (ctx) => (clip.peek && clip.peekUntil > ctx.store.now ? 88 : null),
    width: () => 360,
    component: ClipPill
  },
  panel: { label: 'Clipboard', icon: CLIP_ICON, component: ClipPanel, height: 250 },
  settings: ClipSettings
};
export default feature;
