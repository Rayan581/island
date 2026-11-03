<script lang="ts">
  import type { FeatureProps } from '../types';
  import AppTile from './AppTile.svelte';
  import { nstate } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const n = $derived(nstate.current);
</script>

{#if n}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <span class="hit" title="Open {n.app}" onclick={() => ctx.call('open', { id: n.id }).catch(() => {})}></span>
  {#key n.id}
    <span class="in"><AppTile color={n.color} initial={n.initial} size={22} /></span>
    <span class="text ellipsis in" title={n.app}><b>{n.title}</b>{#if n.body}<span class="dim sep">· {n.body}</span>{/if}</span>
  {/key}
  {#if nstate.queued > 0}<span class="more tnum">+{nstate.queued}</span>{/if}
{/if}

<style>
  /* a click anywhere on the pill opens the app; sits under the text so nothing else changes */
  .hit { position: absolute; inset: 0; cursor: pointer; z-index: 0; }
  .in { position: relative; z-index: 1; pointer-events: none; }
  .more { position: relative; z-index: 1; }
  .in { animation: rise .32s var(--ease); display: inline-flex; }
  .text.in { display: block; }
  .sep { margin-left: .4em; }
  .more { font-size: 10.5px; color: var(--mute); background: var(--chip); padding: 1px 6px; border-radius: 8px; flex: none; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } }
</style>
