<script lang="ts">
  import type { FeatureProps } from '../types';
  import { calls } from './state.svelte';

  let { ctx }: FeatureProps = $props();
  const missing = $derived(!calls.helper && ctx.store.config.platform === 'win32');
</script>

<div class="note">
  Hotkey <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> toggles the default microphone.
  {#if missing}<span class="warn">Needs the music helper (<code>npm run build:helper</code>).</span>{/if}
</div>

<style>
  .note { font-size: 10.5px; color: var(--mute); line-height: 1.5; }
  .warn { color: var(--attn); display: block; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 10px; }
  kbd { font: inherit; font-size: 10px; padding: 0 4px; border-radius: 4px; background: var(--chip); border: 1px solid var(--line); }
</style>
