<script lang="ts">
  import { inkFor } from './state.svelte';
  let { color, initial, size = 22 }: { color: string; initial: string; size?: number } = $props();
</script>

<span class="tile" style:width="{size}px" style:height="{size}px" style:background={color} style:color={inkFor(color)}
      style:border-radius="{Math.round(size * 0.32)}px" style:font-size="{Math.round(size * 0.55)}px" aria-hidden="true">{initial}</span>

<style>
  .tile { display: inline-grid; place-items: center; flex: none; font-weight: 700; line-height: 1; letter-spacing: 0; }
</style>
