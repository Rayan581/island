<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import { clock } from '../../lib/format';
  import { calls, callApp, inCall, MIC_PATH, MIC_OFF_PATH, CAM_PATH, MIC_COLOR, CAM_COLOR, MUTE_COLOR } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const secs = $derived(Math.max(0, (ctx.store.now - calls.callSince) / 1000));
  const live = $derived(calls.mic.length > 0);
  const toggle = () => { ctx.call('toggleMute').catch(() => {}); };
  const status = $derived(!calls.helper ? 'Helper not running' : calls.muted ? 'Microphone muted' : live ? 'Microphone live' : 'Microphone idle');
</script>

<div class="wrap">
  <div class="left">
    <button class="mute" class:muted={calls.muted} disabled={!calls.helper} aria-label={calls.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={calls.muted} onclick={toggle}>
      <Icon name={calls.muted ? MIC_OFF_PATH : MIC_PATH} size={34} />
    </button>
    <div class="state" class:muted={calls.muted}>{status}</div>
    <div class="sub tnum">{#if inCall()}{callApp()} · {clock(secs)}{:else if calls.helper}No call right now{:else}npm run build:helper{/if}</div>
  </div>

  <div class="right">
    <section>
      <h5><span class="i" style:color={MIC_COLOR}><Icon name={MIC_PATH} size={12} /></span>Microphone</h5>
      {#if calls.mic.length}
        <div class="chips">{#each calls.mic as a (a.name)}<span class="chip" class:call={a.call}><i style:background={MIC_COLOR}></i>{a.name}</span>{/each}</div>
      {:else}<p class="none">Not in use</p>{/if}
    </section>
    <section>
      <h5><span class="i" style:color={CAM_COLOR}><Icon name={CAM_PATH} size={12} /></span>Camera</h5>
      {#if calls.cam.length}
        <div class="chips">{#each calls.cam as a (a.name)}<span class="chip"><i style:background={CAM_COLOR}></i>{a.name}</span>{/each}</div>
      {:else}<p class="none">Not in use</p>{/if}
    </section>
    <div class="hint"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>M</kbd><span>mutes the microphone from anywhere</span></div>
  </div>
</div>

<style>
  .wrap { height: 100%; display: grid; grid-template-columns: 170px 1fr; gap: 16px; padding: 4px 6px 2px; }
  .left { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
  .mute { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; color: #000; background: #fff;
          box-shadow: 0 0 0 0 rgba(255,255,255,0); transition: background .2s, color .2s, transform .15s var(--ease, ease), box-shadow .3s; }
  .mute:hover:not(:disabled) { transform: scale(1.05); }
  .mute:active:not(:disabled) { transform: scale(.96); }
  .mute.muted { background: #ff453a; color: #fff; box-shadow: 0 0 0 7px rgba(255,69,58,.16); }
  .mute:disabled { opacity: .35; cursor: default; }
  .state { font-size: 12.5px; font-weight: 600; margin-top: 4px; }
  .state.muted { color: #ff6961; }
  .sub { font-size: 11px; color: var(--mute); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { display: flex; flex-direction: column; justify-content: center; gap: 12px; min-width: 0; }
  h5 { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--mute); margin-bottom: 6px; letter-spacing: .02em; }
  .i { display: grid; place-items: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; background: var(--chip); font-size: 12px; font-weight: 600; }
  .chip i { width: 6px; height: 6px; border-radius: 50%; display: block; flex: none; }
  .none { font-size: 12px; color: var(--faint); }
  .hint { display: flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--faint); }
  .hint span { margin-left: 6px; }
  kbd { font: inherit; font-size: 10.5px; font-weight: 600; color: var(--mute); padding: 1px 6px; border-radius: 5px; background: var(--chip); border: 1px solid var(--line); }
</style>
