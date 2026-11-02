# Island: new-features plan

Ten features, built by eight parallel agents (features that share code are grouped). Each agent works in its own git
worktree on top of commit `7a92549` ("Feature framework") and delivers one commit. The coordinator merges them.

## Rules for every agent

**Read first:** `src/features/README.md`, `src/features/types.ts`, `src/features/registry.svelte.ts`,
`electron/features/index.cjs`, `helper/Features/IHelperFeature.cs`, `src/lib/pill.ts`, `src/components/Pill.svelte`,
`src/lib/store.svelte.ts`, `src/app.css`, `README.md`.

**Where code goes.** Only in your feature's own files:
- `src/features/<id>/` (index.ts, components, a `state.svelte.ts` for module-level `$state`)
- `electron/features/<id>.cjs` (Node / Electron side)
- `helper/Features/<Name>.cs` (only if a native Windows API is truly needed)
- `tests/<id>.test.cjs` (node:test, for any pure logic: parsing, detection rules, formatting)
- A short section in `README.md` under a heading `### <Feature label>` placed inside a `## Features` section
  (create `## Features` right before `## Requirements` if it isn't there yet; add only your own subsection).

Do **not** edit shared files (App.svelte, Pill.svelte, pill.ts, store.svelte.ts, types.ts, main.cjs, preload.cjs,
settings.*, Program.cs, Icon.svelte, app.css, other features). Your brief names the only exceptions. If the framework
truly can't do something, do the smallest additive change, and say so in your final report.

**Look and feel.** Match the existing island: black shell, white text, `var(--mute)` for secondary text, 12.5px/600
in the pill, the accent colours in `app.css` (`--claude`, `--attn`, `--done`, `--focus`). Animations short (150–400ms,
`var(--ease)`). The pill is ~32–36px tall: one line of content, an icon/thumbnail at most 22px. Panels are 520px wide
(`expandedWidth` setting) and ~236px tall unless you set `panel.height` (max 340).

**Pill priorities** (higher wins; built-ins: volume 100, focus-done 90, Claude attention 80, running 70, done 60,
focus 50, lyrics 40, track 30, idle 0). Brief notices: 84–95 for 2–6 s. Ongoing states: below Claude.

**Windows only.** Everything runs on Windows 10/11. Guard Windows-only code with `process.platform === 'win32'` (Node)
so the app still starts on Linux for tests. Never crash the main process: wrap watchers in try/catch, log with
`ctx.log`. Clean up timers/watchers in the stop function.

**Privacy.** Clipboard/notification content stays in memory unless the brief says otherwise; never log content.

**C# helper.** It can't be compiled in this environment (NuGet is blocked), so the user compiles it. Keep C# small,
conservative and obviously correct: plain P/Invoke and `Microsoft.Win32.Registry`, no new NuGet packages, nullable
annotations right, every Windows call in try/catch, all work on timers (never block stdin). Prefer Node/Electron when
it can do the job.

**Verify before finishing:** `npx svelte-check` (0 errors), `npx vite build`, `node --test tests/*.test.cjs` (all pass),
`node --check` on your .cjs files. If you add a feature with UI, render it in the browser preview
(`npx vite build && npx vite preview --port <free port>`, then drive `window.__island` with Playwright; the
`ctx.call` calls return null there) and look at a screenshot. Kill only the preview process you started (by PID, never
`pkill -f` with a pattern that appears in your own command).

**Commit** in your worktree: one commit, message `<Feature label>: <one line>` plus a short body.
Author is already configured. **Do not add any Co-Authored-By or Claude-Session trailers** (the user asked for none).
Do not push.

**Final report** (your last message, under 250 words): files added/changed, what was verified, what could not be
verified (anything needing real Windows), any shared-file edits and why, and known limitations.

---

## Agent 1: Clipboard peek + Screenshot catch  (`clipboard`)

**Goal.** Copying shows a brief "Copied" peek in the pill; the panel keeps a short history to re-copy. Taking a
screenshot (Win+Shift+S, PrtScn) drops a thumbnail into the island with Copy / Show in folder / drag-out.

**Electron side (`electron/features/clipboard.cjs`).**
- Poll `clipboard` every 400 ms; detect change cheaply: `clipboard.readText()` + `availableFormats()`; for images,
  compare `readImage().getSize()` + a hash of a downscaled bitmap (`resize({width:32})`) so large images aren't hashed.
- Skip content flagged by password managers: if `clipboard.has('ExcludeClipboardContentFromMonitorProcessing')`
  or `clipboard.has('CanIncludeInClipboardHistory')`-style formats exist, do nothing (check what Electron reports;
  document what you rely on).
- Ignore changes caused by Island itself (when re-copying from history, remember the value and skip the next change).
- Text: send `{ kind: 'text', text: first 2000 chars, chars: n, at }`.
- Image: save PNG to `ctx.dataDir/clipboard/<timestamp>.png` (keep last 10, delete older), send
  `{ kind: 'image', file, thumb: small dataURL (≤ 96px tall), w, h, at }`. Treat an image that appears within 2 s of
  Win+Shift+S / PrtScn as a screenshot: you can't see the key press, so also watch
  `%USERPROFILE%\Pictures\Screenshots` (Windows 11 Snipping Tool auto-save) with `fs.watch`; a new PNG there = a
  screenshot `{ kind: 'image', screenshot: true, file: <that path> }`. Any clipboard image counts as "image".
- Handlers: `copyText(text)`, `copyImage(file)`, `showInFolder(file)` (`shell.showItemInFolder`),
  `startDrag(file)` → `ctx.win().webContents.startDrag({ file, icon: nativeImage thumbnail })`.

**Renderer (`src/features/clipboard/`).**
- State: history (last 20 text, last 6 images), `peekUntil`, `lastItem`.
- Pill (priority 88 for 2.5 s text / 4 s image): text → clipboard icon + first line ellipsised + `n chars` trail;
  image/screenshot → 22px thumbnail + "Screenshot" or "Image copied" + `w×h`.
- Panel tab "Clipboard" (icon: clipboard path): screenshots/images row at top (thumbnails, hover shows Copy / Folder,
  draggable via `ondragstart` → `ctx.call('startDrag', file)` with `preventDefault`), then text history list (click a
  row to copy it back; show "Copied" feedback). A "Clear" button.
- Settings: "Show a peek when copying text" toggle (images always peek), "Keep history" toggle.
- Emit `islandEvents.emit('notice', { source: 'clipboard', kind })` on screenshot.
- Tests: change-detection/dedupe helper and text summarising (first line, char count) as pure functions in a
  `.cjs` you can require from tests.

## Agent 2: Download done  (`downloads`)

**Goal.** When a download finishes, the pill shows its name; hovering opens the Downloads tab with Open / Show in folder.

**Electron side.**
- Watch `app.getPath('downloads')` (non-recursive) with `fs.watch`; on events, debounce 300 ms then scan.
- A download is "done" when a file with a final name exists, its size is > 0 and unchanged for 1.5 s, it isn't a
  temp/partial (`.crdownload .part .partial .tmp .download .opdownload ~$*`, names starting with `.`), and it was
  created/modified after Island started. Browsers rename `x.crdownload` → `x` at the end: handle rename events.
- Dedupe by path+size+mtime; ignore folders.
- Send `{ name, path, size, ext, at, icon: dataURL from app.getFileIcon(path, {size:'normal'}) }`.
- Handlers: `open(path)` (`shell.openPath`), `showInFolder(path)`, `list()` → recent 8 (in memory) ,
  `startDrag(path)`.
- Pure logic (temp-name check, "is stable" decision) in a module with tests.

**Renderer.**
- Pill (priority 86 for 6 s): file icon (22px) + name ellipsised + size trail (e.g. "24 MB"); `openTab` true.
- Badge (icon: download arrow, colour `--done`) for 60 s after a download if the pill is showing something else.
- Panel tab "Downloads": list of recent downloads (icon, name, size, time ago) with Open and Folder buttons, rows
  draggable out. Empty state text.
- Emit `islandEvents.emit('notice', { source: 'downloads', name })`.

## Agent 3: Battery and charging  (`battery`)

**Goal.** Plug in / unplug → a short iPhone-style charging animation with the percentage; low battery warnings.

**Renderer only (plus optional main events).**
- Use `navigator.getBattery()` (works in Electron's Chromium): `level`, `charging`, events `levelchange`,
  `chargingchange`. Detect "no battery" (desktop): `charging && level === 1 && chargingTime === 0` stable at startup
  → feature stays silent. Optionally confirm plug events via `powerMonitor` `on-ac` / `on-battery` in
  `electron/features/battery.cjs` (send `{ ac: bool }`) if it improves reliability; either source triggers the peek.
- Pill (priority 87, 3.5 s) on plug/unplug: a battery glyph built in CSS (rounded rect + nub) filling to the level
  with a smooth animated fill; green when charging (with a lightning bolt pulse), white when on battery; percentage
  trail ("82%"). The fill animates from 0 to the level when plugged in (the iPhone feel).
- Low battery (priority 92, 5 s): at 20% and 10% while discharging, once per discharge cycle; red/amber glyph,
  text "Low battery". Emit `islandEvents.emit('error', { source: 'battery', level })` on 10%.
- Badge (battery icon, amber) while < 20% and discharging.
- Settings: low-battery threshold (10–30%, default 20) via `ctx.setConfig`.
- No panel. Tests: the "when to warn" state machine as a pure function.

## Agent 4: Mic / camera in use + call mute  (`calls`)

**Goal.** A small orange dot while any app uses the microphone, green while the camera is in use. During a call
(mic in use by a call app), the pill shows the call with a mute button in its tab; a global hotkey toggles mute.

**Detection (C# helper, `helper/Features/MicCam.cs`, `Prefix = "mic"`).**
- Every 1 s read `HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`
  and `...\webcam`: for each app subkey (packaged apps directly, desktop apps under `NonPackaged`), the app is using
  the device when `LastUsedTimeStart` > 0 and `LastUsedTimeStop` == 0. Desktop app key names are paths with `#`
  instead of `\` → take the file name. Exclude Island's own processes.
- Mic mute: `NAudio.CoreAudioApi.MMDeviceEnumerator().GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications)
  .AudioEndpointVolume.Mute` (NAudio is already referenced). Commands: `f:mic toggle`, `f:mic mute`, `f:mic unmute`.
- Emit `{ type: "miccam", mic: [names], cam: [names], muted: bool }` only when something changes (plus on start).

**Electron side.** `ctx.helper.on('miccam', ...)` → `ctx.send(...)`; handlers `toggleMute`, `setMute(bool)` →
`ctx.helper.send('f:mic …')`. Global shortcut **Ctrl+Alt+M** toggles mute (register/unregister with the enabled
switch; tolerate failure). Pure logic: friendly app names (`discord.exe`→Discord, `ms-teams.exe`/`MSTeams_*`→Teams,
`zoom.exe`→Zoom, `chrome.exe`/`msedge.exe`/`firefox.exe`→ browser name, packaged `Microsoft.WindowsCamera_*`→Camera)
and "is this a call app" (Discord, Teams, Zoom, Slack, Skype, WhatsApp, Telegram, browsers count as possible Meet)
in a tested module.

**Renderer.**
- Badges: orange dot (`#ff9f0a`) while the mic is in use, green dot (`#30d158`) while the camera is.
  Badge icon can be a filled circle path.
- Pill (priority 75, while a call app has the mic): mic icon (struck through + red when muted) + "In call · Discord"
  + a live "0:42" call timer trail. `openTab` true.
- Panel tab "Call": big round mute button (red when muted), which apps use mic/camera, hotkey hint.
- If the helper isn't running (no messages), the feature stays silent and its settings say "needs the music helper
  (npm run build:helper)".
- Emit `islandEvents.emit('notice', { source: 'calls' })` on call start.

## Agent 5: Notification mirror  (`notifications`)

**Goal.** Notifications from chosen apps (default: WhatsApp, Discord, Gmail/Mail, Telegram, Slack, Teams) appear
briefly in the pill; the tab lists recent ones.

**Electron side.**
- Read Windows' notification database `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db` with
  `node:sqlite` (`DatabaseSync`, available in Electron 38; silence its ExperimentalWarning). It's in WAL mode and
  locked by Windows: copy `wpndatabase.db`, `-wal`, `-shm` to a temp dir and open the copy read-only each poll
  (every 2 s; only if the source mtime changed).
- Tables: `Notification` (Id, HandlerId, Type 'toast', Payload (XML), ArrivalTime (FILETIME ticks)) and
  `NotificationHandler` (RecordId, PrimaryId = app id). Verify the schema defensively (`PRAGMA table_info`); if it
  doesn't match, disable with a logged reason.
- New = Id greater than the last seen (start from the current max at launch, so old ones aren't replayed).
- Parse the toast XML: `<text>` elements → title (first), body (rest); ignore images. Do this with a small
  regex/entity-decoding parser (no new dependencies); test it.
- App names from PrimaryId (`5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App` → WhatsApp,
  `com.squirrel.Discord.Discord` → Discord, Chrome/Edge PWA ids, `microsoft.windowscommunicationsapps…` → Mail);
  unknown ids → a cleaned-up readable name. Tested mapping.
- Config (ctx.config): `{ apps: { [primaryId]: boolean } }`; apps not in the map use the default rule (matches the
  default list). Handler `seenApps()` → list of app ids + names seen since start, for the settings component.
- Never write notification content to disk or logs.

**Renderer.**
- Pill (priority 84, 5 s): app initial in a small rounded square coloured by app (WhatsApp green, Discord blurple…)
  + **title** · body ellipsised. Queue: if several arrive, show each for 3 s.
- Panel tab "Notifications": last 20 (app, title, body 2 lines, time ago), "Clear".
- Settings component: per-app toggles from `seenApps()` + defaults.
- Note in README: Island can't suppress Windows' own toasts; to have them only in the island, turn off banners for
  those apps in Windows Settings → System → Notifications (keep "Show notifications in notification center" on, or the
  database never gets them).

## Agent 6: Drop zone shelf  (`shelf`)

**Goal.** Drag files onto the island to park them; drag them out later (like Dropover).

**The hard part: getting drops into a click-through window.** The window ignores the mouse except while the pointer
is over the island, and during an OS drag no mouse events are forwarded. Plan:
1. Add a tiny C# feature `helper/Features/MouseButtons.cs` (`Prefix = "mouse"`) that polls
   `GetAsyncKeyState(VK_LBUTTON)` every 30 ms and emits `{ type: "lbutton", down }` on change.
2. The renderer reports the island's rectangle (window-relative CSS px, from `.island` + `.ear` bounding boxes,
   every 150 ms when changed) via `ctx.call('rect', r)`.
3. `electron/features/shelf.cjs` polls `screen.getCursorScreenPoint()` every 50 ms only while the left button is
   down; if the cursor is within the island rect (+12px), call `ctx.win().setIgnoreMouseEvents(false)` so the webview
   receives `dragenter`/`drop`; when the button is released or the cursor leaves, restore
   `setIgnoreMouseEvents(true, { forward: true })` unless the renderer reported it is hovering (send state both
   ways; keep this logic in the feature).
4. Fallback that always works: an "Add files…" button in the Shelf tab (`dialog.showOpenDialog`, multi-select).
- Renderer: document-level `dragenter/dragover/drop` listeners (in `init`): while dragging files over the island,
  show a "Drop to shelf" highlight (expand the island to the Shelf tab). On drop, get paths with
  `ctx.api.pathForFile(file)` and `ctx.call('add', paths)`.
- Shelf items: `{ path, name, size, icon dataURL (app.getFileIcon) }`, persisted with `ctx.config` (paths only; drop
  missing files on load), max 24.
- Drag out: tiles `draggable`, `ondragstart` → `preventDefault()` + `ctx.call('startDrag', paths)` →
  `ctx.win().webContents.startDrag({ files: paths, icon })` (multi-file `files` is supported).
- Tile actions on hover: remove (×), open, show in folder. "Clear all".
- Pill: no takeover; a badge with the item count while the shelf has items (icon: tray/inbox path).
- Panel tab "Shelf": grid of tiles (icon + name), empty state "Drag files here".
- Tests: rect hit-test and the add/dedupe/persist logic.

## Agent 7: Game mode  (`game-mode`)

**Goal.** The island gets out of the way while a fullscreen game or video is in front, and shows the session time
afterwards. (FPS isn't feasible without injecting into the game; skip it and say so.)

**Detection (C# helper, `helper/Features/Fullscreen.cs`, `Prefix = "fs"`).**
- Every 1 s: `SHQueryUserNotificationState` (shell32) → `QUNS_RUNNING_D3D_FULL_SCREEN` (3) or
  `QUNS_PRESENTATION_MODE` (4) or `QUNS_BUSY` (2, fullscreen app). Also check the foreground window: `GetForegroundWindow`,
  skip shell windows (class `Progman`, `WorkerW`, `Shell_TrayWnd`) and our own processes, `GetWindowRect` equals the
  `MonitorFromWindow` monitor rect (`GetMonitorInfo`) → fullscreen.
- Emit `{ type: "fullscreen", on, exe, title, d3d }` on change (exe from `GetWindowThreadProcessId` +
  `Process.GetProcessById(...).ProcessName`, try/catch).

**Electron side.** On `fullscreen` with the feature enabled: `ctx.suppress(true)`; off → `ctx.suppress(false)`. Track a
session when the exe looks like a game (`d3d` true, or not in a known list of browsers/video players/office apps); on
end, if it lasted ≥ 2 min, send `{ ended: { exe, title, seconds } }`. Config: `hideForVideo` (browsers/players
fullscreen also hide, default true), `showSessionTime` (default true). Pure logic (game vs video classification,
session tracking) in a tested module.

**Renderer.**
- Pill after a session (priority 85, 6 s): gamepad icon + "Played 1h 12m" + game name ellipsised.
- Settings component: the two toggles. No panel.
- If the helper isn't running, settings say it needs the helper.

## Agent 8: Robo personality  (`robo`)

**Goal.** Robo's eyes show moods: **squint/focused** while Claude is working, **happy** (^ ^ arcs) briefly after a
success, **surprised** (wide, round) on errors/attention, **sleepy** (half-closed, slow blink) late at night
(00:00–06:00) or after 10 min without cursor movement, **normal** otherwise. Plus small idle life: occasional
double-blink, glance left/right when the cursor isn't moving.

**Allowed shared-file edits:** `src/components/Eyes.svelte` (you own it now), and nothing else.
- Create `src/lib/mood.svelte.ts`: `export const robo = $state({ mood: 'normal' as Mood, until: 0 })` and the `Mood`
  type. Eyes.svelte reads it.
- `src/features/robo/index.ts` (`id: 'robo'`, label "Robo personality", default on): in `init`, subscribe to
  `islandEvents` ('success' → happy 2.5 s, 'error' → surprised 2 s, 'notice' → quick glance/blink) and use
  `$effect.root` to derive the base mood from `ctx.store` (Claude running → squint, hour → sleepy, cursor idle →
  sleepy; track the last cursor move from `cursor` in `src/lib/cursor.svelte.ts`). Transient moods override the base
  until they expire. When the feature is disabled, mood stays 'normal'.
- Eyes.svelte: implement each mood with CSS only (shape/height/radius/transform transitions, ~250 ms), keeping the
  cursor-follow offset and the blink. Happy = upward arcs (e.g. a border-top on a rounded box, or clip-path), squint =
  flatter ovals, surprised = taller + slightly bigger with a quick "pop", sleepy = half height with drooping top and a
  slower blink. Respect `size`. Keep it subtle and cute.
- No pill takeover, no panel. Settings component: "Sleepy at night" toggle.
- Verify visually: render each mood in the browser preview and look at screenshots (set `robo.mood` from devtools via
  a `window.__robo` handle you expose in dev). Include a short description of each mood in your report.
