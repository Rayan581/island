<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { FeatureProps } from '../types';
  import { bat } from './state.svelte';
  import { toneFor } from './logic';

  let _props: FeatureProps = $props(); // the pill reads the feature's own state
  const kind = $derived(bat.peek.kind);
  const tone = $derived(toneFor(bat.level, bat.charging, bat.threshold));
  const warning = $derived(kind === 'low' || kind === 'critical');
  const charging = $derived(bat.charging && !warning);

  // The fill and the number are driven by one tween, so they always agree. Plugging in fills from empty (the iPhone feel).
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = $state(untrack(() => (kind === 'plug' && !reduced ? 0 : bat.level)));
  let raf = 0, delay = 0, first = true;
  function tweenTo(target: number, ms: number) {
    cancelAnimationFrame(raf);
    if (reduced) { shown = target; return; }
    const from = shown, t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      shown = from + (target - from) * (1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  $effect(() => {
    const target = bat.level;
    untrack(() => {
      if (first && kind === 'plug') { first = false; delay = window.setTimeout(() => tweenTo(target, 1100), 160); }
      else { first = false; tweenTo(target, 450); }
    });
  });
  onDestroy(() => { cancelAnimationFrame(raf); clearTimeout(delay); });

  const label = $derived(warning ? 'Low battery' : kind === 'plug' ? (bat.level >= 100 ? 'Fully charged' : 'Charging') : 'On battery');
  const pct = $derived(Math.round(shown));
</script>

{#key bat.peek.id}
  <span class="batt {tone}" class:charging class:warn={warning} aria-hidden="true">
    <span class="body">
      <span class="fill" style:width="{shown > 0 ? Math.max(shown, 4) : 0}%"></span>
      <svg class="bolt" viewBox="0 0 12 18" aria-hidden="true"><path d="M7.4 0.6 1 10.2h4.2L4.4 17.4 11 7.6H6.8z" /></svg>
    </span>
    <span class="nub"></span>
  </span>
  <span class="text ellipsis">{label}</span>
  <span class="trail tnum pct {tone}">{pct}%</span>
{/key}

<style>
  .batt { --c: #fff; --glow: transparent; position: relative; display: inline-flex; align-items: center; flex: none; height: 16px; }
  .batt.charging { --c: #30d158; --glow: rgba(48,209,88,.55); }
  .batt.low { --c: var(--attn); --glow: rgba(245,181,68,.45); }
  .batt.critical { --c: #ff453a; --glow: rgba(255,69,58,.5); }
  .body { position: relative; width: 31px; height: 16px; border-radius: 5px; padding: 1.5px; overflow: hidden;
          box-shadow: inset 0 0 0 1.4px rgba(255,255,255,.38); background: rgba(255,255,255,.08); }
  .fill { position: relative; display: block; height: 100%; border-radius: 3.5px; overflow: hidden;
          background: linear-gradient(180deg, color-mix(in srgb, var(--c) 82%, #fff), var(--c) 60%); }
  .nub { width: 2px; height: 6px; margin-left: 1.5px; border-radius: 0 2px 2px 0; background: rgba(255,255,255,.4); }
  .batt.charging .nub { background: var(--c); }
  .batt.charging { filter: drop-shadow(0 0 3px var(--glow)); animation: glow 1.8s ease-in-out infinite; }
  /* a soft highlight sweeps through the fill while charging */
  .batt.charging .fill::after { content: ''; position: absolute; inset: 0 auto 0 0; width: 55%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); transform: translateX(-120%); animation: sweep 1.5s ease-in-out .5s infinite; }
  .bolt { position: absolute; left: 50%; top: 50%; width: 9px; height: 13px; margin: -6.5px 0 0 -4.5px; fill: #fff; opacity: 0;
          stroke: rgba(0,0,0,.55); stroke-width: .9px; paint-order: stroke; stroke-linejoin: round; }
  .batt.charging .bolt { opacity: 1; animation: pop .5s var(--ease) .1s backwards, bolt 1.8s ease-in-out .6s infinite; }
  .batt.warn .fill { animation: pulse .7s ease-in-out 3; }
  .batt.warn { animation: shake .5s ease-in-out .1s; }
  .pct { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  .pct.charging { color: #30d158; } .pct.low { color: var(--attn); } .pct.critical { color: #ff453a; }
  @keyframes sweep { to { transform: translateX(260%); } }
  @keyframes glow { 50% { filter: drop-shadow(0 0 6px var(--glow)); } }
  @keyframes pop { from { opacity: 0; transform: scale(.2) rotate(-18deg); } 60% { transform: scale(1.35); } }
  @keyframes bolt { 50% { transform: scale(1.12); } }
  @keyframes shake { 20% { transform: translateX(-2px); } 40% { transform: translateX(2px); } 60% { transform: translateX(-1px); } }
</style>
