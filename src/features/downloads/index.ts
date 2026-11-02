import type { IslandFeature } from '../types';
import { islandEvents } from '../../lib/events';
import DownloadPill from './DownloadPill.svelte';
import DownloadsPanel from './DownloadsPanel.svelte';
import { dl, addDownload, BADGE_MS, type DownloadItem } from './state.svelte';

const isItem = (d: unknown): d is DownloadItem =>
  !!d && typeof (d as DownloadItem).path === 'string' && typeof (d as DownloadItem).name === 'string';

const feature: IslandFeature = {
  id: 'downloads',
  label: 'Download done',
  description: 'Shows a finished download in the pill; hover to open it or show it in its folder.',
  defaultEnabled: true,
  init(ctx) {
    (window as unknown as { __downloads: unknown }).__downloads = { dl, add: addDownload }; // handy in devtools
    ctx.on((d) => {
      if (!ctx.enabled || !isItem(d)) return;
      addDownload({ name: d.name, path: d.path, size: Number(d.size) || 0, ext: d.ext || '', at: Date.now(), icon: d.icon || null });
      islandEvents.emit('notice', { source: 'downloads', name: d.name });
    });
    // After a renderer reload the Electron side still remembers the recent downloads.
    ctx.call<DownloadItem[] | null>('list').then((l) => {
      if (Array.isArray(l) && !dl.items.length) dl.items = l.filter(isItem).slice(0, 8);
    }).catch(() => {});
  },
  pill: {
    priority: (ctx) => (dl.items.length && dl.flashUntil > ctx.store.now ? 86 : null),
    width: () => 300,
    component: DownloadPill
  },
  badge: {
    live: (ctx) => !!dl.items[0] && ctx.store.now - dl.items[0].at < BADGE_MS,
    icon: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    color: 'var(--done)'
  },
  panel: { label: 'Downloads', icon: 'M12 4v11M7 11l5 5 5-5M5 20h14', component: DownloadsPanel, height: 252 }
};
export default feature;
