<script lang="ts">
  import type { FeatureProps } from '../types';
  import { bat } from './state.svelte';
  import { clampThreshold } from './logic';
  let { ctx }: FeatureProps = $props();
  let timer = 0;
  function change(v: string) {
    bat.threshold = clampThreshold(v);
    clearTimeout(timer);
    timer = window.setTimeout(() => ctx.setConfig({ threshold: bat.threshold }), 200);
  }
</script>

<div class="row">
  <span class="lbl">Low battery warning <b class="tnum">{bat.threshold}%</b></span>
  <input type="range" min="10" max="30" step="1" value={bat.threshold} oninput={(e) => change(e.currentTarget.value)} />
</div>

<style>
  .row { display: flex; flex-direction: column; gap: 1px; max-width: 260px; }
  .lbl { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--mute); }
  .lbl b { color: var(--ink); font-weight: 600; }
  input[type=range] { width: 100%; height: 16px; accent-color: #c4f5d2; cursor: pointer; }
</style>
