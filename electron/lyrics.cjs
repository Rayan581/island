// Synced lyrics from LRCLIB (https://lrclib.net), cached on disk.
const fs = require('fs');

const UA = 'Island/0.1 (desktop dynamic island; https://github.com/)';
const MISS_RETRY_MS = 7 * 24 * 3600 * 1000;
const MAX_ENTRIES = 800;

function parseLRC(lrc) {
  const out = [];
  for (const line of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

// "Song - Remastered 2011", "Song (feat. X)", "Song [Live]" -> "Song"
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[([].*?(feat\.|ft\.|with |remaster|live|version|edit|mono|stereo|deluxe|bonus).*?[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|live|version|edit|mono|stereo|mix).*$/i, '')
    .trim();
}
const firstArtist = (a) => String(a || '').split(/,|&| feat\.| ft\.| x /i)[0].trim();

class Lyrics {
  constructor(cacheFile, fetchImpl = globalThis.fetch) {
    this.file = cacheFile; this.fetch = fetchImpl; this.inflight = new Map();
    try { this.cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { this.cache = {}; }
  }
  key({ title, artist }) { return `${cleanTitle(title).toLowerCase()}|${firstArtist(artist).toLowerCase()}`; }
  save() {
    const keys = Object.keys(this.cache);
    if (keys.length > MAX_ENTRIES) keys.sort((a, b) => this.cache[a].at - this.cache[b].at).slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete this.cache[k]);
    try { fs.writeFileSync(this.file, JSON.stringify(this.cache)); } catch {}
  }
  async get(track) {
    if (!track?.title) return null;
    const k = this.key(track), hit = this.cache[k];
    if (hit && (hit.lines || Date.now() - hit.at < MISS_RETRY_MS)) return hit.lines ? hit : null;
    if (this.inflight.has(k)) return this.inflight.get(k);
    const p = this.lookup(track).then((res) => {
      this.cache[k] = { at: Date.now(), ...(res || {}) }; this.save(); this.inflight.delete(k);
      return res;
    }).catch(() => { this.inflight.delete(k); return null; }); // network errors are not cached
    this.inflight.set(k, p);
    return p;
  }
  async api(path, params) {
    const r = await this.fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`, { headers: { 'User-Agent': UA } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`LRCLIB ${r.status}`);
    return r.json();
  }
  async lookup({ title, artist, album, duration }) {
    const tn = cleanTitle(title), an = firstArtist(artist);
    const pick = (rec) => rec && (rec.syncedLyrics || rec.instrumental)
      ? { lines: rec.instrumental ? [] : parseLRC(rec.syncedLyrics), instrumental: !!rec.instrumental } : null;
    if (album && duration) {
      const r = pick(await this.api('get', { track_name: tn, artist_name: an, album_name: album, duration: Math.round(duration) }));
      if (r) return r;
    }
    const list = (await this.api('search', { track_name: tn, artist_name: an })) || [];
    const synced = list.filter((x) => x.syncedLyrics);
    if (!synced.length) return null;
    if (duration) synced.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
    if (duration && Math.abs(synced[0].duration - duration) > 6) return null; // probably a different recording
    return pick(synced[0]);
  }
}

module.exports = { Lyrics, parseLRC, cleanTitle, firstArtist };
