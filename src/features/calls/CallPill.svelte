<script lang="ts">
  import type { FeatureProps } from '../types';
  import Icon from '../../components/Icon.svelte';
  import { clock } from '../../lib/format';
  import { calls, callApp, MIC_PATH, MIC_OFF_PATH, MUTE_COLOR } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const secs = $derived(Math.max(0, (ctx.store.now - calls.callSince) / 1000));
</script>

<span class="ico mic" style:color={calls.muted ? MUTE_COLOR : '#fff'}><Icon name={calls.muted ? MIC_OFF_PATH : MIC_PATH} size={16} /></span>
<span class="text ellipsis">{#if calls.muted}<b style:color={MUTE_COLOR}>Muted</b>{:else}In call{/if} <span class="dim">· {callApp()}</span></span>
<span class="trail tnum dim">{clock(secs)}</span>

<style>
  .mic { transition: color .2s; }
</style>
