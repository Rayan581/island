// Receives Claude Code hook events over localhost and installs/removes the hooks in ~/.claude/settings.json.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47821;
const URL = `http://127.0.0.1:${PORT}/claude`;
// Empty response body on purpose: stdout from a UserPromptSubmit hook is added to Claude's context.
// curl.exe, not curl: in Windows PowerShell `curl` is an alias for Invoke-WebRequest.
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const COMMAND = `${CURL} -s -m 2 --noproxy 127.0.0.1 -X POST -H "Content-Type: application/json" --data-binary @- ${URL}`;
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'SessionEnd'];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

const settingsFile = (home = os.homedir()) => path.join(home, '.claude', 'settings.json');

function startServer(onEvent, port = PORT) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/claude') { res.writeHead(404); return res.end(); }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Length': 0 }); res.end();
      try { onEvent(JSON.parse(body)); } catch { /* ignore malformed payloads */ }
    });
  });
  server.on('error', (e) => console.error('[island] hook server:', e.message));
  server.listen(port, '127.0.0.1');
  return server;
}

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(URL);

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw); // throws on invalid JSON so we never overwrite a file we can't read
}

function strip(settings) {
  const hooks = settings.hooks || {};
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (hooks[ev].length === 0) delete hooks[ev];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks; else settings.hooks = hooks;
  return settings;
}

function write(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.island-backup');
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

function install(file = settingsFile()) {
  const s = strip(readSettings(file));
  s.hooks = s.hooks || {};
  for (const ev of EVENTS) {
    const group = { hooks: [{ type: 'command', command: COMMAND, timeout: 5 }] };
    if (TOOL_EVENTS.has(ev)) group.matcher = '*';
    (s.hooks[ev] = s.hooks[ev] || []).push(group);
  }
  write(file, s);
}

function uninstall(file = settingsFile()) {
  if (!fs.existsSync(file)) return;
  write(file, strip(readSettings(file)));
}

function isInstalled(file = settingsFile()) {
  try {
    const s = readSettings(file);
    return EVENTS.every((ev) => (s.hooks?.[ev] || []).some((g) => (g.hooks || []).some(isOurs)));
  } catch { return false; }
}

module.exports = { startServer, install, uninstall, isInstalled, settingsFile, PORT, COMMAND, EVENTS };
