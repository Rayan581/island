// Polls a private GitHub repo for the live status that the "session-relay" mod writes from a cloud Claude chat,
// and turns it into the same events a local Claude Code hook would send.
const fs = require('fs');
const { execFile } = require('child_process');

const TEMPLATE = { repo: 'Rayan581/island-relay', token: '' };
const SESSION = 'cloud-chat';
const FIRST_POLL_MAX_AGE_MS = 90_000; // don't resurrect an old "Done" or "Running" when Island starts

function loadConfig(file) {
  try { return { ...TEMPLATE, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { return null; }
}
function ensureConfig(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(TEMPLATE, null, 2) + '\n');
}

const ghToken = () => new Promise((resolve) => {
  execFile(process.platform === 'win32' ? 'gh.exe' : 'gh', ['auth', 'token'], { timeout: 5000, windowsHide: true }, (err, out) => resolve(err ? '' : String(out).trim()));
});

/** Map one relay payload to Claude Code-style hook events. Pure, so it is easy to test. */
function toEvents(p, now = Date.now()) {
  const base = { session_id: SESSION, cwd: p.project || 'Claude chat' };
  // The container's clock and this PC's clock can disagree, so carry elapsed time rather than timestamps.
  const started_at = now - Math.max(0, (p.ts || 0) - (p.startedAt || p.ts || 0));
  if (p.kind === 'start') return [{ ...base, hook_event_name: 'UserPromptSubmit', started_at }];
  if (p.kind === 'stop') return [{ ...base, hook_event_name: 'Stop' }];
  if (p.kind === 'tool') return [{ ...base, hook_event_name: 'PreToolUse', tool_name: p.tool, detail: p.detail || '', tool_count: p.toolCount || 0, started_at }];
  return [];
}

class Relay {
  constructor({ configPath, onEvent, onStatus, fetchImpl = globalThis.fetch, baseUrl = 'https://api.github.com', getToken = ghToken, intervalMs = 2000 }) {
    Object.assign(this, { configPath, onEvent, onStatus, fetch: fetchImpl, baseUrl, getToken, intervalMs });
    this.etag = null; this.lastSeq = -1; this.first = true; this.fails = 0; this.timer = null; this.stopped = false; this.status = '';
  }
  setStatus(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }
  start() { ensureConfig(this.configPath); this.loop(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  next(ms) { if (!this.stopped) this.timer = setTimeout(() => this.loop(), ms); }

  async loop() {
    let delay = this.intervalMs;
    try { await this.pollOnce(); this.fails = 0; }
    catch (e) { this.fails++; delay = Math.min(30_000, this.intervalMs * 2 ** Math.min(this.fails, 4)); this.setStatus('offline'); }
    this.next(delay);
  }

  async pollOnce() {
    const cfg = loadConfig(this.configPath);
    if (!cfg || !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo || '')) return this.setStatus('bad-config');
    const token = cfg.token || (this.tokenCache ??= await this.getToken());
    if (!token) { this.tokenCache = undefined; return this.setStatus('needs-token'); }

    const headers = { Accept: 'application/vnd.github.raw+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Island' };
    if (this.etag) headers['If-None-Match'] = this.etag;
    const r = await this.fetch(`${this.baseUrl}/repos/${cfg.repo}/contents/state.json`, { headers });

    if (r.status === 304) return this.setStatus('connected');
    if (r.status === 404) { this.etag = null; return this.setStatus('waiting'); } // repo wrong, or the chat hasn't written yet
    if (r.status === 401 || r.status === 403) { this.tokenCache = undefined; return this.setStatus(r.status === 401 ? 'bad-token' : 'forbidden'); }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);

    this.etag = r.headers.get('etag');
    const p = await r.json();
    this.setStatus('connected');
    if (typeof p?.seq !== 'number' || p.seq === this.lastSeq) return;
    this.lastSeq = p.seq;

    if (this.first) {
      this.first = false;
      const serverNow = Date.parse(r.headers.get('date') || '') || Date.now();
      if (serverNow - p.ts > FIRST_POLL_MAX_AGE_MS) return;
    }
    for (const ev of toEvents(p)) this.onEvent(ev);
  }
}

module.exports = { Relay, toEvents, loadConfig, ensureConfig, SESSION };
