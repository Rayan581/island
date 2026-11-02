<script lang="ts">
  import { cursor } from '../lib/cursor.svelte';
  import { robo, type Mood } from '../lib/mood.svelte';

  let { size = 1, follow = true, mood = undefined }: { size?: number; follow?: boolean; mood?: Mood } = $props();
  const shown = $derived(mood ?? robo.mood);
  let el: HTMLElement | undefined = $state();
  let dx = $state(0), dy = $state(0);
  let blinking = $state<'' | 'one' | 'two'>('');

  // Always look toward the cursor, wherever it is on screen. A brief glance (Robo idling) overrides it.
  $effect(() => {
    const { x, y, near } = cursor;
    const g = robo.glance;
    if (g) { dx = g * 3 * size; dy = 0.4 * size; return; }
    if (!el || !follow || !near) { dx = 0; dy = 0; return; }
    const r = el.getBoundingClientRect();
    const vx = x - (r.left + r.width / 2), vy = y - (r.top + r.height / 2), d = Math.hypot(vx, vy);
    if (r.width === 0) { dx = 0; dy = 0; return; }
    const lean = Math.min(1, d / 36); // right on top of the eyes: relax; a little way off: look fully
    dx = (vx / (d || 1)) * 3.5 * size * lean;
    dy = (vy / (d || 1)) * 2.5 * size * lean;
  });

  // An extra blink on request (a notice arrived, or Robo is feeling lively).
  let blinkTimer = 0, seen = robo.blinkTick;
  $effect(() => {
    const t = robo.blinkTick;
    if (t === seen) return;
    seen = t;
    blinking = robo.blinkKind === 2 ? 'two' : 'one';
    clearTimeout(blinkTimer);
    blinkTimer = window.setTimeout(() => (blinking = ''), 800);
  });
</script>
<span class="eyes {shown}" class:one={blinking === 'one'} class:two={blinking === 'two'} bind:this={el} style:--k={size} style:--dx="{dx.toFixed(2)}px" style:--dy="{dy.toFixed(2)}px" aria-label="Robo"><i></i><i></i></span>
<style>
  .eyes { --c: #c4f5d2; --e: cubic-bezier(.3, .9, .3, 1);
          display: inline-flex; gap: calc(6px * var(--k)); align-items: center; transform: translate(var(--dx, 0), var(--dy, 0)); transition: transform .14s ease-out; }
  /* Each eye is a fixed-size slot, so a mood never moves anything around it. The slot blinks; ::before is the
     solid eye, ::after the happy arc, and only transform / opacity / border-radius change between moods. */
  i { position: relative; width: calc(7px * var(--k)); height: calc(11px * var(--k)); animation: blink 5s infinite; }
  i::before, i::after { content: ''; position: absolute; left: 50%; top: 50%; box-sizing: border-box;
                        transition: transform .26s var(--e), opacity .2s ease, border-radius .26s var(--e); }
  i::before { width: 100%; height: 100%; margin: calc(-5.5px * var(--k)) 0 0 calc(-3.5px * var(--k)); border-radius: 50%; background: var(--c);
              box-shadow: 0 0 calc(8px * var(--k)) rgba(160, 245, 190, .35); }
  i::after  { width: calc(11px * var(--k)); height: calc(6px * var(--k)); margin: calc(-4px * var(--k)) 0 0 calc(-5.5px * var(--k));
              border: calc(2.8px * var(--k)) solid var(--c); border-bottom: 0; border-radius: 50% 50% 0 0 / 100% 100% 0 0;
              filter: drop-shadow(0 0 calc(4px * var(--k)) rgba(160, 245, 190, .45)); opacity: 0; transform: translateY(calc(1.5px * var(--k))) scale(.6); }

  /* squint: flat-topped, wide and low, brows slanted in toward the middle */
  .squint i::before { transform: scale(1.18, .5); border-radius: 30% 30% 50% 50% / 24% 24% 76% 76%; }
  .squint i:first-child::before { transform: scale(1.18, .5) rotate(5deg); }
  .squint i:last-child::before { transform: scale(1.18, .5) rotate(-5deg); }

  /* happy: the solid eye melts away and an upward arc fades in */
  .happy i { animation: none; }
  .happy i::before { opacity: 0; transform: scale(1.1, .3); }
  .happy i::after { opacity: 1; transform: translateY(0) scale(1); }

  /* surprised: taller, rounder, with a quick pop */
  .surprised i::before { transform: scale(1.3, 1.22); animation: pop .34s var(--e); }

  /* sleepy: half-closed with a drooping lid, dimmer, and a slow heavy blink */
  .sleepy i { animation: sleepblink 7s infinite; }
  .sleepy i::before { transform: translateY(calc(1.6px * var(--k))) scale(1.08, .46); border-radius: 22% 22% 50% 50% / 14% 14% 86% 86%; opacity: .78; }

  .one i { animation: blink1 .3s ease-in-out 1; }
  .two i { animation: blink2 .75s ease-in-out 1; }

  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.12); } }
  @keyframes blink1 { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.1); } }
  @keyframes blink2 { 0%, 100% { transform: scaleY(1); } 18%, 62% { transform: scaleY(.1); } 40% { transform: scaleY(1); } }
  @keyframes sleepblink { 0%, 86%, 100% { transform: scaleY(1); } 91%, 94% { transform: scaleY(.08); } }
  @keyframes pop { 0% { transform: scale(.8, .8); } 55% { transform: scale(1.5, 1.4); } 100% { transform: scale(1.3, 1.22); } }
  @media (prefers-reduced-motion: reduce) { i, i::before, i::after { animation: none !important; transition: none !important; } }
</style>
