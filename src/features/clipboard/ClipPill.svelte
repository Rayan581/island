<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import { clip } from './state.svelte';
  import { CLIP_ICON } from './icons';

  let _props: FeatureProps = $props(); // the pill only reads module state
  const it = $derived(clip.peek);
</script>

{#if it}
  {#key it.id + (it.kind === 'image' && it.screenshot ? 's' : '')}
    {#if it.kind === 'text'}
      <span class="ico clip"><Icon name={CLIP_ICON} size={15} /></span>
      <span class="text ellipsis"><b class="lbl">Copied</b> <span class="dim">· {it.line || 'whitespace'}</span></span>
      <span class="trail tnum dim">{it.chars} {it.chars === 1 ? 'char' : 'chars'}</span>
    {:else}
      <img class="thumb" src={it.thumb} alt="" draggable="false" />
      <span class="text ellipsis"><b class="lbl">{it.screenshot ? 'Screenshot' : 'Image copied'}</b></span>
      <span class="trail tnum dim">{it.w}×{it.h}</span>
    {/if}
  {/key}
{/if}

<style>
  .clip { color: var(--ink); animation: pop .3s var(--ease); }
  .lbl { font-weight: 600; }
  .thumb { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; flex: none; background: var(--chip); box-shadow: 0 0 0 1px rgba(255,255,255,.14); animation: pop .3s var(--ease); }
  .text { animation: rise .3s var(--ease); }
  @keyframes pop { from { transform: scale(.6); opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(5px); filter: blur(2px); } }
</style>
