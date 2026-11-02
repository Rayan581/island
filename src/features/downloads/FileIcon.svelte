<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import type { DownloadItem } from './state.svelte';

  let { item, size = 22, check = false }: { item: Pick<DownloadItem, 'icon' | 'ext'>; size?: number; check?: boolean } = $props();
</script>

<span class="fi" class:pop={check} style:width="{size}px" style:height="{size}px">
  {#if item.icon}
    <img src={item.icon} alt="" width={size} height={size} draggable="false" />
  {:else}
    <span class="fallback" style:border-radius="{Math.round(size * 0.28)}px">
      {#if item.ext && item.ext.length <= 4 && size >= 22}<b style:font-size="{Math.round(size * 0.34)}px">{item.ext}</b>{:else}<Icon name="M12 4v11M7 11l5 5 5-5M5 20h14" size={Math.round(size * 0.55)} />{/if}
    </span>
  {/if}
  {#if check}<span class="tick" style:width="{Math.round(size * 0.5)}px" style:height="{Math.round(size * 0.5)}px"><Icon name="check" size={Math.round(size * 0.34)} /></span>{/if}
</span>

<style>
  .fi { position: relative; display: inline-block; flex: none; }
  .fi.pop { animation: pop .45s var(--ease); }
  img { display: block; object-fit: contain; image-rendering: auto; }
  .fallback { width: 100%; height: 100%; display: grid; place-items: center; background: rgba(255,255,255,.1); color: #d6d6dc; }
  .fallback b { font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
  .tick { position: absolute; right: -4px; bottom: -3px; border-radius: 50%; background: var(--done); color: #fff; display: grid; place-items: center; box-shadow: 0 0 0 1.5px #000; }
  @keyframes pop { from { transform: scale(.6); opacity: 0; } }
</style>
