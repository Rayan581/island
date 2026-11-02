<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeatureProps } from '../types';
  import { roboSettings } from './state.svelte';
  let { ctx }: FeatureProps = $props();
  onMount(() => { ctx.getConfig<{ sleepyAtNight?: boolean }>().then((c) => { if (typeof c.sleepyAtNight === 'boolean') roboSettings.sleepyAtNight = c.sleepyAtNight; }).catch(() => {}); });
  function toggle(on: boolean) { roboSettings.sleepyAtNight = on; ctx.setConfig({ sleepyAtNight: on }); }
</script>
<label><input type="checkbox" checked={roboSettings.sleepyAtNight} onchange={(e) => toggle(e.currentTarget.checked)} />Sleepy at night (00:00-06:00)</label>
<style>
  label { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--mute); cursor: pointer; }
</style>
