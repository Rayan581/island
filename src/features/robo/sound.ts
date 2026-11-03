import type { Mood } from '../../lib/mood.svelte';

// Tiny synthesized blips, only when the user turns "Sounds" on. [frequency Hz, seconds] steps, or a slide.
const NOTES: Partial<Record<Mood, { steps?: [number, number][]; slide?: [number, number, number] }>> = {
  happy: { steps: [[660, 0.07], [880, 0.1]] },
  love: { steps: [[660, 0.07], [784, 0.07], [988, 0.12]] },
  wink: { steps: [[920, 0.06]] },
  surprised: { steps: [[420, 0.05], [640, 0.08]] },
  dizzy: { slide: [520, 300, 0.45] },
  yawn: { slide: [380, 210, 0.6] }
};

let ac: AudioContext | null = null;

export function playMood(mood: Mood) {
  const n = NOTES[mood];
  if (!n) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    const t0 = ac.currentTime + 0.01;
    const blip = (f0: number, f1: number, at: number, dur: number) => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.035, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(ac!.destination);
      o.start(at); o.stop(at + dur + 0.02);
    };
    if (n.slide) blip(n.slide[0], n.slide[1], t0, n.slide[2]);
    else if (n.steps) { let t = t0; for (const [f, d] of n.steps) { blip(f, f, t, d); t += d * 0.9; } }
  } catch { /* no audio available */ }
}
