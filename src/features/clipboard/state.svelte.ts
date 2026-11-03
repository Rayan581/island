export interface TextItem { kind: 'text'; id: string; text: string; line: string; chars: number; truncated?: boolean; at: number }
export interface ImageItem { kind: 'image'; id: string; file: string; thumb: string; w: number; h: number; at: number; screenshot?: boolean; replaces?: string }
export type ClipItem = TextItem | ImageItem;

export const MAX_TEXTS = 20, MAX_IMAGES = 10;
export const TEXT_PEEK_MS = 2500, IMAGE_PEEK_MS = 4000;

export const clip = $state({
  texts: [] as TextItem[],
  images: [] as ImageItem[],
  /** The item the pill is showing, until `peekUntil`. */
  peek: null as ClipItem | null,
  peekUntil: 0,
  /** Which row/tile just got copied back (for the "Copied" feedback). */
  copiedId: '',
  copiedUntil: 0,
  cfg: { peekText: true, keepHistory: true }
});

export function markCopied(id: string) {
  clip.copiedId = id;
  clip.copiedUntil = Date.now() + 1400;
}

/** Add an item pushed by the Electron side. Returns true if it should be announced in the pill. */
export function addItem(it: ClipItem): boolean {
  if (it.kind === 'text') {
    if (clip.cfg.keepHistory) clip.texts = [it, ...clip.texts.filter((t) => t.text !== it.text)].slice(0, MAX_TEXTS);
    if (!clip.cfg.peekText) return false;
    clip.peek = it; clip.peekUntil = Date.now() + TEXT_PEEK_MS;
    return true;
  }
  let shown: ImageItem = it;
  // Same id = the same capture, now known to be a screenshot (its file appeared in Pictures\Screenshots): update in place.
  const i = clip.images.findIndex((x) => x.id === it.id);
  if (i >= 0) {
    shown = { ...clip.images[i], ...it };
    clip.images[i] = shown;
  } else if (clip.cfg.keepHistory) {
    clip.images = [it, ...clip.images].slice(0, MAX_IMAGES);
  }
  clip.peek = shown; clip.peekUntil = Date.now() + IMAGE_PEEK_MS;
  return true;
}

/** Images saved by an earlier run (newest first); anything that arrived since startup stays on top. */
export function restoreImages(items: ImageItem[]) {
  if (!clip.cfg.keepHistory || !Array.isArray(items)) return;
  const have = new Set(clip.images.map((i) => i.file));
  clip.images = [...clip.images, ...items.filter((i) => i && i.kind === 'image' && !have.has(i.file))].slice(0, MAX_IMAGES);
}

export function clearAll() {
  clip.texts = []; clip.images = []; clip.peek = null; clip.peekUntil = 0;
}
