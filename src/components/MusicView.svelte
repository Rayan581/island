<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { clock } from '../lib/format';
  import Icon from './Icon.svelte';
  import Art from './Art.svelte';
  import Eq from './Eq.svelte';

  let { store }: { store: Store } = $props();
  const m = $derived(store.music);
  const pct = $derived(m.duration ? (store.position / m.duration) * 100 : 0);
  const sourceName = $derived(/spotify/i.test(m.source) ? 'Spotify' : /chrome|edge|firefox|msedge/i.test(m.source) ? 'Browser' : m.source.replace(/\.exe$/i, '').split(/[!\\.]/).pop() || '');

  function seek(e: MouseEvent) {
    if (!m.canSeek || !m.duration) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    store.mediaCmd('seek', ((e.clientX - r.left) / r.width) * m.duration);
  }
</script>

{#if !m.active}
  <div class="empty"><Art src={null} size={44} radius={12} /><p>Nothing playing<br /><span>Start a song in Spotify or any media player.</span></p></div>
{:else}
  <div class="wrap">
    <div class="top">
      <Art src={m.art} size={50} radius={12} />
      <div class="info">
        <b class="ellipsis">{m.title}</b>
        <span class="ellipsis">{m.artist}{m.album ? ` · ${m.album}` : ''}</span>
      </div>
      <Eq playing={m.playing} height={18} bars={6} />
    </div>

    <div class="lyrics">
      {#if store.lyricsState === 'ready'}
        {#key store.lyricIndex}<p class="now ellipsis">{store.lyricLine || '♪'}</p>{/key}
        <p class="next ellipsis">{store.lyrics?.[store.lyricIndex + 1]?.text ?? ''}</p>
      {:else if store.lyricsState === 'loading'}<p class="next">Finding lyrics…</p>
      {:else if store.lyricsState === 'instrumental'}<p class="next">♪ Instrumental</p>
      {:else}<p class="next">No synced lyrics for this one</p>{/if}
    </div>

    <div class="seek tnum">
      <span>{clock(store.position)}</span>
      <div class="track" class:can={m.canSeek} role="slider" tabindex="-1" aria-valuenow={Math.round(pct)} onclick={seek} onkeydown={() => {}}><div style:width="{pct}%"></div></div>
      <span>-{clock(m.duration - store.position)}</span>
    </div>

    <div class="ctrls">
      <span class="dev ellipsis">{#if sourceName}{sourceName}{/if}</span>
      <div class="buttons">
        <button aria-label="Previous" onclick={() => store.mediaCmd('prev')}><Icon name="prev" size={17} /></button>
        <button class="main" aria-label={m.playing ? 'Pause' : 'Play'} onclick={() => store.mediaCmd('toggle')}><Icon name={m.playing ? 'pause' : 'play'} size={15} /></button>
        <button aria-label="Next" onclick={() => store.mediaCmd('next')}><Icon name="next" size={17} /></button>
      </div>
      <span class="dev right ellipsis">{#if store.volume.device}<Icon name="device" size={12} />{store.volume.device.replace(/\s*\(.*\)$/, '')}{/if}</span>
    </div>
  </div>
{/if}

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; border-radius: 18px; padding: 10px 14px 8px; margin: 0 -2px;
          background: linear-gradient(180deg, rgba(255,255,255,.03), var(--accent-deep)); transition: background .8s; }
  .top { display: flex; align-items: center; gap: 12px; }
  .info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .info b { font-size: 15px; } .info span { color: rgba(255,255,255,.62); font-size: 11.5px; }
  .lyrics { height: 34px; margin-top: 7px; display: flex; flex-direction: column; justify-content: center; }
  .now { font-size: 13px; font-weight: 650; animation: rise .4s var(--ease); }
  .next { font-size: 11px; color: rgba(255,255,255,.5); }
  @keyframes rise { from { opacity: 0; transform: translateY(5px); filter: blur(2px); } }
  .seek { display: flex; align-items: center; gap: 9px; font-size: 10px; color: rgba(255,255,255,.65); margin-top: 4px; }
  .track { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.2); overflow: hidden; }
  .track.can { cursor: pointer; } .track.can:hover { height: 6px; }
  .track div { height: 100%; background: #fff; border-radius: 2px; transition: width .25s linear; }
  .ctrls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: auto; }
  .buttons { display: flex; align-items: center; gap: 20px; }
  .buttons button { opacity: .88; display: grid; place-items: center; } .buttons button:hover { opacity: 1; }
  .main { width: 36px; height: 36px; border-radius: 50%; background: #fff; color: #000; opacity: 1 !important; }
  .dev { font-size: 10.5px; color: rgba(255,255,255,.6); display: flex; align-items: center; gap: 5px; }
  .dev.right { justify-content: flex-end; }
  .empty { height: 100%; display: flex; align-items: center; justify-content: center; gap: 14px; }
  .empty p { font-weight: 600; } .empty span { color: var(--mute); font-weight: 400; font-size: 11.5px; }
</style>
