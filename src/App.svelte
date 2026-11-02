<script lang="ts">
  import { getApi } from './lib/api';
  import { Store } from './lib/store.svelte';
  import { Demo } from './lib/demo';
  import { pillState } from './lib/pill';
  import { collapsedRadius } from './lib/settings';
  import { cursor } from './lib/cursor.svelte';
  import type { Config, View } from './lib/types';
  import Pill from './components/Pill.svelte';
  import Home from './components/Home.svelte';
  import ClaudeView from './components/ClaudeView.svelte';
  import MusicView from './components/MusicView.svelte';
  import FocusView from './components/FocusView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import Icon from './components/Icon.svelte';
  import { features, ctxs, initFeatures } from './features/registry.svelte';

  const api = getApi();
  const store = new Store(api);
  initFeatures(store, api);
  (window as unknown as { __island: Store }).__island = store; // handy in devtools

  let demo: Demo | null = null;
  function applyConfig(c: Config) {
    store.config = c;
    if (c.demo && !demo) { demo = new Demo(store); demo.start(); }
    else if (!c.demo && demo) { demo.stop(); demo = null; }
  }
  api.config().then(applyConfig);
  (window as unknown as { __setDemo: (on: boolean) => void }).__setDemo = (on) => applyConfig({ ...store.config, demo: on });
  api.onConfig(applyConfig);

  // In a plain browser (no Electron) there is no cursor feed, so use the page's own mouse events.
  if (!window.island) {
    window.addEventListener('mousemove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY; cursor.near = true; });
    document.addEventListener('mouseleave', () => (cursor.near = false));
  }

  // ---- hover to open; the window lets clicks through everywhere except the island itself ----
  // The window is click-through ("ignore mouse") except while the pointer is over the island. Rather than trusting
  // mouseenter/mouseleave (which go stale when the window is hidden and shown again, e.g. by game mode), every mouse
  // move (Electron forwards them even while click-through) is hit-tested against the island's real geometry, so any
  // stuck state heals itself on the next move.
  // Hold Ctrl while the pointer is over the island and clicks (and hover) pass through to the app underneath.
  let islandEl: HTMLElement | undefined = $state();
  let openTimer = 0, closeTimer = 0, hovering = false, passing = $state(false), ignoring = true;
  let px = -1, py = -1; // last pointer position in window coordinates (-1 = unknown / outside)
  function startOpen() {
    if (store.expanded) return;
    clearTimeout(openTimer);
    openTimer = window.setTimeout(() => {
      const f = pill.feature; // a feature that owns the pill opens to its own tab
      if (f?.panel && f.pill?.openTab !== false) store.view = `f:${f.id}`;
      store.expanded = true;
    }, 110);
  }
  function collapse() {
    if (store.expanded) store.markSeen();
    store.expanded = false;
    store.selectedSession = null;
  }
  function overIsland(x: number, y: number) {
    if (!islandEl || x < 0) return false;
    for (const el of [islandEl, ...islandEl.querySelectorAll('.ear')]) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) return true;
    }
    return false;
  }
  // Ctrl comes from the native watcher when it is running (works with a still pointer); mouse events are the fallback.
  let nativeCtrl = false, haveNative = false, mouseCtrl = false;
  const ctrlHeld = () => (haveNative ? nativeCtrl : mouseCtrl);

  /**
   * Re-evaluate hover, Ctrl pass-through and click-through from the pointer position.
   * 'resend' sends the click-through state even if unchanged (the main process skips no-ops); 'force' makes the main
   * process apply it regardless (after the window was hidden and shown).
   */
  function updatePointer(mode: 'normal' | 'resend' | 'force' = 'normal') {
    const over = overIsland(px, py), pass = over && ctrlHeld();
    if (over && !hovering) { hovering = true; clearTimeout(closeTimer); if (!pass) startOpen(); }
    else if (!over && hovering) { hovering = false; clearTimeout(openTimer); clearTimeout(closeTimer); closeTimer = window.setTimeout(collapse, 380); }
    if (pass !== passing) {
      passing = pass;
      if (pass) clearTimeout(openTimer); else if (over) { clearTimeout(closeTimer); startOpen(); }
    }
    const ignore = !(over && !pass);
    if (store.config.debug && (ignore !== ignoring || mode !== 'normal')) console.log(`[pointer] ${mode} at ${Math.round(px)},${Math.round(py)} over=${over} ctrl=${pass} -> click-through ${ignore}`);
    if (mode !== 'normal' || ignore !== ignoring) { ignoring = ignore; api.ignoreMouse(ignore, mode === 'force'); }
  }
  window.addEventListener('mousemove', (e) => { px = e.clientX; py = e.clientY; mouseCtrl = e.ctrlKey; updatePointer(); });
  document.addEventListener('mouseleave', () => { px = py = -1; updatePointer(); }); // left the window entirely
  api.onCtrl((down) => { haveNative = true; nativeCtrl = down; updatePointer(); });
  // Something else changed click-through behind our back (the shelf's drop gate, a dialog): re-assert ours.
  window.addEventListener('island:resync', () => updatePointer('resend'));
  // The window was hidden and shown again: the old pointer position means nothing now.
  api.onResync(() => { px = py = -1; updatePointer('force'); });
  // During an OS file drag no mouse moves arrive, only dragover (and only while the shelf lets the drag in).
  let dragAt = 0;
  document.addEventListener('dragover', (e) => { dragAt = Date.now(); px = e.clientX; py = e.clientY; updatePointer(); });
  // Belt and braces: re-send the click-through state every couple of seconds (not mid-drag).
  setInterval(() => { if (Date.now() - dragAt > 1500) updatePointer('resend'); }, 2000);
  // Debug: show whether clicks reach the island at all, and what they land on.
  for (const t of ['mousedown', 'click'] as const) document.addEventListener(t, (e) => {
    if (!store.config.debug) return;
    const el = e.target as HTMLElement;
    console.log(`[${t}] at ${e.clientX},${e.clientY} on <${el?.tagName?.toLowerCase()} class="${el?.className}"> label=${el?.closest('button')?.getAttribute('aria-label') ?? '-'} view=${store.view}`);
  }, true);
  function enter(e: MouseEvent) { px = e.clientX; py = e.clientY; mouseCtrl = e.ctrlKey; updatePointer(); }
  function leave(e: MouseEvent) { px = e.clientX; py = e.clientY; updatePointer(); }

  const pill = $derived(pillState(store));
  const a = $derived(store.accent);

  const cfg = $derived(store.settings);
  const notch = $derived(cfg.style === 'notch');
  const featureTab = $derived(store.view.startsWith('f:') ? features.find((f) => `f:${f.id}` === store.view && f.panel && ctxs[f.id]?.enabled) ?? null : null);
  $effect(() => { if (store.view.startsWith('f:') && !featureTab) store.view = 'home'; }); // its feature was switched off
  const openHeight = $derived(store.view === 'settings' ? 340 : featureTab?.panel?.height ?? 236);
  const islandWidth = $derived(store.expanded ? cfg.expandedWidth : pill.width);
  const shellRadius = $derived(store.expanded ? (notch ? '0 0 30px 30px' : '30px') : collapsedRadius(cfg, pill.width));
  const pad = $derived(notch ? Math.round(Math.min(cfg.radiusX * 0.42, 70)) : 11);

  const tabs: { id: View; icon: string; label: string }[] = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'claude', icon: 'claude', label: 'Claude' },
    { id: 'music', icon: 'music', label: 'Music' },
    { id: 'focus', icon: 'focus', label: 'Focus' },
    { id: 'settings', icon: 'gear', label: 'Settings' }
  ];
  const allTabs = $derived([
    ...tabs.slice(0, -1),
    ...features.filter((f) => f.panel && ctxs[f.id]?.enabled).map((f) => ({ id: `f:${f.id}` as View, icon: f.panel!.icon, label: f.panel!.label })),
    tabs[tabs.length - 1]
  ]);
  const titles: Record<string, [string, string]> = { home: ['Home', ''], claude: ['Claude', 'Code'], music: ['Music', 'Player'], focus: ['Focus', 'Timer'], settings: ['Settings', ''] };
  const dateLabel = $derived(new Date(store.now).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
  const claudeDot = $derived(store.claude?.status === 'running' ? 'var(--claude)' : store.claude?.status === 'attention' ? 'var(--attn)' : store.claude?.status === 'done' && !store.claude.seen ? 'var(--done)' : '');
</script>

<div
  bind:this={islandEl}
  class="island"
  class:open={store.expanded}
  class:notch
  class:passing
  style:width="{islandWidth}px"
  style:height="{store.expanded ? openHeight : cfg.height}px"
  style:top="{notch ? 0 : cfg.topOffset}px"
  style:--h="{cfg.height}px"
  style:--ear="{notch ? cfg.ear : 0}px"
  style:--br={shellRadius}
  style:--pad="{pad}px"
  style:--pw="{cfg.expandedWidth}px"
  style:--ph="{openHeight}px"
  style:--accent="hsl({a.h} {a.s}% {a.l}%)"
  style:--accent-deep="hsl({a.h} {Math.min(a.s, 70)}% {Math.max(a.l - 26, 16)}%)"
  role="region"
  aria-label="Island"
  onmouseenter={enter}
  onmouseleave={leave}
>
  {#if notch && cfg.ear > 0}<span class="ear l"></span><span class="ear r"></span>{/if}
  <div class="shell">
    <div class="layer pill-layer" aria-hidden={store.expanded}>
      <Pill {store} kind={pill.kind} badges={pill.badges} feature={pill.feature} featureBadges={pill.featureBadges} />
    </div>

    <div class="layer panel" aria-hidden={!store.expanded}>
      <header>
        <span class="title"><b>{featureTab ? featureTab.panel!.label : titles[store.view][0]}</b>{#if !featureTab && titles[store.view][1]}<span class="accent {store.view}">{titles[store.view][1]}</span>{/if}</span>
        <span class="date tnum">{dateLabel}</span>
        <span class="status">
          {#if claudeDot}<i style:background={claudeDot}></i>{/if}
          {#if store.music.playing}<i style:background="var(--accent)"></i>{/if}
          {#if store.focus.running}<i style:background="var(--focus)"></i>{/if}
        </span>
      </header>

      <main>
        {#key store.view}
          <div class="view">
            {#if store.view === 'home'}<Home {store} />
            {:else if store.view === 'claude'}<ClaudeView {store} />
            {:else if store.view === 'music'}<MusicView {store} />
            {:else if store.view === 'settings'}<SettingsView {store} />
            {:else if featureTab}{@const C = featureTab.panel!.component}<C ctx={ctxs[featureTab.id]} />
            {:else}<FocusView {store} />{/if}
          </div>
        {/key}
      </main>

      <nav>
        {#each allTabs as t (t.id)}
          <button class:sel={store.view === t.id} onclick={() => (store.view = t.id)} aria-label={t.label}>
            <Icon name={t.icon} size={13} />{#if store.view === t.id}<span>{t.label}</span>{/if}
          </button>
        {/each}
      </nav>
    </div>
  </div>
</div>

<style>
  .island.passing { opacity: .5; }
  .island { position: absolute; left: 50%; transform: translateX(-50%);
            transition: width .5s var(--ease), height .5s var(--ease), top .35s var(--ease), opacity .12s ease-out; }
  .shell { position: absolute; inset: 0; background: #000; overflow: hidden; border-radius: var(--br);
           box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 8px 28px rgba(0,0,0,.35);
           transition: border-radius .45s var(--ease), box-shadow .4s; }
  .notch .shell { box-shadow: 0 10px 26px rgba(0,0,0,.35); }
  .open .shell { box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.55); }
  .notch.open .shell { box-shadow: 0 18px 50px rgba(0,0,0,.55); }
  .layer { position: absolute; inset: 0; transition: opacity .22s, filter .3s, transform .4s var(--ease); }
  .pill-layer { height: var(--h); }
  .open .pill-layer { opacity: 0; filter: blur(6px); transform: scale(.94); pointer-events: none; }
  .panel { width: var(--pw); height: var(--ph); left: 50%; transform: translateX(-50%) scale(.96); opacity: 0; filter: blur(6px); pointer-events: none;
           display: flex; flex-direction: column; padding: 11px 12px 8px; }
  .open .panel { opacity: 1; filter: none; transform: translateX(-50%); pointer-events: auto; transition-delay: .06s; }

  header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; height: 18px; padding: 0 4px; font-size: 11px; }
  .title b { font-weight: 700; }
  .accent { font-weight: 700; margin-left: .28em; } .accent.claude { color: var(--claude); } .accent.music { color: var(--accent); } .accent.focus { color: #c895ff; }
  .date { color: var(--mute); font-weight: 600; }
  .status { justify-self: end; display: flex; gap: 4px; }
  .status i { width: 6px; height: 6px; border-radius: 50%; }

  main { flex: 1; min-height: 0; margin-top: 8px; position: relative; }
  .view { position: absolute; inset: 0; animation: viewIn .35s var(--ease); }
  @keyframes viewIn { from { opacity: 0; transform: translateY(6px) scale(.985); } }

  nav { display: flex; justify-content: center; gap: 4px; margin-top: 7px; }
  nav button { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 11px; color: var(--mute); font-size: 11px; font-weight: 600; transition: background .2s, color .2s; }
  nav button:hover { color: #fff; }
  nav button.sel { background: rgba(255,255,255,.12); color: #fff; }
</style>
