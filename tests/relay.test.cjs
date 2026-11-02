const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Relay, toEvents } = require('../electron/relay.cjs');

const tmpCfg = (cfg) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), 'relay.json'); if (cfg) fs.writeFileSync(f, JSON.stringify(cfg)); return f; };

// A tiny fake of GET /repos/:owner/:repo/contents/state.json with ETag support.
function fakeGitHub() {
  const st = { body: null, etag: 'v1', status: 200, hits: 0, auth: [], date: new Date().toUTCString() };
  const server = http.createServer((req, res) => {
    st.hits++; st.auth.push(req.headers.authorization);
    if (st.status !== 200) { res.writeHead(st.status); return res.end('{}'); }
    if (req.headers['if-none-match'] === st.etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json', etag: st.etag, date: st.date });
    res.end(JSON.stringify(st.body));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ st, server, url: `http://127.0.0.1:${server.address().port}` })));
}
const mk = async (cfg, opts = {}) => {
  const gh = await fakeGitHub(), events = [], statuses = [];
  const relay = new Relay({ configPath: tmpCfg(cfg), baseUrl: gh.url, onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s), getToken: async () => '', ...opts });
  return { gh, events, statuses, relay, done: () => gh.server.close() };
};
const P = (o) => ({ v: 1, project: 'Claude chat', tool: '', detail: '', toolCount: 0, ...o });

test('toEvents maps kinds and uses elapsed time instead of the remote clock', () => {
  const now = 1_000_000;
  const [t] = toEvents(P({ kind: 'tool', tool: 'Bash', detail: '$ npm test', toolCount: 3, ts: 5_000_000, startedAt: 4_990_000 }), now);
  assert.strictEqual(t.hook_event_name, 'PreToolUse');
  assert.strictEqual(t.started_at, now - 10_000, 'container clock differs wildly, elapsed still right');
  assert.strictEqual(t.tool_count, 3);
  assert.strictEqual(toEvents(P({ kind: 'stop', ts: 1, startedAt: 1 }))[0].hook_event_name, 'Stop');
  assert.strictEqual(toEvents(P({ kind: 'start', ts: 1, startedAt: 1 }))[0].hook_event_name, 'UserPromptSubmit');
  assert.deepStrictEqual(toEvents({ kind: 'nope' }), []);
});

test('fresh state is delivered once; an unchanged file (304) delivers nothing; a new seq is delivered', async () => {
  const { gh, events, relay, done } = await mk({ repo: 'a/b', token: 'tok' });
  gh.st.body = P({ seq: 1, ts: Date.now(), startedAt: Date.now(), kind: 'start' });
  await relay.pollOnce(); await relay.pollOnce();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(gh.st.auth[0], 'Bearer tok');
  gh.st.etag = 'v2'; gh.st.body = P({ seq: 2, ts: Date.now(), startedAt: Date.now() - 4000, kind: 'tool', tool: 'Read', detail: 'total.ts', toolCount: 1 });
  await relay.pollOnce();
  assert.deepStrictEqual(events.map((e) => e.hook_event_name), ['UserPromptSubmit', 'PreToolUse']);
  gh.st.etag = 'v3'; // etag changed but same seq: no duplicate event
  await relay.pollOnce();
  assert.strictEqual(events.length, 2);
  done();
});

test('a stale state at startup is ignored, but later updates are not', async () => {
  const { gh, events, relay, done } = await mk({ repo: 'a/b', token: 'tok' });
  gh.st.date = new Date().toUTCString();
  gh.st.body = P({ seq: 7, ts: Date.now() - 10 * 60_000, startedAt: Date.now() - 11 * 60_000, kind: 'stop' });
  await relay.pollOnce();
  assert.strictEqual(events.length, 0, 'old Done is not resurrected');
  gh.st.etag = 'v2'; gh.st.body = P({ seq: 8, ts: Date.now() - 10 * 60_000, startedAt: Date.now() - 10 * 60_000, kind: 'start' });
  await relay.pollOnce();
  assert.strictEqual(events.length, 1);
  done();
});

test('statuses: missing file, bad token, no token, bad config, token from gh fallback', async () => {
  let m = await mk({ repo: 'a/b', token: 'tok' });
  m.gh.st.status = 404; await m.relay.pollOnce(); assert.strictEqual(m.statuses.at(-1), 'waiting');
  m.gh.st.status = 401; await m.relay.pollOnce(); assert.strictEqual(m.statuses.at(-1), 'bad-token');
  m.gh.st.status = 403; await m.relay.pollOnce(); assert.strictEqual(m.statuses.at(-1), 'forbidden');
  m.done();
  m = await mk({ repo: 'a/b', token: '' });
  await m.relay.pollOnce(); assert.strictEqual(m.statuses.at(-1), 'needs-token'); assert.strictEqual(m.gh.st.hits, 0, 'no request without a token');
  m.done();
  m = await mk({ repo: 'not a repo', token: 'x' });
  await m.relay.pollOnce(); assert.strictEqual(m.statuses.at(-1), 'bad-config');
  m.done();
  m = await mk({ repo: 'a/b', token: '' }, { getToken: async () => 'from-gh' });
  m.gh.st.body = P({ seq: 1, ts: Date.now(), startedAt: Date.now(), kind: 'start' });
  await m.relay.pollOnce(); assert.strictEqual(m.gh.st.auth[0], 'Bearer from-gh'); assert.strictEqual(m.events.length, 1);
  m.done();
});

test('start() writes a settings template when none exists', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), 'relay.json');
  const gh = await fakeGitHub();
  const r = new Relay({ configPath: f, baseUrl: gh.url, onEvent() {}, onStatus() {}, getToken: async () => '' });
  r.start(); r.stop(); gh.server.close();
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))), ['repo', 'token']);
});
