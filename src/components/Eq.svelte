<script lang="ts">
  let { playing = true, bars = 5, height = 14 }: { playing?: boolean; bars?: number; height?: number } = $props();
</script>
<span class="eq" class:on={playing} style:height="{height}px" aria-hidden="true">
  {#each Array(bars) as _, i}<i style:animation-delay="{(i * 0.13) % 0.5}s" style:animation-duration="{0.7 + (i % 3) * 0.18}s"></i>{/each}
</span>
<style>
  .eq { display: inline-flex; align-items: flex-end; gap: 2px; flex: none; }
  i { width: 3px; height: 30%; border-radius: 2px; background: var(--accent); transition: height .3s; }
  .on i { animation: bounce .9s ease-in-out infinite alternate; }
  @keyframes bounce { 0% { height: 25%; } 100% { height: 100%; } }
</style>
