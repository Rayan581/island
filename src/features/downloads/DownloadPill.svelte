<script lang="ts">
  import type { FeatureProps } from '../types';
  import FileIcon from './FileIcon.svelte';
  import { formatSize } from './format';
  import { dl } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const item = $derived(dl.items[0]);
</script>

{#if item}
  {#key item.path + item.at}
    <FileIcon {item} size={22} check />
    <span class="text ellipsis name" title={item.name}>{item.name}</span>
    <span class="trail tnum dim">{formatSize(item.size)}</span>
  {/key}
{/if}

<style>
  .name { animation: rise .35s var(--ease); }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } }
</style>
