<script lang="ts">
  import type { FeatureProps } from '../types';
  import AppTile from './AppTile.svelte';
  import { nstate } from './state.svelte';

  let {}: FeatureProps = $props();
  const n = $derived(nstate.current);
</script>

{#if n}
  {#key n.id}
    <span class="in"><AppTile color={n.color} initial={n.initial} size={22} /></span>
    <span class="text ellipsis in" title={n.app}><b>{n.title}</b>{#if n.body}<span class="dim sep">· {n.body}</span>{/if}</span>
  {/key}
  {#if nstate.queued > 0}<span class="more tnum">+{nstate.queued}</span>{/if}
{/if}

<style>
  .in { animation: rise .32s var(--ease); display: inline-flex; }
  .text.in { display: block; }
  .sep { margin-left: .4em; }
  .more { font-size: 10.5px; color: var(--mute); background: var(--chip); padding: 1px 6px; border-radius: 8px; flex: none; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } }
</style>
