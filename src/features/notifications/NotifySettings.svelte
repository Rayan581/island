<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeatureProps } from '../types';
  import AppTile from './AppTile.svelte';
  import { nstate, push, type AppRow } from './state.svelte';

  let { ctx }: FeatureProps = $props();

  async function refresh() {
    try {
      const r = await ctx.call<AppRow[] | null>('seenApps');
      if (Array.isArray(r) && r.length) nstate.apps = r;
    } catch { /* keep what we have */ }
  }
  onMount(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); });

  function toggle(a: AppRow) {
    a.enabled = !a.enabled; // optimistic; a.enabled lives in the shared $state array
    ctx.call('setApp', { key: a.key, enabled: a.enabled }).catch(() => { a.enabled = !a.enabled; });
  }
  function preview() {
    push({ id: 'preview-' + Date.now(), appKey: 'island', app: 'Island', color: '#9b9ba3', initial: 'I', title: 'Notification preview', body: 'This is how a message looks in the island.', at: Date.now() });
  }
  const problem = $derived(nstate.status === 'unsupported' ? `Turned off: ${nstate.reason || 'unsupported database format'}.` : nstate.status === 'missing' ? 'Windows’ notification database was not found yet.' : '');
</script>

<div class="np">
  <div class="chips" role="group" aria-label="Apps to show">
    {#each nstate.apps as a (a.key)}
      <button class="chip" class:on={a.enabled} aria-pressed={a.enabled} onclick={() => toggle(a)} title={a.seen ? a.name : `${a.name} (not seen yet)`}>
        <AppTile color={a.color} initial={a.name[0]?.toUpperCase() ?? '•'} size={16} />
        <span class="ellipsis">{a.name}</span>
        <i class="sw" aria-hidden="true"></i>
      </button>
    {/each}
  </div>
  {#if problem}<p class="warn">{problem}</p>{/if}
  <div class="row">
    <button class="pv" onclick={preview}>Preview</button>
    <span class="hint">Island can’t hide Windows’ own banners. To see them only here, turn banners off for these apps in Windows Settings → System → Notifications (keep them in the notification center).</span>
  </div>
</div>

<style>
  .np { display: flex; flex-direction: column; gap: 7px; }
  .chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 5px; }
  .chip { display: flex; align-items: center; gap: 7px; padding: 4px 8px 4px 5px; border-radius: 10px; background: var(--chip); color: var(--mute); font-size: 11px; font-weight: 600; text-align: left; transition: background .2s, color .2s; }
  .chip :global(.tile) { opacity: .45; filter: saturate(.4); transition: opacity .2s, filter .2s; }
  .chip .ellipsis { flex: 1; }
  .chip.on { color: #fff; background: rgba(255,255,255,.13); }
  .chip.on :global(.tile) { opacity: 1; filter: none; }
  .sw { width: 22px; height: 12px; border-radius: 6px; background: rgba(255,255,255,.18); position: relative; flex: none; transition: background .2s; }
  .sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 8px; height: 8px; border-radius: 50%; background: #fff; transition: transform .2s var(--ease); }
  .chip.on .sw { background: #34c759; }
  .chip.on .sw::after { transform: translateX(10px); }
  .row { display: flex; align-items: flex-start; gap: 10px; }
  .pv { flex: none; padding: 3px 11px; border-radius: 10px; background: rgba(255,255,255,.12); font-size: 11px; font-weight: 600; transition: background .2s; }
  .pv:hover { background: rgba(255,255,255,.2); }
  .hint { font-size: 10px; color: var(--faint); line-height: 1.4; }
  .warn { font-size: 11px; color: var(--attn); }
</style>
