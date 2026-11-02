# Features

Each feature is a folder here plus, if it needs Node/Windows access, `electron/features/<id>.cjs` and, if it needs
native Windows APIs, `helper/Features/<Name>.cs`. All three are discovered automatically.

## Renderer: `src/features/<id>/index.ts`

```ts
import type { IslandFeature } from '../types';
import MyPill from './MyPill.svelte';
import { state } from './state.svelte';   // module-level $state lives in a .svelte.ts file

const feature: IslandFeature = {
  id: 'my-thing', label: 'My thing', description: 'One line shown in Settings → Features', defaultEnabled: true,
  init(ctx) { ctx.on((data) => { /* update state from the Electron side */ }); },
  pill: { priority: (ctx) => (state.until > ctx.store.now ? 85 : null), width: () => 300, component: MyPill },
};
export default feature;
```

- Components receive `{ ctx }` (`FeatureProps`). Use `ctx.store` for shared app state (`store.now` ticks every 250 ms).
- Built-in pill priorities (`BUILTIN_PRIORITY` in `src/lib/pill.ts`): volume 100, focus-done 90, Claude attention 80,
  running 70, done 60, focus 50, lyrics 40, track 30, idle 0. A brief notice (like "Copied") should sit around 85–95
  and last 2–4 s. Something ongoing should sit below Claude (e.g. 45).
- Pill layout: the pill is a flex row, `height: var(--h)`, `padding: 0 var(--pad)`, gap 9px. Reuse the global classes
  `.text .ellipsis .dim .tnum .ico .trail` (see Pill.svelte) so it matches.
- Icons: `<Icon name="…">` takes a built-in name or a raw SVG path (24×24 viewBox, stroked).
- `pill.openTab` (default true): hovering while your feature owns the pill opens straight to your `panel` tab, so
  actions (Open, Copy, Mute…) belong in the panel, not in the pill (the pill hides as soon as the island opens).
- Cross-feature events: `islandEvents` in `src/lib/events.ts` (`emit('success'|'error'|'notice', { source, ... })`).
  Core already emits success on Claude done / focus complete and error on Claude needing attention.
- Dropped files: `ctx.api.pathForFile(file)` gives the real path of a `File` from a drop event.
- Keep each feature's styles inside its own components. Don't edit shared files except where your brief says so.

## Electron side: `electron/features/<id>.cjs`

```js
module.exports = {
  id: 'my-thing',
  start(ctx) {
    // ctx.send(data)                  -> renderer ctx.on(cb)
    // ctx.handle('action', async (arg) => result)  <- renderer ctx.call('action', arg)
    // ctx.enabled()                   -> is the switch on (check before doing work / sending)
    // ctx.helper.send('f:<prefix> args'), ctx.helper.on('<type>', (msg) => …)  (C# helper)
    // ctx.config.get() / ctx.config.set(obj)  -> %APPDATA%\Island\features\<id>.json (renderer: ctx.getConfig/ctx.setConfig)
    // ctx.suppress(true|false)       -> hide the island while true (game mode); independent of the user's Hide switch
    // ctx.app, ctx.win(), ctx.settings(), ctx.dataDir, ctx.log(...)
    return () => { /* stop: clear timers, watchers */ };
  }
};
```

## Helper side: `helper/Features/<Name>.cs`

Implement `IHelperFeature` (see `helper/Features/IHelperFeature.cs`). `Prefix` routes stdin commands
`f:<prefix> <args>` to `HandleAsync`. Emit with `Program.Emit(new JsonObject { ["type"] = "<type>", ... })`.
Never block: use timers/tasks, wrap Windows calls in try/catch and `Program.Log` failures.
