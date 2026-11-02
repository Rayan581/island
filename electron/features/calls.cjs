// Mic / camera in use + call mute. The C# helper (helper/Features/MicCam.cs) reads the Windows privacy "consent store"
// and the default capture device's mute flag; this side turns raw app ids into friendly names, decides what counts as
// a call, forwards it to the renderer and owns the Ctrl+Alt+M hotkey.
// The pure helpers are exported next to the feature so tests can require this file without Electron.

const HOTKEY = 'Ctrl+Alt+M';

// [pattern on the lower-cased raw id (file name or packaged family name), friendly name, is a call app]
// Browsers are "possible calls" (Meet, Teams on the web...), so they count.
const KNOWN = [
  [/^discord/, 'Discord', true],
  [/^(ms-?)?teams/, 'Teams', true],
  [/microsoft\.?teams/, 'Teams', true],
  [/^zoom/, 'Zoom', true],
  [/^slack/, 'Slack', true],
  [/^skype|skypeapp/, 'Skype', true],
  [/whatsapp/, 'WhatsApp', true],
  [/^telegram/, 'Telegram', true],
  [/^signal/, 'Signal', true],
  [/^chrome/, 'Chrome', true],
  [/^msedge|microsoftedge/, 'Edge', true],
  [/^firefox/, 'Firefox', true],
  [/^brave/, 'Brave', true],
  [/^opera/, 'Opera', true],
  [/^vivaldi/, 'Vivaldi', true],
  [/windowscamera/, 'Camera', false],
  [/^obs/, 'OBS', false],
  [/soundrecorder|voicerecorder/, 'Sound Recorder', false],
  [/^audacity/, 'Audacity', false]
];

function tidy(s) {
  const t = s.replace(/\.exe$/i, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown app';
}

/** Raw id from the helper (e.g. "Discord.exe", "MSTeams_8wekyb3d8bbwe", "C:\\...\\zoom.exe") -> { name, call }. */
function describeApp(raw) {
  const id = String(raw || '').trim();
  const base = id.split(/[\\/#]/).filter(Boolean).pop() || id;
  const low = base.toLowerCase();
  for (const [re, name, call] of KNOWN) if (re.test(low)) return { name, call };
  // Packaged app family names look like "Publisher.App_hash": show the App part.
  const pkg = base.match(/^(?:[^._]+\.)*([^._]+)_[a-z0-9]{13}$/i);
  return { name: tidy(pkg ? pkg[1] : base), call: false };
}

/** Turns the helper message into what the renderer needs (deduped by name, at most 6 each). */
function summarize(msg) {
  const list = (v) => {
    const seen = new Map();
    for (const raw of Array.isArray(v) ? v : []) {
      if (typeof raw !== 'string') continue;
      const d = describeApp(raw);
      if (!seen.has(d.name)) seen.set(d.name, d);
    }
    return [...seen.values()].slice(0, 6);
  };
  const mic = list(msg && msg.mic), cam = list(msg && msg.cam);
  return { mic, cam, muted: !!(msg && msg.muted) };
}

function start(ctx) {
  if (process.platform !== 'win32') { ctx.handle('state', async () => ({ helper: false })); return () => {}; } // detection lives in the Windows helper
  let stopped = false, registered = false, warned = false, gs = null, last = null, seenMsg = false;

  ctx.helper.on('miccam', (msg) => {
    if (stopped) return;
    try {
      seenMsg = true;
      last = summarize(msg);
      ctx.send(last); // always; the renderer ignores it while the switch is off, so it's current when switched on
    } catch (e) { ctx.log('miccam message failed:', e.message); }
  });

  // The renderer asks for the current picture when it loads or the switch is turned on.
  ctx.handle('state', async () => (last ? { ...last, helper: true } : { helper: seenMsg }));
  ctx.handle('toggleMute', async () => { ctx.helper.send('f:mic toggle'); return true; });
  ctx.handle('setMute', async (on) => { ctx.helper.send(on ? 'f:mic mute' : 'f:mic unmute'); return true; });

  // Register / unregister the hotkey with the feature switch (there's no event for it, so check now and then).
  const sync = () => {
    if (stopped) return;
    try {
      if (!gs) gs = require('electron').globalShortcut;
      const want = ctx.enabled();
      if (want && !registered) {
        registered = gs.register(HOTKEY, () => { if (ctx.enabled()) ctx.helper.send('f:mic toggle'); });
        if (!registered && !warned) { warned = true; ctx.log(`${HOTKEY} is taken by another app`); }
      } else if (!want && registered) {
        gs.unregister(HOTKEY); registered = false;
      }
    } catch (e) { ctx.log('hotkey:', e.message); }
  };
  sync();
  const timer = setInterval(sync, 1500);
  if (timer.unref) timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
    try { if (registered && gs) gs.unregister(HOTKEY); } catch {}
    registered = false;
  };
}

module.exports = { id: 'calls', defaultEnabled: true, start, describeApp, summarize, HOTKEY };
