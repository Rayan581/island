const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const claude = require('../electron/claude-hooks.cjs');
const { Lyrics, parseLRC, cleanTitle, firstArtist } = require('../electron/lyrics.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'island-'));

test('parseLRC handles multiple stamps, centiseconds and blank lines', () => {
  const lines = parseLRC('[ar:x]\n[00:12.50]Hello\n[00:05.00][01:00.25]Repeat\n[00:20.00]\n');
  assert.deepStrictEqual(lines.map((l) => l.t), [5, 12.5, 20, 60.25]);
  assert.strictEqual(lines[0].text, 'Repeat');
  assert.strictEqual(lines[2].text, '');
});

test('cleanTitle / firstArtist strip Spotify-style suffixes', () => {
  assert.strictEqual(cleanTitle('Song - Remastered 2011'), 'Song');
  assert.strictEqual(cleanTitle('Song (feat. Someone)'), 'Song');
  assert.strictEqual(cleanTitle('Song [Live at Wembley]'), 'Song');
  assert.strictEqual(cleanTitle('Plain Song'), 'Plain Song');
  assert.strictEqual(firstArtist('A, B & C'), 'A');
});

test('Lyrics: get by album, falls back to search, caches hits and misses', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith('/get')) return { status: 404, ok: false };
    if (u.searchParams.get('track_name') === 'Song') return { status: 200, ok: true, json: async () => [
      { duration: 300, syncedLyrics: '[00:01.00]wrong recording' },
      { duration: 181, syncedLyrics: '[00:01.00]right one' }] };
    return { status: 200, ok: true, json: async () => [] };
  };
  const dir = tmp();
  const L = new Lyrics(path.join(dir, 'c.json'), fake);
  const r = await L.get({ title: 'Song - Remastered', artist: 'A, B', album: 'Al', duration: 180 });
  assert.strictEqual(r.lines[0].text, 'right one');
  const n = calls.length;
  await L.get({ title: 'Song - Remastered', artist: 'A, B', album: 'Al', duration: 180 });
  assert.strictEqual(calls.length, n, 'second lookup served from cache');
  assert.strictEqual(await L.get({ title: 'Nothing', artist: 'X', album: '', duration: 100 }), null);
  const m = calls.length;
  assert.strictEqual(await L.get({ title: 'Nothing', artist: 'X', album: '', duration: 100 }), null);
  assert.strictEqual(calls.length, m, 'misses are cached too');
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'c.json'), 'utf8')));
});

test('hook installer: adds, is idempotent, keeps user hooks, uninstalls cleanly', () => {
  const f = path.join(tmp(), '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  fs.writeFileSync(f, JSON.stringify({ model: 'opus', hooks: { PreToolUse: [userHook] } }));
  claude.install(f); claude.install(f);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(s.model, 'opus');
  assert.strictEqual(s.hooks.PreToolUse.length, 2, 'user hook + exactly one island hook');
  assert.deepStrictEqual(s.hooks.PreToolUse[0], userHook);
  assert.strictEqual(s.hooks.PreToolUse[1].matcher, '*');
  assert.strictEqual(s.hooks.Stop[0].matcher, undefined);
  assert.ok(claude.isInstalled(f));
  assert.ok(fs.existsSync(f + '.island-backup'));
  claude.uninstall(f);
  const u = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual(u, { model: 'opus', hooks: { PreToolUse: [userHook] } });
  assert.ok(!claude.isInstalled(f));
});

test('hook installer refuses to overwrite invalid JSON', () => {
  const f = path.join(tmp(), 'settings.json');
  fs.writeFileSync(f, '{ broken');
  assert.throws(() => claude.install(f));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '{ broken');
});

test('hook server receives the exact curl command Claude Code will run, with an empty body', async () => {
  const got = [];
  const server = claude.startServer((e) => got.push(e), 47899);
  await new Promise((r) => server.once('listening', r));
  const cmd = claude.COMMAND.replace('47821', '47899');
  const out = await new Promise((resolve, reject) => {
    const child = execFile('bash', ['-c', cmd], (err, stdout) => (err ? reject(err) : resolve(stdout)));
    child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }));
  });
  assert.strictEqual(out, '', 'nothing printed, so nothing leaks into Claude\'s context');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepStrictEqual(got, [{ hook_event_name: 'Stop', session_id: 's1' }]);
  server.close();
});
