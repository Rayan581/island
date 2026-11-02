<script lang="ts">
  import { cursor } from '../lib/cursor.svelte';

  let { size = 1, follow = true }: { size?: number; follow?: boolean } = $props();
  let el: HTMLElement | undefined = $state();
  let dx = $state(0), dy = $state(0);

  // Always look toward the cursor, wherever it is on screen.
  $effect(() => {
    const { x, y, near } = cursor;
    if (!el || !follow || !near) { dx = 0; dy = 0; return; }
    const r = el.getBoundingClientRect();
    const vx = x - (r.left + r.width / 2), vy = y - (r.top + r.height / 2), d = Math.hypot(vx, vy);
    if (r.width === 0) { dx = 0; dy = 0; return; }
    const lean = Math.min(1, d / 36); // right on top of the eyes: relax; a little way off: look fully
    dx = (vx / (d || 1)) * 3.5 * size * lean;
    dy = (vy / (d || 1)) * 2.5 * size * lean;
  });
</script>
<span class="eyes" bind:this={el} style:--k={size} style:--dx="{dx.toFixed(2)}px" style:--dy="{dy.toFixed(2)}px" aria-label="Robo"><i></i><i></i></span>
<style>
  .eyes { display: inline-flex; gap: calc(6px * var(--k)); align-items: center; transform: translate(var(--dx, 0), var(--dy, 0)); transition: transform .14s ease-out; }
  i { width: calc(7px * var(--k)); height: calc(11px * var(--k)); border-radius: 50%; background: #c4f5d2;
      box-shadow: 0 0 8px rgba(160,245,190,.35); animation: blink 5s infinite; }
  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.12); } }
</style>
