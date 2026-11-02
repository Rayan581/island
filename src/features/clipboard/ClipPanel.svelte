<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import { ago } from '../../lib/format';
  import { clip, markCopied, clearAll, type TextItem, type ImageItem } from './state.svelte';
  import { CLIP_ICON, COPY_ICON, FOLDER_ICON, TRASH_ICON } from './icons';

  let { ctx }: FeatureProps = $props();
  const now = $derived(ctx.store.now);
  const empty = $derived(!clip.texts.length && !clip.images.length);
  const copied = (id: string) => clip.copiedId === id && clip.copiedUntil > now;

  function copyText(t: TextItem) { markCopied(t.id); ctx.call('copyText', { id: t.id, text: t.text }).catch(() => {}); }
  function copyImage(i: ImageItem) { markCopied(i.id); ctx.call('copyImage', i.file).catch(() => {}); }
  function folder(i: ImageItem) { ctx.call('showInFolder', i.file).catch(() => {}); }
  function drag(e: DragEvent, i: ImageItem) { e.preventDefault(); ctx.call('startDrag', i.file).catch(() => {}); }
  const press = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
</script>

{#if empty}
  <div class="empty">
    <span class="big"><Icon name={CLIP_ICON} size={22} /></span>
    <div><p>Nothing copied yet</p><span>Text you copy and screenshots you take (Win+Shift+S) show up here.</span></div>
  </div>
{:else}
  <div class="wrap">
    <div class="bar">
      <span class="count tnum">{clip.images.length ? `${clip.images.length} ${clip.images.length === 1 ? 'image' : 'images'}` : ''}{clip.images.length && clip.texts.length ? ' · ' : ''}{clip.texts.length ? `${clip.texts.length} ${clip.texts.length === 1 ? 'snippet' : 'snippets'}` : ''}</span>
      <button class="clear" onclick={clearAll} aria-label="Clear clipboard history"><Icon name={TRASH_ICON} size={11} />Clear</button>
    </div>

    {#if clip.images.length}
      <div class="imgs">
        {#each clip.images as i (i.id)}
          <div class="tile" class:done={copied(i.id)} role="img" aria-label={i.screenshot ? 'Screenshot' : 'Image'} draggable="true" ondragstart={(e) => drag(e, i)} title="Drag into another app">
            <img src={i.thumb} alt="" draggable="false" />
            {#if i.screenshot}<span class="tag">Screenshot</span>{/if}
            <div class="ov">
              {#if copied(i.id)}
                <span class="ok" role="status" aria-label="Copied"><Icon name="check" size={20} /></span>
              {:else}
                <button aria-label="Copy image" title="Copy" onclick={() => copyImage(i)}><Icon name={COPY_ICON} size={13} /></button>
                <button aria-label="Show in folder" title="Show in folder" onclick={() => folder(i)}><Icon name={FOLDER_ICON} size={13} /></button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if clip.texts.length}
      <div class="list">
        {#each clip.texts as t (t.id)}
          <div class="row" class:done={copied(t.id)} role="button" tabindex="0" title="Click to copy again" onclick={() => copyText(t)} onkeydown={press(() => copyText(t))}>
            <span class="line ellipsis">{t.line || '(whitespace)'}</span>
            {#if copied(t.id)}
              <span class="meta ok"><Icon name="check" size={11} />Copied</span>
            {:else}
              <span class="meta tnum">{t.chars} {t.chars === 1 ? 'char' : 'chars'} · {ago(now - t.at)}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .bar { display: flex; align-items: center; justify-content: space-between; height: 18px; padding: 0 2px; flex: none; }
  .count { font-size: 10.5px; color: var(--mute); font-weight: 600; }
  .clear { display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 8px; border-radius: 9px; font-size: 10.5px; font-weight: 600; color: var(--mute); transition: background .2s, color .2s; }
  .clear:hover { background: var(--chip); color: #fff; }

  .imgs { display: flex; gap: 7px; flex: none; overflow-x: auto; overflow-y: hidden; padding: 1px 1px 3px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
  .tile { position: relative; flex: none; height: 56px; border-radius: 11px; overflow: hidden; background: #111; cursor: grab; box-shadow: 0 0 0 1px rgba(255,255,255,.1); transition: box-shadow .2s, transform .2s var(--ease); }
  .tile:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(255,255,255,.28); }
  .tile.done { box-shadow: 0 0 0 1.5px var(--done); }
  .tile img { display: block; height: 100%; width: auto; max-width: 112px; min-width: 64px; object-fit: cover; pointer-events: none; }
  .tag { position: absolute; left: 4px; bottom: 4px; padding: 1px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; letter-spacing: .01em; color: #fff; background: rgba(0,0,0,.62); backdrop-filter: blur(4px); transition: opacity .15s; }
  .ov { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5px; background: rgba(0,0,0,.55); opacity: 0; transition: opacity .15s; }
  .tile:hover .ov, .tile:focus-within .ov, .tile.done .ov { opacity: 1; }
  .tile:hover .tag, .tile.done .tag { opacity: 0; }
  .ov button { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.16); color: #fff; transition: background .15s, transform .15s var(--ease); }
  .ov button:hover { background: rgba(255,255,255,.3); transform: scale(1.08); }
  .ok { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: #7db5ff; animation: pop .25s var(--ease); }

  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -4px; padding: 0 4px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
  .row { display: flex; align-items: center; gap: 12px; flex: none; height: 27px; padding: 0 10px; border-radius: 9px; cursor: pointer; background: rgba(255,255,255,.045); transition: background .15s; outline: none; }
  .row:hover { background: rgba(255,255,255,.1); }
  .row:focus-visible { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.4); }
  .row.done { background: rgba(59,130,246,.16); }
  .line { flex: 1; font-size: 12px; font-weight: 550; }
  .meta { flex: none; font-size: 10.5px; color: var(--mute); }
  .meta.ok { color: #7db5ff; font-weight: 700; }

  .empty { height: 100%; display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--mute); }
  .big { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--chip); color: #fff; flex: none; }
  .empty p { color: #fff; font-weight: 600; font-size: 13px; }
  .empty span:not(.big) { display: block; max-width: 250px; font-size: 11.5px; margin-top: 1px; }
  @keyframes pop { from { transform: scale(.7); opacity: 0; } }
</style>
