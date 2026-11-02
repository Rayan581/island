<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { toolLabel } from '../lib/store.svelte';
  import { clock, ago } from '../lib/format';
  import Icon from './Icon.svelte';
  import Art from './Art.svelte';
  import Eq from './Eq.svelte';

  let { store }: { store: Store } = $props();
  const c = $derived(store.claude);
  const tone = $derived(!c ? '' : c.status === 'done' && !c.seen ? 'done' : c.status === 'attention' ? 'attn' : '');
</script>

<div class="tiles">
  <div class="tile claude {tone}" role="button" tabindex="0" onclick={() => (store.view = 'claude')} onkeydown={(e) => e.key === 'Enter' && (store.view = 'claude')}>
    <span class="label">Claude Code</span>
    <span class="corner">
      {#if c?.status === 'running'}<span class="spin"></span>{:else if tone === 'done'}<Icon name="check" size={16} />{:else if tone === 'attn'}<Icon name="alert" size={16} />{:else}<Icon name="claude" size={16} />{/if}
    </span>
    {#if !c}
      <b>Idle</b><em>{store.config.claudeConnected || store.config.demo ? 'Waiting for a session' : 'Connect from the tray menu'}</em>
    {:else if c.status === 'running'}
      <b class="tnum">{clock(store.elapsed(c))}</b><em class="ellipsis">{toolLabel(c.tool)} · {c.project}</em>
    {:else if c.status === 'attention'}
      <b>Waiting</b><em class="ellipsis">{c.project} needs you</em>
    {:else if c.status === 'done'}
      <b>Done</b><em class="ellipsis">{c.project} · {ago(store.now - c.endedAt)}</em>
    {:else}
      <b>Ready</b><em class="ellipsis">{c.project}</em>
    {/if}
  </div>

  <div class="tile music" role="button" tabindex="0" onclick={() => (store.view = 'music')} onkeydown={(e) => e.key === 'Enter' && (store.view = 'music')}>
    <span class="label">Music</span>
    <span class="corner"><Art src={store.music.art} size={34} radius={9} /></span>
    {#if store.music.active}
      <span class="eqrow"><Eq playing={store.music.playing} height={11} bars={4} /></span>
      <div class="row">
        <div class="col"><b class="sm ellipsis">{store.music.title}</b><em class="ellipsis">{store.music.artist}</em></div>
        <button class="round" aria-label={store.music.playing ? 'Pause' : 'Play'} onclick={(e) => { e.stopPropagation(); store.mediaCmd('toggle'); }}>
          <Icon name={store.music.playing ? 'pause' : 'play'} size={12} />
        </button>
      </div>
    {:else}
      <b class="sm">Nothing playing</b><em>Play something in Spotify</em>
    {/if}
  </div>

  <div class="tile focus" role="button" tabindex="0" onclick={() => (store.view = 'focus')} onkeydown={(e) => e.key === 'Enter' && (store.view = 'focus')}>
    <span class="label">Focus</span>
    <button class="corner round light" aria-label={store.focus.running ? 'Pause timer' : 'Start timer'} onclick={(e) => { e.stopPropagation(); store.toggleFocus(); }}>
      <Icon name={store.focus.running ? 'pause' : 'play'} size={12} />
    </button>
    <b class="tnum">{clock(store.focus.left)}</b>
    <em>{store.focus.running ? 'Focusing' : store.focus.left < store.focus.total ? 'Paused' : 'Ready to start'}</em>
  </div>
</div>

<style>
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; height: 100%; }
  .tile { position: relative; border-radius: 18px; padding: 12px 13px 11px; display: flex; flex-direction: column; justify-content: flex-end; min-width: 0; cursor: pointer;
          overflow: hidden; transition: transform .2s var(--ease), background .6s; outline: none; }
  .tile:hover { transform: translateY(-1px) scale(1.015); }
  .tile:focus-visible { box-shadow: inset 0 0 0 2px rgba(255,255,255,.4); }
  .label { position: absolute; top: 11px; left: 13px; font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,.62); }
  .corner { position: absolute; top: 9px; right: 10px; display: grid; place-items: center; }
  b { font-size: 25px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
  b.sm { font-size: 14px; letter-spacing: 0; }
  em { font-style: normal; font-size: 10.5px; color: rgba(255,255,255,.66); margin-top: 1px; }
  .claude { background: linear-gradient(165deg, #1a1a1a 25%, var(--claude-deep)); }
  .claude.done { background: linear-gradient(165deg, #0d1424 15%, var(--done)); }
  .claude.attn { background: linear-gradient(165deg, #1c160a 20%, #8a5a12); }
  .music { background: linear-gradient(165deg, #151515 20%, var(--accent-deep)); }
  .focus { background: linear-gradient(165deg, #1a1a1a 20%, var(--focus-deep)); }
  .spin { width: 18px; height: 18px; border-radius: 50%; border: 2.2px solid #fff; border-right-color: transparent; animation: spin .9s linear infinite; }
  .eqrow { position: absolute; top: 30px; left: 13px; }
  .row { display: flex; align-items: flex-end; gap: 6px; }
  .col { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .round { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.92); color: #000; flex: none; }
  .round.light { width: 28px; height: 28px; }
</style>
