# Island

A Dynamic Island for Windows. A small black pill sits at the top of your screen and opens on hover.

- **Claude Code, live.** Shows every running session: project, elapsed time, the command being run, and Read → Edit → Test → Done progress. **Done stays blue until you look**, and it turns amber when Claude needs your permission.
- **Music that sets the colour.** Shows whatever is playing in Spotify (or any app that uses Windows media controls). The island takes its accent colour from the album art. Includes play/pause, skip and seek.
- **Lyrics in the island.** Synced lyrics from [LRCLIB](https://lrclib.net) scroll in the pill while you work.
- **Volume, right where you look.** A volume bar slides in whenever you change the system volume.
- **Focus timer.** 15/25/50-minute sessions, with a notification when one ends.
- **All at once.** When several things are live, the pill shows the most important one and small badges for the rest.

## Requirements

- Windows 10 1809+ or Windows 11
- [Node.js 20+](https://nodejs.org)
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0). Only needed to compile the small music/volume helper.

## Run it

```powershell
npm install
npm run build:helper   # compiles helper/IslandHelper.exe (music + volume)
npm start              # builds the UI and launches Island
```

Then right-click the **Island tray icon → Connect Claude Code…**. This adds hooks to `%USERPROFILE%\.claude\settings.json` and saves a backup next to it as `settings.json.island-backup`. Your existing hooks and settings are left alone, and **Disconnect** removes only Island's entries. Claude Code sessions started after connecting appear in the island.

Other commands:

| Command | What it does |
|---|---|
| `npm run demo` | Hot-reloading dev mode with fake Spotify and Claude Code activity (also toggleable from the tray) |
| `npm run dev` | Hot-reloading dev mode with real data |
| `npm test` | Backend tests: hook installer, hook server, lyrics lookup and LRC parser |
| `npm run check` | Svelte + TypeScript type check |
| `npm run dist` | Builds a Windows installer into `release/` |

## How it works

```
Claude Code ──hooks (curl.exe POST)──▶ 127.0.0.1:47821 ─┐
Spotify / browser ──Windows media session──▶ IslandHelper.exe ──JSON lines──▶ Electron main ──IPC──▶ Svelte UI
System volume ──CoreAudio events──────────▶ IslandHelper.exe ─┘        └── LRCLIB lyrics (cached on disk)
```

- `electron/main.cjs`: the always-on-top, transparent, non-focusable window. Clicks pass through everything except the island itself. Also the tray menu and IPC.
- `electron/claude-hooks.cjs`: the local hook server and the settings installer. The server replies with an empty body on purpose, because output from a `UserPromptSubmit` hook would otherwise be added to Claude's context.
- `electron/lyrics.cjs`: LRCLIB lookup. It cleans titles like "Song - Remastered 2011", matches the recording by duration (±6 s) and caches hits and misses.
- `helper/Program.cs`: the C# helper. It prefers a session that is playing, and Spotify among equals. It retries album art until Spotify publishes it, and reports volume with the output device name.
- `src/lib/store.svelte.ts`: all app state. `src/lib/pill.ts` decides what the collapsed pill shows.

Pill priority: volume change → focus complete → Claude needs you → Claude running → Claude done (unseen) → focus running → lyrics → track → idle eyes.

## Look and feel (Settings tab)

Open the island and click the **gear** tab.

- **Style: Floating or Notch.** *Floating* is the original pill with a gap above it. *Notch* is attached to the top edge of the screen: a flat top with small curved "ears" and a wide, shallow bowl underneath. Picking a style loads its preset; the sliders then tune it. The preview at the top of the tab shows the collapsed pill at its real size.
- **Sliders:** idle width, active width, height, gap from the top (floating only), bottom curve, side curve (bigger = more bowl-like), ear size (notch only), and opened width. The Notch preset uses the values tuned on the author's own PC (idle 288, active 340, height 32, curve 20, ears 15, opened 510).
- **Eyes follow the cursor.** Robo's eyes always look toward the cursor, wherever it is on screen. Island reads the cursor position itself, so this works even though the pill is click-through.
- **Getting at what's underneath.** Hold **Ctrl** while the pointer is over the island and clicks pass straight through to the app below (a browser tab, say). **Ctrl+Alt+I** (or the tray item *Hide Island*) hides and shows the whole island.
- **Keep above other windows.** The pill re-asserts "always on top" every 1.5 s and after sleep, unlock and display changes. Turn this off only if it fights with another always-on-top app.

Settings are saved in `%APPDATA%\Island\island-settings.json`. Out-of-range values in that file are clamped when Island starts.

## Show a cloud Claude chat in the pill

A Claude chat running in the cloud can't reach `127.0.0.1` on your PC, so it relays its status through a **private GitHub repo** instead:

```
cloud chat ──(session-relay mod: git push state.json)──▶ private repo ◀──(Island polls every 2 s)── your PC
```

- **`relay-mod/`** is the mod that runs inside the chat. It writes only the tool name, a short detail (file name or a trimmed command; commands that mention a token, key or password show as `(hidden)`) and timing. Never prompt text. Pushes are limited to one per 4 s, so a busy session makes a few hundred small commits an hour.
- **Island** reads `state.json` with conditional requests, so an unchanged file costs nothing against GitHub's rate limit. The status appears in the tray menu as *Cloud chat relay*.

Setup on your PC (once):

1. Start Island. It creates `%APPDATA%\Island\relay.json`. Choose **Relay settings…** in the tray menu to open it.
2. Set `"repo"` to the private repo (`Rayan581/island-relay`).
3. Give Island read access to that repo, either way:
   - **GitHub CLI installed and logged in (`gh auth login`)**: nothing to do, Island uses `gh auth token`.
   - **Otherwise**: create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to that one repo with *Contents: Read-only*, and paste it into `"token"`.

When the chat starts a turn the pill switches to the running state; when it finishes, **Done** stays blue until you look. The tray shows `needs a GitHub token`, `token rejected` or `waiting for the chat` if something is off.

## Notes

- **Spotify lyrics.** Spotify has no public lyrics API, so lyrics come from LRCLIB. Most popular songs have synced lyrics there; if not, the pill shows the track title instead.
- **The helper was written without being compiled here.** If `npm run build:helper` reports an error, paste it back to Claude. Without the helper, Claude Code and the focus timer still work, and the tray shows `Music helper: missing`.
- Island's settings and lyrics cache live in `%APPDATA%\Island`.

## Roadmap

- Robo: a chat assistant that runs `claude -p` with your existing Claude Code login. Shortcut buttons for the clipboard, and drag Robo onto your screen to ask about what's there.
- Optional Spotify lyrics source (unofficial, opt-in)
- Hide during fullscreen games and videos; settings panel
