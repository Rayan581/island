<script lang="ts">
  import type { FeatureProps } from '../types';
  import { clip, clearAll } from './state.svelte';

  let { ctx }: FeatureProps = $props();

  function save() {
    ctx.setConfig({ peekText: clip.cfg.peekText, keepHistory: clip.cfg.keepHistory }).catch(() => {});
  }
</script>

<div class="opts">
  <label><input type="checkbox" checked={clip.cfg.peekText} onchange={(e) => { clip.cfg.peekText = e.currentTarget.checked; save(); }} />Show a peek when copying text <span class="hint">(images always peek)</span></label>
  <label><input type="checkbox" checked={clip.cfg.keepHistory} onchange={(e) => { clip.cfg.keepHistory = e.currentTarget.checked; if (!clip.cfg.keepHistory) clearAll(); save(); }} />Keep history <span class="hint">(text stays in memory; images are PNGs in Island's data folder, last 10)</span></label>
</div>

<style>
  .opts { display: flex; flex-direction: column; gap: 5px; }
  label { display: flex; align-items: baseline; gap: 7px; cursor: pointer; }
  input { accent-color: #c4f5d2; }
  .hint { color: var(--mute); font-size: 10.5px; }
</style>
