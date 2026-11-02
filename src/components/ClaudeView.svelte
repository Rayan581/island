<script lang="ts">
  import type { Store } from '../lib/store.svelte';
  import { toolLabel } from '../lib/store.svelte';
  import { clock, ago } from '../lib/format';
  import Icon from './Icon.svelte';

  let { store }: { store: Store } = $props();
  const c = $derived(store.claude);
  const steps = ['Read', 'Edit', 'Test', 'Done'];
  const tone = $derived(!c ? '' : c.status === 'done' ? 'done' : c.status === 'attention' ? 'attn' : '');
</script>

{#if !c}
  <div class="empty">
    <Icon name="claude" size={22} />
    {#if store.config.claudeConnected || store.config.demo}
      <p>No Claude Code session yet.<br /><span>Start <code>claude</code> in any project and it shows up here.</span></p>
    {:else}
      <p>Claude Code isn’t connected.<br /><span>Right-click the Island tray icon → <b>Connect Claude Code…</b></span></p>
    {/if}
  </div>
{:else}
  <div class="wrap">
    <div class="card {tone}">
      <div class="proj ellipsis"><span class="sq"></span>{c.project}</div>
      <div class="big tnum">{c.status === 'done' ? 'Done' : c.status === 'attention' ? 'Waiting' : clock(store.elapsed(c))}</div>
      <div class="sub ellipsis">
        {#if c.status === 'running'}{toolLabel(c.tool)} · step {c.phase + 1} of 4 · {c.toolCount} tool{c.toolCount === 1 ? '' : 's'}
        {:else if c.status === 'done'}Finished in {clock(store.elapsed(c))} · {ago(store.now - c.endedAt)}
        {:else if c.status === 'attention'}Needs your answer in the terminal
        {:else}Session open{/if}
      </div>
      <div class="steps">
        {#each steps as label, i}
          <div class="step" class:on={c.status !== 'idle' && i <= c.phase} class:live={c.status === 'running' && i === c.phase}><i></i><span>{label}</span></div>
        {/each}
      </div>
    </div>
    <div class="side">
      <div class="term">
        <div class="cmd ellipsis">{c.status === 'running' ? (c.detail || toolLabel(c.tool)) : c.status === 'attention' ? c.detail : c.status === 'done' ? '✓ Turn complete' : '–'}</div>
        <div class="state">{c.status === 'running' ? `${toolLabel(c.tool)}…` : c.status === 'attention' ? 'Waiting for you' : c.status === 'done' ? `${c.toolCount} tool calls` : 'Idle'}</div>
      </div>
      {#if store.sessionList.length > 1}
        <div class="sessions">
          {#each store.sessionList.slice(0, 4) as s (s.id)}
            <button class="chip" class:sel={s.id === c.id} onclick={() => (store.selectedSession = s.id)}>
              <span class="d {s.status}"></span>{s.project}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .wrap { display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; height: 100%; }
  .card { border-radius: 18px; padding: 11px 14px 10px; display: flex; flex-direction: column; min-width: 0;
          background: linear-gradient(165deg, #1b1b1b 10%, var(--claude-deep)); transition: background .6s; }
  .card.done { background: linear-gradient(165deg, #0d1424 5%, var(--done)); }
  .card.attn { background: linear-gradient(165deg, #1c160a 10%, #8a5a12); }
  .proj { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.8); display: flex; align-items: center; gap: 6px; }
  .sq { width: 10px; height: 10px; border-radius: 3px; background: var(--claude); flex: none; }
  .done .sq { background: #93c5fd; } .attn .sq { background: var(--attn); }
  .big { font-size: 36px; font-weight: 700; letter-spacing: -.03em; margin-top: 4px; line-height: 1.05; }
  .sub { font-size: 10.5px; color: rgba(255,255,255,.7); margin-top: 2px; }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: auto; }
  .step i { display: block; height: 3px; border-radius: 2px; background: rgba(255,255,255,.2); transition: background .4s; }
  .step.on i { background: rgba(255,255,255,.92); }
  .step.live i { animation: pulse 1.2s ease-in-out infinite; }
  .step span { font-size: 9.5px; color: rgba(255,255,255,.6); margin-top: 4px; display: block; }
  .side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .term { flex: 1; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid var(--line); padding: 10px 12px; min-width: 0;
          font-family: "Cascadia Code", Consolas, ui-monospace, monospace; }
  .cmd { font-size: 12px; color: #fff; }
  .state { font-size: 10.5px; color: var(--mute); margin-top: 4px; font-family: inherit; }
  .sessions { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 10px; background: var(--chip); font-size: 10.5px; color: var(--mute); }
  .chip.sel { color: #fff; background: rgba(255,255,255,.14); }
  .d { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .d.running { background: var(--claude); } .d.done { background: var(--done); } .d.attention { background: var(--attn); }
  .empty { height: 100%; display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--mute); }
  .empty p { color: #fff; font-weight: 600; } .empty span { color: var(--mute); font-weight: 400; font-size: 11.5px; }
  code { font-family: Consolas, ui-monospace, monospace; background: var(--chip); padding: 0 4px; border-radius: 4px; color: #fff; }
</style>
