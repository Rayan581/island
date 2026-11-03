<script lang="ts">
  import { cursor } from '../lib/cursor.svelte';
  import { robo, type Mood } from '../lib/mood.svelte';

  let { size = 1, follow = true, mood = undefined }: { size?: number; follow?: boolean; mood?: Mood } = $props();
  const shown = $derived(mood ?? robo.mood);
  /** Tiny props that go with a mood (sparkles, hearts, a sweat drop, z's, a note). */
  const FX: Partial<Record<Mood, string>> = { sleepy: 'z', love: 'heart', worried: 'sweat', music: 'note', happy: 'sparkle' };
  const fx = $derived(FX[shown] ?? '');
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
<span class="eyes {shown}" class:one={blinking === 'one'} class:two={blinking === 'two'} bind:this={el} style:--k={size} style:--dx="{dx.toFixed(2)}px" style:--dy="{dy.toFixed(2)}px" aria-label="Robo"><i></i><i></i>{#if fx === 'z'}<b class="fx z" aria-hidden="true"><u class="a">z</u><u class="b">z</u></b>{:else if fx === 'note'}<b class="fx note" aria-hidden="true"><u class="a">♪</u></b>{:else if fx === 'heart'}<b class="fx heart" aria-hidden="true"><svg class="a" viewBox="0 0 10 9"><path d="M5 9C-3 4 1.5-1 5 2.6 8.5-1 13 4 5 9z"/></svg><svg class="b" viewBox="0 0 10 9"><path d="M5 9C-3 4 1.5-1 5 2.6 8.5-1 13 4 5 9z"/></svg></b>{:else if fx === 'sparkle'}<b class="fx sparkle" aria-hidden="true"><svg class="a" viewBox="0 0 10 10"><path d="M5 0 6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8z"/></svg><svg class="b" viewBox="0 0 10 10"><path d="M5 0 6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8z"/></svg></b>{:else if fx === 'sweat'}<b class="fx sweat" aria-hidden="true"><svg class="a" viewBox="0 0 10 12"><path d="M5 0C5 0 0 6 0 8.2A5 5 0 0 0 10 8.2C10 6 5 0 5 0z"/></svg></b>{/if}</span>
<style>
  .eyes { position: relative; --c: #c4f5d2; --e: cubic-bezier(.3, .9, .3, 1);
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
  .squint i:first-of-type::before { transform: scale(1.18, .5) rotate(5deg); }
  .squint i:last-of-type::before { transform: scale(1.18, .5) rotate(-5deg); }

  /* happy: the solid eye melts away and an upward arc fades in */
  .happy i { animation: none; }
  .happy i::before { opacity: 0; transform: scale(1.1, .3); }
  .happy i::after { opacity: 1; transform: translateY(0) scale(1); }

  /* surprised: taller, rounder, with a quick pop */
  .surprised i::before { transform: scale(1.3, 1.22); animation: pop .34s var(--e); }

  /* sleepy: half-closed with a drooping lid, dimmer, and a slow heavy blink */
  .sleepy i { animation: sleepblink 7s infinite; }
  .sleepy i::before { transform: translateY(calc(1.6px * var(--k))) scale(1.08, .46); border-radius: 22% 22% 50% 50% / 14% 14% 86% 86%; opacity: .78; }

  /* wink: the right eye closes into the happy arc while the left stays open */
  .wink i:last-of-type { animation: none; }
  .wink i:last-of-type::before { opacity: 0; transform: scale(1.1, .3); }
  .wink i:last-of-type::after { opacity: 1; transform: translateY(0) scale(1); }

  /* curious: a little wider awake, with a soft glow */
  .curious i::before { transform: scale(1.14, 1.12); box-shadow: 0 0 calc(10px * var(--k)) rgba(160, 245, 190, .5); }

  /* love: heart-shaped eyes that pulse (pink) */
  .love i { animation: none; filter: drop-shadow(0 0 calc(3px * var(--k)) rgba(255, 120, 170, .55)); }
  .love i::before { background: #ff9ec1; box-shadow: none; transform: scale(1.5, 1.02); border-radius: 0; animation: heartbeat .7s ease-in-out infinite;
    clip-path: polygon(50% 100%, 12% 62%, 3% 40%, 4% 22%, 14% 8%, 30% 4%, 42% 12%, 50% 24%, 58% 12%, 70% 4%, 86% 8%, 96% 22%, 97% 40%, 88% 62%); }

  /* dizzy: each eye is a spiral that keeps spinning, with a little wobble */
  .dizzy { animation: wobble .5s ease-in-out infinite; }
  .dizzy i { animation: none; filter: drop-shadow(0 0 calc(3px * var(--k)) rgba(160, 245, 190, .45)); }
  .dizzy i::before { width: calc(12px * var(--k)); height: calc(12px * var(--k)); margin: calc(-6px * var(--k)) 0 0 calc(-6px * var(--k));
    border-radius: 50%; box-shadow: none; transform: none; animation: swirl .65s linear infinite;
    background: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M12.80%2012.00%20L12.91%2012.25%20L12.94%2012.56%20L12.85%2012.89%20L12.65%2013.22%20L12.34%2013.49%20L11.92%2013.67%20L11.44%2013.73%20L10.92%2013.64%20L10.41%2013.39%20L9.97%2012.98%20L9.64%2012.43%20L9.47%2011.77%20L9.48%2011.05%20L9.71%2010.33%20L10.14%209.67%20L10.77%209.13%20L11.56%208.76%20L12.46%208.61%20L13.40%208.72%20L14.31%209.10%20L15.12%209.73%20L15.74%2010.59%20L16.13%2011.63%20L16.22%2012.77%20L16.00%2013.92%20L15.45%2015.01%20L14.60%2015.94%20L13.51%2016.63%20L12.23%2017.01%20L10.85%2017.03%20L9.48%2016.67%20L8.23%2015.94%20L7.19%2014.87%20L6.46%2013.53%20L6.11%2012.00%20L6.18%2010.39%20L6.69%208.83%20L7.63%207.43%20L8.93%206.30%20L10.53%205.55%20L12.30%205.24%20L14.13%205.43%20L15.89%206.11%20L17.42%207.26%20L18.62%208.81%20L19.37%2010.66%20L19.60%2012.68%20L19.28%2014.73%20L18.41%2016.66%20L17.03%2018.31%20L15.23%2019.55%20L13.12%2020.29%20L10.86%2020.43%20L8.60%2019.96%20L6.51%2018.88%20L4.76%2017.26%20L3.49%2015.19%20L2.80%2012.83%20L2.77%2010.33%20L3.42%207.87%20L4.72%205.64%20L6.59%203.81%20L8.92%202.53%20L11.55%201.90%20L14.28%202.01%20L16.93%202.84%20L19.29%204.38%20L21.18%206.52%20L22.44%209.12%20L22.98%2012.00'%20fill='none'%20stroke='%23c4f5d2'%20stroke-width='2.6'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }

  /* worried: eyes tilt in, a little smaller, trembling */
  .worried { animation: tremble .16s linear infinite; }
  .worried i::before { transform: scale(.88, .98); opacity: .92; }
  .worried i:first-of-type::before { transform: scale(.88, .98) rotate(13deg); }
  .worried i:last-of-type::before { transform: scale(.88, .98) rotate(-13deg); }

  /* determined (focus): sharp, flat-topped and tilted, a touch brighter */
  .determined i::before { transform: scale(1.12, .74); border-radius: 26% 26% 50% 50% / 20% 20% 80% 80%; box-shadow: 0 0 calc(9px * var(--k)) rgba(160, 245, 190, .5); }
  .determined i:first-of-type::before { transform: scale(1.12, .74) rotate(11deg); }
  .determined i:last-of-type::before { transform: scale(1.12, .74) rotate(-11deg); }

  /* bored: flat, half-lidded, slow blinks (the controller adds the sideways looks) */
  .bored i { animation: sleepblink 5s infinite; }
  .bored i::before { transform: scale(1.08, .52); border-radius: 22% 22% 50% 50% / 16% 16% 84% 84%; opacity: .9; }

  /* yawn: the eyes squeeze shut and open again */
  .yawn i { animation: yawn 1.6s ease-in-out 1; }
  .yawn i::before { transform: scale(1.1, .85); }

  /* tired: drooping outer corners, dim, heavy blinks */
  .tired i { animation: sleepblink 4s infinite; }
  .tired i::before { opacity: .74; border-radius: 22% 22% 50% 50% / 14% 14% 86% 86%; transform: translateY(calc(1.4px * var(--k))) scale(1.05, .6); }
  .tired i:first-of-type::before { transform: translateY(calc(1.4px * var(--k))) scale(1.05, .6) rotate(-9deg); }
  .tired i:last-of-type::before { transform: translateY(calc(1.4px * var(--k))) scale(1.05, .6) rotate(9deg); }

  /* music: a gentle bob to the beat */
  .music { animation: bob .9s ease-in-out infinite; }

  /* props: tiny and above-right of the eyes */
  .fx { position: absolute; left: calc(100% + 1px * var(--k)); top: calc(-1px * var(--k)); width: 0; height: 0; pointer-events: none; color: var(--c); }
  .fx u { position: absolute; left: 0; top: 0; text-decoration: none; font: 700 calc(7px * var(--k)) / 1 ui-rounded, system-ui, sans-serif; opacity: 0; animation: floatUp 2.6s ease-out infinite; }
  .fx .b { animation-delay: 1.3s; }
  .fx u.b { font-size: calc(9px * var(--k)); }
  .fx svg { position: absolute; left: 0; top: 0; width: calc(7px * var(--k)); height: calc(7px * var(--k)); fill: currentColor; opacity: 0; }
  .heart svg { fill: #ff8fb3; animation: floatUp 2s ease-out infinite; }
  .heart svg.b { animation-delay: 1s; left: calc(3px * var(--k)); }
  .sparkle svg { fill: #fff3b0; animation: twinkle 1.6s ease-in-out infinite; }
  .sparkle svg.a { top: calc(-4px * var(--k)); left: calc(1px * var(--k)); }
  .sparkle svg.b { width: calc(5px * var(--k)); height: calc(5px * var(--k)); top: calc(1px * var(--k)); left: calc(5px * var(--k)); animation-delay: .8s; }
  .sweat svg { fill: #82cbff; width: calc(5px * var(--k)); height: calc(6px * var(--k)); animation: drip 1.5s ease-in infinite; }

  .one i { animation: blink1 .3s ease-in-out 1; }
  .two i { animation: blink2 .75s ease-in-out 1; }

  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.12); } }
  @keyframes blink1 { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.1); } }
  @keyframes blink2 { 0%, 100% { transform: scaleY(1); } 18%, 62% { transform: scaleY(.1); } 40% { transform: scaleY(1); } }
  @keyframes sleepblink { 0%, 86%, 100% { transform: scaleY(1); } 91%, 94% { transform: scaleY(.08); } }
  @keyframes heartbeat { 0%, 100% { transform: scale(1.5, 1.02); } 50% { transform: scale(1.68, 1.16); } }
  @keyframes swirl { to { transform: rotate(360deg); } }
  @keyframes wobble { 0%, 100% { translate: -1px 0; } 50% { translate: 1px 0; } }
  @keyframes tremble { 0%, 100% { translate: -.5px 0; } 50% { translate: .5px 0; } }
  @keyframes bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -1.4px; } }
  @keyframes yawn { 0%, 100% { transform: scaleY(1); } 25%, 75% { transform: scale(1.12, .1); } }
  @keyframes floatUp { 0% { opacity: 0; transform: translate(0, 3px) scale(.6); } 20% { opacity: .95; } 100% { opacity: 0; transform: translate(4px, -6px) scale(1); } }
  @keyframes twinkle { 0%, 100% { opacity: 0; transform: scale(.4) rotate(0deg); } 45% { opacity: 1; transform: scale(1) rotate(25deg); } }
  @keyframes drip { 0% { opacity: 0; transform: translateY(-1px); } 25% { opacity: .95; } 100% { opacity: 0; transform: translateY(6px); } }
  @keyframes pop { 0% { transform: scale(.8, .8); } 55% { transform: scale(1.5, 1.4); } 100% { transform: scale(1.3, 1.22); } }
  @media (prefers-reduced-motion: reduce) { i, i::before, i::after { animation: none !important; transition: none !important; } }
</style>
