<script lang="ts">
  import type { FeatureProps } from '../types';
  import { onMount } from 'svelte';
  import { game, DEFAULT_GAME_CONFIG, type GameConfig } from './state.svelte';
  let { ctx }: FeatureProps = $props();

  let cfg = $state<GameConfig>({ ...DEFAULT_GAME_CONFIG });
  let waited = $state(false);
  const helperUp = $derived(ctx.store.config.helper === 'running');

  onMount(() => {
    ctx.getConfig<Partial<GameConfig>>().then((c) => { cfg = { ...DEFAULT_GAME_CONFIG, ...c }; }).catch(() => {});
    // Give a freshly started helper a few seconds before saying it has not reported.
    const t = setTimeout(() => (waited = true), 4000);
    return () => clearTimeout(t);
  });

  function save(patch: Partial<GameConfig>) {
    cfg = { ...cfg, ...patch };
    ctx.setConfig({ ...cfg }).catch(() => {});
  }
</script>

<div class="gm">
  <label><input type="checkbox" checked={cfg.hideForVideo} onchange={(e) => save({ hideForVideo: e.currentTarget.checked })} />Also hide for fullscreen video and browsers</label>
  <label><input type="checkbox" checked={cfg.showSessionTime} onchange={(e) => save({ showSessionTime: e.currentTarget.checked })} />Show play time afterwards <span class="sub">(sessions over 2 min)</span></label>
  <p class="status" class:ok={helperUp && game.seen}>
    <span class="dot"></span>
    {#if !helperUp}
      <span>Needs the music helper (<code>npm run build:helper</code>)</span>
    {:else if game.seen}
      <span>{game.active ? `Fullscreen now${game.exe ? `: ${game.exe}` : ''}` : 'Watching for fullscreen apps'}</span>
    {:else if waited}
      <span>The helper has not reported yet. Rebuild it with <code>npm run build:helper</code></span>
    {:else}
      <span>Starting…</span>
    {/if}
  </p>
</div>

<style>
  .gm { display: flex; flex-direction: column; gap: 5px; }
  label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--mute); font-size: 11.5px; }
  input { accent-color: #c4f5d2; }
  .sub { color: var(--faint); font-size: 10.5px; }
  .status { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--faint); margin-top: 1px; }
  .status.ok { color: var(--mute); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); flex: none; }
  .ok .dot { background: #7be0a0; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 10px; background: var(--chip); padding: 0 4px; border-radius: 4px; }
</style>
