<script lang="ts">
  let { src, size = 40, radius = 10 }: { src: string | null; size?: number; radius?: number } = $props();
</script>
<span class="art" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px"
  style:background-image={src ? `url("${src}")` : 'none'}>
  {#if !src}<svg viewBox="0 0 24 24" width={size * 0.45} height={size * 0.45} fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>{/if}
</span>
<style>
  .art { display: inline-grid; place-items: center; flex: none; background: var(--accent-deep) center/cover no-repeat; color: rgba(255,255,255,.6);
         box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); transition: background-image .3s; }
</style>
