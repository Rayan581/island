<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { CONTROLS, PRESETS, collapsedRadius } from '../lib/settings';
  import Eyes from './Eyes.svelte';
  import { features, ctxs } from '../features/registry.svelte';

  let { store }: { store: Store } = $props();
  const s = $derived(store.settings);
  const notch = $derived(s.style === 'notch');
  const visible = $derived(CONTROLS.filter((c) => !(c.notchOnly && !notch) && !(c.floatingOnly && notch)));
  const previewW = $derived(Math.min(s.idleWidth, 480));
  const pad = $derived(notch ? Math.round(Math.min(s.radiusX * 0.42, 70)) : 11);
</script>

<div class="wrap">
  <div class="top">
    <div class="seg" role="group" aria-label="Pill style">
      <button class:sel={!notch} onclick={() => store.updateSettings(PRESETS.floating)}>Floating</button>
      <button class:sel={notch} onclick={() => store.updateSettings(PRESETS.notch)}>Notch</button>
    </div>
    <span class="hint">Picking a style loads its preset; the sliders then tune it.</span>
  </div>

  <div class="stage" style:height="{s.height + (notch ? 0 : s.topOffset) + 14}px" aria-label="Preview of the collapsed pill">
    <div class="mini" style:width="{previewW}px" style:height="{s.height}px" style:top="{notch ? 0 : s.topOffset}px" style:--ear="{notch ? s.ear : 0}px">
      {#if notch && s.ear > 0}<span class="ear l"></span><span class="ear r"></span>{/if}
      <div class="shell" style:border-radius={collapsedRadius(s, previewW)} style:padding="0 {pad}px">
        <Eyes follow={s.eyesFollow} />
      </div>
    </div>
  </div>

  <div class="grid">
    {#each visible as c (c.key)}
      <label class="row">
        <span class="lbl">{c.label}<b class="tnum">{s[c.key]}</b></span>
        <input type="range" min={c.min} max={c.max} step={c.step} value={s[c.key] as number}
          oninput={(e) => store.updateSettings({ [c.key]: +e.currentTarget.value })} />
      </label>
    {/each}
  </div>

  <div class="toggles">
    <label><input type="checkbox" checked={s.eyesFollow} onchange={(e) => store.updateSettings({ eyesFollow: e.currentTarget.checked })} />Eyes follow the cursor</label>
    <label><input type="checkbox" checked={s.keepOnTop} onchange={(e) => store.updateSettings({ keepOnTop: e.currentTarget.checked })} />Keep above other windows</label>
  </div>

  {#if features.length}
    <h4>Features</h4>
    <div class="feats">
      {#each features as f (f.id)}
        {@const on = ctxs[f.id]?.enabled ?? f.defaultEnabled}
        <div class="feat">
          <label><input type="checkbox" checked={on} onchange={(e) => store.setFeature(f.id, e.currentTarget.checked)} /><b>{f.label}</b><span class="hint">{f.description}</span></label>
          {#if on && f.settings}{@const C = f.settings}<div class="fset"><C ctx={ctxs[f.id]} /></div>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding: 0 4px 2px; scrollbar-width: thin; }
  .top { display: flex; align-items: center; gap: 10px; }
  .seg { display: inline-flex; background: var(--chip); border-radius: 12px; padding: 2px; }
  .seg button { padding: 3px 14px; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--mute); }
  .seg button.sel { background: rgba(255,255,255,.92); color: #000; }
  .hint { font-size: 10px; color: var(--faint); }
  .stage { position: relative; flex: none; border-radius: 12px; overflow: hidden; display: flex; justify-content: center;
           background: radial-gradient(circle at 50% 130%, #4262ff, #101a4d 75%); }
  .mini { position: absolute; left: 50%; transform: translateX(-50%); transition: width .3s var(--ease), height .3s var(--ease), top .3s var(--ease); }
  .shell { position: absolute; inset: 0; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; transition: border-radius .3s var(--ease); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
  .row { display: flex; flex-direction: column; gap: 1px; }
  .lbl { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--mute); }
  .lbl b { color: #fff; font-weight: 600; }
  input[type=range] { width: 100%; height: 16px; accent-color: #c4f5d2; cursor: pointer; }
  .toggles { display: flex; gap: 18px; font-size: 11px; color: var(--mute); }
  .toggles label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .toggles input { accent-color: #c4f5d2; }
  h4 { margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); }
  .feats { display: flex; flex-direction: column; gap: 6px; }
  .feat label { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .feat .hint { font-size: 11px; }
  .fset { padding: 4px 0 2px 24px; font-size: 11.5px; }
</style>
