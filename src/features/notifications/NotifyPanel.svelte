<script lang="ts">
  import type { FeatureProps } from '../types';
  import AppTile from './AppTile.svelte';
  import { nstate, clearAll } from './state.svelte';
  import { ago } from '../../lib/format';

  let { ctx }: FeatureProps = $props();
  const now = $derived(ctx.store.now);
  const empty = $derived(
    nstate.status === 'unsupported' ? { t: 'Can’t read Windows’ notifications', s: `Island turned this off: ${nstate.reason || 'the database format is not what it expects'}.` }
    : nstate.status === 'missing' ? { t: 'Notification database not found', s: 'It is created the first time Windows shows a notification.' }
    : { t: 'No notifications yet', s: 'Messages from your chosen apps appear here and in the pill. Pick the apps in Settings.' }
  );
  const when = (at: number) => { const d = now - at; return d < 60000 ? 'now' : ago(d).replace(' ago', ''); };
</script>

<div class="wrap">
  {#if nstate.items.length}
    <div class="bar"><span>Recent</span><button onclick={clearAll}>Clear</button></div>
    <ul>
      {#each nstate.items as n (n.id)}
        <li>
          <AppTile color={n.color} initial={n.initial} size={28} />
          <div class="txt">
            <div class="top"><span class="app ellipsis">{n.app}</span><span class="when tnum">{when(n.at)}</span></div>
            <div class="title ellipsis">{n.title}</div>
            {#if n.body}<div class="body">{n.body}</div>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      <b>{empty.t}</b>
      <span>{empty.s}</span>
    </div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .bar { display: flex; justify-content: space-between; align-items: center; padding: 0 6px 5px; font-size: 10.5px; font-weight: 600; color: var(--mute); }
  .bar button { font-size: 10.5px; font-weight: 600; color: var(--mute); padding: 1px 8px; border-radius: 9px; background: var(--chip); transition: background .2s, color .2s; }
  .bar button:hover { color: #fff; background: rgba(255,255,255,.14); }
  ul { list-style: none; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; display: flex; flex-direction: column; gap: 2px; padding-right: 2px; }
  li { display: flex; gap: 10px; padding: 6px; border-radius: 12px; animation: viewIn .3s var(--ease); }
  li:hover { background: rgba(255,255,255,.05); }
  .txt { flex: 1; min-width: 0; }
  .top { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; color: var(--mute); font-weight: 600; }
  .when { flex: none; font-weight: 500; color: var(--faint); }
  .title { font-size: 12.5px; font-weight: 600; }
  .body { font-size: 11.5px; color: var(--mute); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; overflow-wrap: anywhere; }
  .empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; text-align: center; color: var(--mute); padding: 0 40px; }
  .empty b { color: #fff; font-size: 12.5px; }
  .empty span { font-size: 11px; line-height: 1.4; }
  @keyframes viewIn { from { opacity: 0; transform: translateY(5px); } }
</style>
