<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { clock } from '../lib/format';
  import Icon from './Icon.svelte';

  let { store }: { store: Store } = $props();
  const f = $derived(store.focus);
  const pct = $derived((1 - f.left / f.total) * 100);
  const presets = [15, 25, 50];
</script>

<div class="wrap">
  <div class="left">
    <div class="time tnum">{clock(f.left)}</div>
    <div class="sub">{f.running ? 'Focusing — notifications stay quiet in the island' : f.left < f.total ? 'Paused' : `${f.total / 60} minute session`}</div>
    <div class="bar"><div style:width="{pct}%"></div></div>
  </div>
  <div class="right">
    <div class="presets">
      {#each presets as p}
        <button class:sel={f.total === p * 60} disabled={f.running} onclick={() => store.setFocusLength(p)}>{p}m</button>
      {/each}
    </div>
    <div class="buttons">
      <button class="ghost" aria-label="Reset" onclick={() => store.resetFocus()}><Icon name="reset" size={15} /></button>
      <button class="main" aria-label={f.running ? 'Pause' : 'Start'} onclick={() => store.toggleFocus()}><Icon name={f.running ? 'pause' : 'play'} size={16} /></button>
    </div>
  </div>
</div>

<style>
  .wrap { height: 100%; display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; border-radius: 18px; padding: 14px 16px;
          background: linear-gradient(165deg, #191919 20%, var(--focus-deep)); }
  .left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .time { font-size: 50px; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
  .sub { font-size: 11px; color: rgba(255,255,255,.66); margin-top: 6px; }
  .bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,.16); margin-top: 12px; overflow: hidden; }
  .bar div { height: 100%; background: #d4a8ff; transition: width .3s linear; }
  .right { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
  .presets { display: flex; gap: 5px; }
  .presets button { padding: 4px 10px; border-radius: 10px; background: rgba(255,255,255,.08); font-size: 11px; color: rgba(255,255,255,.75); }
  .presets button.sel { background: rgba(255,255,255,.9); color: #000; font-weight: 600; }
  .presets button:disabled { opacity: .45; cursor: default; }
  .buttons { display: flex; gap: 10px; align-items: center; }
  .main { width: 44px; height: 44px; border-radius: 50%; background: #fff; color: #000; display: grid; place-items: center; }
  .ghost { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid; place-items: center; }
</style>
