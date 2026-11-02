export interface DownloadItem { name: string; path: string; size: number; ext: string; at: number; icon: string | null }

/** Module-level state shared by the pill, the badge and the panel. */
export const dl = $state({
  items: [] as DownloadItem[],
  /** Pill takeover ends at this time (ms, Date.now() clock). */
  flashUntil: 0
});

export const FLASH_MS = 6000;
export const BADGE_MS = 60000;
export const MAX_ITEMS = 8;

export function addDownload(item: DownloadItem) {
  dl.items = [item, ...dl.items.filter((x) => x.path !== item.path)].slice(0, MAX_ITEMS);
  dl.flashUntil = Date.now() + FLASH_MS;
}

export function removeDownload(path: string) { dl.items = dl.items.filter((x) => x.path !== path); }
