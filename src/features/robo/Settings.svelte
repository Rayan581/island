<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeatureProps } from '../types';
  import { roboSettings, loadRoboSettings, saveRoboSettings } from './state.svelte';
  import type { Energy } from './mood';
  let { ctx }: FeatureProps = $props();
  onMount(() => { loadRoboSettings(ctx); });
  const levels: { id: Energy; label: string; tip: string }[] = [
    { id: 'calm', label: 'Calm', tip: 'Only reacts to events (Claude, music, battery, idle); no cursor games' },
    { id: 'normal', label: 'Normal', tip: 'Also notices your cursor: curious, startled, dizzy, winks' },
    { id: 'playful', label: 'Playful', tip: 'Fidgets more and reacts at a smaller nudge' }
  ];
  const set = (fn: () => void) => { fn(); saveRoboSettings(ctx); };
</script>
<div class="seg" role="group" aria-label="How lively Robo is">
  {#each levels as l (l.id)}
    <button class:sel={roboSettings.energy === l.id} title={l.tip} onclick={() => set(() => (roboSettings.energy = l.id))}>{l.label}</button>
  {/each}
</div>
<label><input type="checkbox" checked={roboSettings.sleepyAtNight} onchange={(e) => set(() => (roboSettings.sleepyAtNight = e.currentTarget.checked))} />Sleepy at night (00:00-06:00)</label>
<label><input type="checkbox" checked={roboSettings.sounds} onchange={(e) => set(() => (roboSettings.sounds = e.currentTarget.checked))} />Soft sounds on reactions</label>
<style>
  label { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--mute); cursor: pointer; margin-top: 5px; }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--chip, rgba(255,255,255,.08)); }
  .seg button { font-size: 10.5px; font-weight: 600; padding: 2px 10px; border-radius: 999px; color: var(--mute); }
  .seg button.sel { background: rgba(255,255,255,.16); color: #fff; }
</style>
