<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import FileIcon from './FileIcon.svelte';
  import { formatSize } from './format';
  import { ago } from '../../lib/format';
  import { dl, removeDownload, type DownloadItem } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  let notes = $state<Record<string, string>>({});

  function note(path: string, text: string) {
    notes[path] = text;
    setTimeout(() => { delete notes[path]; }, 2200);
  }

  async function act(action: 'open' | 'showInFolder', item: DownloadItem) {
    try {
      const r = await ctx.call<{ ok: boolean; error?: string } | null>(action, item.path);
      if (r && !r.ok) {
        if (r.error === 'missing') { note(item.path, 'File moved or deleted'); setTimeout(() => removeDownload(item.path), 1600); }
        else note(item.path, "Couldn't open");
      }
    } catch { note(item.path, "Couldn't open"); }
  }

  function drag(e: DragEvent, item: DownloadItem) {
    e.preventDefault(); // Electron starts a native drag instead (so it can be dropped into Explorer, a browser, chat…)
    ctx.call('startDrag', item.path).catch(() => {});
  }
</script>

{#if dl.items.length === 0}
  <div class="empty">
    <span class="eico"><Icon name="M12 4v11M7 11l5 5 5-5M5 20h14" size={20} /></span>
    <div><p>No downloads yet</p><span>Finished downloads show up here, ready to open or drag out.</span></div>
  </div>
{:else}
  <ul class="list">
    {#each dl.items as item (item.path)}
      <li class="row" draggable="true" ondragstart={(e) => drag(e, item)} title="Drag to move this file somewhere">
        <FileIcon {item} size={26} />
        <div class="meta">
          <div class="name ellipsis">{item.name}</div>
          <div class="sub ellipsis" class:warn={!!notes[item.path]}>
            {#if notes[item.path]}{notes[item.path]}{:else}{formatSize(item.size)}<span class="sep">·</span>{ago(ctx.store.now - item.at)}{/if}
          </div>
        </div>
        <button class="open" onclick={() => act('open', item)}>Open</button>
        <button class="folder" aria-label="Show in folder" title="Show in folder" onclick={() => act('showInFolder', item)}>
          <Icon name="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" size={14} />
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .list { list-style: none; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; padding-right: 2px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
  .row { display: flex; align-items: center; gap: 10px; flex: none; height: 38px; padding: 0 6px 0 9px; border-radius: 12px;
         background: rgba(255,255,255,.055); border: 1px solid transparent; transition: background .18s, border-color .18s; }
  .row:hover { background: rgba(255,255,255,.1); border-color: var(--line); }
  .meta { flex: 1; min-width: 0; }
  .name { font-size: 12px; font-weight: 600; }
  .sub { font-size: 10.5px; color: var(--mute); margin-top: 1px; }
  .sub.warn { color: var(--attn); }
  .sep { margin: 0 5px; color: var(--faint); }
  .open { height: 24px; padding: 0 12px; border-radius: 12px; background: rgba(255,255,255,.92); color: #000; font-size: 11px; font-weight: 700; transition: transform .15s, background .15s; }
  .open:hover { background: #fff; transform: scale(1.04); }
  .open:active { transform: scale(.97); }
  .folder { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--chip); color: #ddd; transition: background .15s, color .15s; }
  .folder:hover { background: rgba(255,255,255,.18); color: #fff; }
  .empty { height: 100%; display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--mute); }
  .empty p { color: #fff; font-weight: 600; }
  .empty span { font-size: 11.5px; }
  .empty div { max-width: 260px; }
  .eico { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: var(--chip); color: #7aa7f7; flex: none; }
</style>
