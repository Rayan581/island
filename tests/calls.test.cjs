const test = require('node:test');
const assert = require('node:assert');
const { describeApp, summarize } = require('../electron/features/calls.cjs');

test('calls: friendly names and call-app detection', () => {
  const cases = [
    ['Discord.exe', 'Discord', true],
    ['ms-teams.exe', 'Teams', true],
    ['MSTeams_8wekyb3d8bbwe', 'Teams', true],
    ['Teams.exe', 'Teams', true],
    ['Zoom.exe', 'Zoom', true],
    ['Slack.exe', 'Slack', true],
    ['SkypeApp_kzf8qxf38zg5c', 'Skype', true],
    ['5319275A.WhatsAppDesktop_cv1g1gvanyjgm', 'WhatsApp', true],
    ['Telegram.exe', 'Telegram', true],
    ['chrome.exe', 'Chrome', true],
    ['msedge.exe', 'Edge', true],
    ['firefox.exe', 'Firefox', true],
    ['Microsoft.WindowsCamera_8wekyb3d8bbwe', 'Camera', false],
    ['obs64.exe', 'OBS', false],
    ['C:#Program Files#Foo#my-recorder.exe', 'My recorder', false],
    ['Contoso.VoiceNotes_8wekyb3d8bbwe', 'Voice Notes', false]
  ];
  for (const [raw, name, call] of cases) assert.deepStrictEqual(describeApp(raw), { name, call }, raw);
});

test('calls: summarize dedupes, ignores junk and reads the mute flag', () => {
  const s = summarize({ mic: ['chrome.exe', 'Chrome.exe', 'Discord.exe', 5, null], cam: ['Microsoft.WindowsCamera_8wekyb3d8bbwe'], muted: true });
  assert.deepStrictEqual(s.mic.map((a) => a.name), ['Chrome', 'Discord']);
  assert.deepStrictEqual(s.cam, [{ name: 'Camera', call: false }]);
  assert.strictEqual(s.muted, true);
  assert.deepStrictEqual(summarize({}), { mic: [], cam: [], muted: false });
  assert.deepStrictEqual(summarize(null), { mic: [], cam: [], muted: false });
});
