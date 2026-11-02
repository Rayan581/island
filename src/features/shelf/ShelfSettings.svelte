<script lang="ts">
  import type { FeatureProps } from '../types';
  import { shelf } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const helperOk = $derived(ctx.store.config.helper === 'running');
</script>

<div class="note">
  {shelf.items.length} of {shelf.max} on the shelf.
  {#if ctx.store.config.platform === 'win32' && !helperOk}
    Dropping onto the island needs the helper (<code>npm run build:helper</code>); “Add files…” in the Shelf tab always works.
  {:else}
    Drop files on the island, or use “Add files…” in the Shelf tab.
  {/if}
</div>

<style>
  .note { color: var(--mute); font-size: 11px; font-weight: 500; line-height: 1.4; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; color: var(--ink); }
</style>
