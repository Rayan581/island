<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { toolLabel } from '../lib/store.svelte';
  import type { PillKind, Badge } from '../lib/pill';
  import { clock } from '../lib/format';
  import Eyes from './Eyes.svelte';
  import { robo } from '../lib/mood.svelte';
  import Eq from './Eq.svelte';
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import type { IslandFeature } from '../features/types';
  import { ctxs } from '../features/registry.svelte';

  let { store, kind, badges, feature = null, featureBadges = [] }: { store: Store; kind: PillKind; badges: Badge[]; feature?: IslandFeature | null; featureBadges?: IslandFeature[] } = $props();
  const c = $derived(store.claude);
  const focusPct = $derived(1 - store.focus.left / store.focus.total);
</script>

<div class="pill">
  {#if kind === 'feature' && feature?.pill}
    {@const C = feature.pill.component}
    <C ctx={ctxs[feature.id]} />
  {:else if kind === 'idle'}
    <div class="center"><Eyes follow={store.settings.eyesFollow} /></div>
  {:else if kind === 'volume'}
    <span class="ico"><Icon name={store.volume.muted ? 'mute' : 'speaker'} size={16} /></span>
    <div class="vbar"><div style:width="{store.volume.muted ? 0 : store.volume.level * 100}%"></div></div>
    <span class="trail tnum">{store.volume.muted ? 'Muted' : Math.round(store.volume.level * 100)}</span>
  {:else if kind === 'focus-done'}
    <span class="ring done-ring" style:--p="1"></span>
    <span class="text ellipsis">Focus complete</span>
    <span class="trail tnum focus-c">0:00</span>
  {:else if kind === 'attention' && c}
    {#if robo.on}<Eyes size={0.8} follow={store.settings.eyesFollow} mood="surprised" />{:else}<span class="ico attn"><Icon name="alert" size={15} /></span>{/if}
    <span class="text ellipsis"><b class="attn">Needs you</b> <span class="dim">· {c.project}</span></span>
  {:else if kind === 'running' && c}
    {#if robo.on}<Eyes size={0.8} follow={store.settings.eyesFollow} mood="squint" />{:else}<span class="spinner"></span>{/if}
    <span class="text ellipsis">{toolLabel(c.tool)} <span class="dim">· {c.project}</span></span>
    {#if store.runningCount > 1}<span class="count">+{store.runningCount - 1}</span>{/if}
    <span class="trail tnum">{clock(store.elapsed(c))}</span>
  {:else if kind === 'done' && c}
    {#if robo.on}<Eyes size={0.8} follow={store.settings.eyesFollow} mood="happy" />{:else}<span class="ico done-c"><Icon name="check" size={15} /></span>{/if}
    <span class="text ellipsis"><b class="done-c">Done</b> <span class="dim">· {c.project}</span></span>
    <span class="trail tnum dim">{clock(store.elapsed(c))}</span>
  {:else if kind === 'focus'}
    <span class="ring" style:--p={focusPct}></span>
    <div class="center"><Eyes follow={store.settings.eyesFollow} /></div>
    <span class="trail tnum focus-c">{clock(store.focus.left)}</span>
  {:else if kind === 'lyrics' || kind === 'track'}
    <Art src={store.music.art} size={22} radius={6} />
    {#key kind === 'lyrics' ? store.lyricIndex : store.music.key}
      <span class="text ellipsis lyric">
        {#if kind === 'lyrics'}{store.lyricLine || '♪'}{:else}{store.music.title} <span class="dim">· {store.music.artist}</span>{/if}
      </span>
    {/key}
    <Eq playing={store.music.playing} />
  {/if}

  {#each badges as b (b)}
    {#if b === 'claude' && c}
      <span class="badge" title="Claude Code">
        {#if c.status === 'running'}<span class="spinner sm"></span>{:else if c.status === 'attention'}<span class="dot" style:background="var(--attn)"></span>{:else}<span class="dot" style:background="var(--done)"></span>{/if}
      </span>
    {:else if b === 'focus'}
      <span class="badge focus-c tnum"><span class="ring sm" style:--p={focusPct}></span>{clock(store.focus.left)}</span>
    {:else if b === 'music'}
      <span class="badge"><Art src={store.music.art} size={20} radius={10} /></span>
    {/if}
  {/each}
  {#each featureBadges as f (f.id)}
    <span class="badge fbadge" title={f.label} style:color={f.badge?.color ?? '#fff'}><Icon name={f.badge?.icon ?? 'dot'} size={13} /></span>
  {/each}
</div>

<style>
  .pill { position: absolute; inset: 0; display: flex; align-items: center; gap: 9px; padding: 0 var(--pad, 11px); font-weight: 600; font-size: 12.5px; white-space: nowrap; }
  .center { flex: 1; display: flex; justify-content: center; }
  /* shared with feature pills (rendered inside .pill), hence :global */
  .pill :global(.text) { flex: 1; min-width: 0; }
  .pill :global(.dim) { color: var(--mute); font-weight: 500; }
  .pill :global(.trail) { margin-left: auto; font-size: 12.5px; }
  .pill :global(.ico) { display: grid; place-items: center; flex: none; }
  .attn { color: var(--attn); } .done-c { color: #60a5fa; } .focus-c { color: #c895ff; }
  .count { font-size: 10.5px; color: var(--claude); background: rgba(217,119,87,.16); padding: 1px 6px; border-radius: 8px; }
  .spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid var(--claude); border-right-color: transparent; animation: spin .9s linear infinite; flex: none; }
  .spinner.sm { width: 12px; height: 12px; }
  .ring { width: 16px; height: 16px; border-radius: 50%; flex: none;
          background: conic-gradient(var(--focus) calc(var(--p) * 360deg), rgba(176,108,242,.22) 0);
          -webkit-mask: radial-gradient(circle, transparent 4.5px, #000 5px); mask: radial-gradient(circle, transparent 4.5px, #000 5px); }
  .ring.sm { width: 12px; height: 12px; -webkit-mask: radial-gradient(circle, transparent 3px, #000 3.5px); mask: radial-gradient(circle, transparent 3px, #000 3.5px); }
  .done-ring { background: var(--focus); }
  .pill :global(.dot) { width: 8px; height: 8px; border-radius: 50%; display: block; }
  .pill :global(.badge) { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 11.5px; }
  .vbar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; }
  .vbar div { height: 100%; background: #fff; border-radius: 3px; transition: width .15s; }
  .lyric { animation: rise .35s var(--ease); }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } }
</style>
