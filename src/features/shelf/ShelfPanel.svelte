<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import { shelf, applyPayload, setFlash, formatSize, type ShelfItem, type ShelfPayload } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const TRAY = 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z';
  const FILE = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5';
  const FOLDER = 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

  let selected = $state<string[]>([]);
  let busy = $state(false);
  const helperOk = $derived(ctx.store.config.helper === 'running');

  // Re-read on open: drops files that were deleted or moved since.
  $effect(() => { ctx.call<ShelfPayload>('list').then((p) => applyPayload(p)).catch(() => {}); });
  $effect(() => { const have = new Set(shelf.items.map((i) => i.path)); if (selected.some((p) => !have.has(p))) selected = selected.filter((p) => have.has(p)); });

  async function act(action: string, arg?: unknown, announce = false) {
    try { applyPayload(await ctx.call<ShelfPayload>(action, arg), announce); }
    catch { setFlash('Something went wrong, try again'); }
  }
  async function pick() {
    if (busy) return;
    busy = true;
    try { await act('pick', undefined, true); } finally { busy = false; }
  }
  const toggle = (p: string) => { selected = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]; };

  function dragStart(e: DragEvent, item: ShelfItem) {
    e.preventDefault(); // Electron starts the real OS drag; the browser's own drag image would be useless
    const paths = selected.includes(item.path) ? [...selected] : [item.path]; // plain array: a $state proxy cannot cross IPC
    ctx.call('startDrag', paths).catch(() => {});
  }
  function key(e: KeyboardEvent, item: ShelfItem) {
    if (e.key === 'Enter') act('open', item.path);
    else if (e.key === ' ') { e.preventDefault(); toggle(item.path); }
    else if (e.key === 'Delete' || e.key === 'Backspace') act('remove', item.path);
  }
</script>

<div class="shelf" class:over={shelf.dragging}>
  <div class="bar">
    <span class="count tnum">
      {#if shelf.items.length}{shelf.items.length} of {shelf.max}{:else}Empty{/if}
      {#if selected.length > 1 && !shelf.flash}<em>· {selected.length} selected</em>{/if}
    </span>
    {#if shelf.flash}<span class="flash ellipsis" role="status">{shelf.flash}</span>{/if}
    <span class="sp"></span>
    <button class="chip" onclick={pick} disabled={busy} aria-label="Add files"><Icon name="M12 5v14M5 12h14" size={12} />Add files…</button>
    {#if shelf.items.length}<button class="chip ghost" onclick={() => act('clear')} aria-label="Clear all">Clear all</button>{/if}
  </div>

  {#if shelf.items.length}
    <div class="grid" role="group" aria-label="Shelf items">
      {#each shelf.items as item (item.path)}
        <div class="tile" class:sel={selected.includes(item.path)} role="button" aria-pressed={selected.includes(item.path)} draggable="true" tabindex="0" title={item.path}
             ondragstart={(e) => dragStart(e, item)} onclick={() => toggle(item.path)} ondblclick={() => act('open', item.path)} onkeydown={(e) => key(e, item)}>
          <div class="acts">
            <button aria-label="Show {item.name} in folder" title="Show in folder" onclick={(e) => { e.stopPropagation(); ctx.call('show', item.path); }}><Icon name={FOLDER} size={10} /></button>
            <button aria-label="Open {item.name}" title="Open" onclick={(e) => { e.stopPropagation(); act('open', item.path); }}><Icon name="M7 17 17 7M8 7h9v9" size={10} /></button>
            <button class="rm" aria-label="Remove {item.name} from the shelf" title="Remove" onclick={(e) => { e.stopPropagation(); act('remove', item.path); }}><Icon name="M18 6 6 18M6 6l12 12" size={10} /></button>
          </div>
          {#if item.icon}<img src={item.icon} alt="" draggable="false" />{:else}<span class="gen"><Icon name={item.dir ? FOLDER : FILE} size={22} /></span>{/if}
          <span class="name">{item.name}</span>
          <span class="meta tnum">{item.dir ? 'Folder' : formatSize(item.size)}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <span class="tray"><Icon name={TRAY} size={26} /></span>
      <b>Drag files here</b>
      <span class="sub">Drop them on the island to park them, then drag them out where you need them.</span>
      {#if !helperOk && ctx.store.config.platform === 'win32'}<span class="sub warn">Dropping needs the helper (npm run build:helper). “Add files…” works without it.</span>{/if}
    </div>
  {/if}

  <div class="drop" aria-hidden={!shelf.dragging}>
    <span class="tray"><Icon name={TRAY} size={30} /></span>
    <b>Drop to add to the shelf</b>
  </div>
</div>

<style>
  .shelf { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .bar { display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 2px; flex: none; font-size: 11px; }
  .count { color: var(--mute); font-weight: 600; white-space: nowrap; }
  .count em { font-style: normal; font-weight: 500; color: var(--faint); }
  .flash { color: #8ab4ff; font-weight: 600; animation: fin .25s var(--ease); min-width: 0; }
  .sp { flex: 1; }
  @keyframes fin { from { opacity: 0; transform: translateY(3px); } }
  .chip { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 10px; border-radius: 11px; background: rgba(255,255,255,.1); font-size: 11px; font-weight: 600; transition: background .15s; white-space: nowrap; }
  .chip:hover:not(:disabled) { background: rgba(255,255,255,.18); }
  .chip:disabled { opacity: .5; cursor: default; }
  .chip.ghost { background: none; color: var(--mute); padding: 0 6px; }
  .chip.ghost:hover { color: #fff; background: rgba(255,255,255,.08); }

  .grid { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); grid-auto-rows: 98px; gap: 6px; padding: 1px 2px 4px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; align-content: start; }
  .tile { position: relative; display: flex; flex-direction: column; align-items: center; padding: 17px 4px 5px; border-radius: 12px; background: rgba(255,255,255,.05); cursor: grab; transition: background .15s, box-shadow .15s, transform .2s var(--ease); outline-offset: -2px; min-width: 0; }
  .tile:hover { background: rgba(255,255,255,.1); }
  .tile:active { cursor: grabbing; transform: scale(.97); }
  .tile.sel { background: rgba(138,180,255,.16); box-shadow: inset 0 0 0 1.5px rgba(138,180,255,.7); }
  .tile img, .gen { width: 30px; height: 30px; flex: none; object-fit: contain; pointer-events: none; }
  .gen { display: grid; place-items: center; color: var(--mute); }
  .name { margin-top: 4px; width: 100%; font-size: 10.5px; font-weight: 600; line-height: 1.2; text-align: center; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .meta { margin-top: auto; font-size: 9.5px; color: var(--faint); font-weight: 500; }
  .acts { position: absolute; top: 3px; left: 3px; right: 3px; display: flex; gap: 3px; opacity: 0; transition: opacity .15s; }
  .tile:hover .acts, .tile:focus-visible .acts, .tile:focus-within .acts { opacity: 1; }
  .acts button { width: 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; background: rgba(255,255,255,.14); color: #fff; transition: background .15s; }
  .acts button:hover { background: rgba(255,255,255,.28); }
  .acts .rm { margin-left: auto; }
  .acts .rm:hover { background: #e5484d; }

  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; border-radius: 16px; border: 1.5px dashed rgba(255,255,255,.14); margin: 0 2px 4px; padding: 0 40px; }
  .empty b { font-size: 13px; }
  .empty .sub { color: var(--mute); font-size: 11px; font-weight: 500; max-width: 330px; }
  .empty .warn { color: var(--attn); }
  .tray { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; background: rgba(138,180,255,.12); color: #8ab4ff; margin-bottom: 4px; }

  .drop { position: absolute; inset: 0; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: #080c16; border: 2px dashed #8ab4ff;
          opacity: 0; transform: scale(.985); pointer-events: none; transition: opacity .18s, transform .25s var(--ease); }
  .drop b { font-size: 13px; color: #cfe0ff; }
  @keyframes edge { 50% { border-color: rgba(138,180,255,.35); } }
  .over .drop { opacity: 1; transform: none; animation: edge 1.4s ease-in-out infinite; }
</style>
