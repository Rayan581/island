// Picks a vivid, readable accent from album art: the most saturated mid-brightness colour, weighted by how common it is.
export interface Accent { h: number; s: number; l: number }

export const fallbackAccent = (seed: string): Accent => {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return { h: Math.abs(h) % 360, s: 62, l: 55 };
};

function rgbToHsl(r: number, g: number, b: number): Accent {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}

export function accentFromImage(src: string): Promise<Accent | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const N = 24, c = document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      const buckets = new Map<number, { n: number; score: number; h: number; s: number; l: number }>();
      for (let i = 0; i < d.length; i += 4) {
        const p = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        if (p.l < 12 || p.l > 90 || p.s < 18) continue;
        const k = Math.round(p.h / 20);
        const b = buckets.get(k) ?? { n: 0, score: 0, h: 0, s: 0, l: 0 };
        const w = (p.s / 100) * (1 - Math.abs(p.l - 52) / 52);
        b.n++; b.score += w; b.h += p.h * w; b.s += p.s * w; b.l += p.l * w;
        buckets.set(k, b);
      }
      const best = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < 0.6) return resolve(null);
      resolve({
        h: Math.round(best.h / best.score),
        s: Math.round(Math.min(85, Math.max(48, best.s / best.score))),
        l: Math.round(Math.min(64, Math.max(46, best.l / best.score)))
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
