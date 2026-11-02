// Bridges the C# IslandHelper (Windows media session + volume) over JSON lines on stdin/stdout.
// The helper sends a heartbeat every 2 s; if it goes quiet it is restarted, and it is restarted whenever it exits.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Helper {
  constructor(exePath, onMessage, onStatus) {
    this.exe = exePath; this.onMessage = onMessage; this.onStatus = onStatus;
    this.proc = null; this.restarts = 0; this.stopped = false; this.lastSeen = 0; this.watch = null; this.retry = null;
  }
  start() {
    if (process.platform !== 'win32') return this.onStatus('unsupported');
    if (!fs.existsSync(this.exe)) return this.onStatus('missing');
    const proc = spawn(this.exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    this.lastSeen = Date.now();
    this.onStatus('running');
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^﻿/, '').trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        this.lastSeen = Date.now(); this.restarts = 0;
        if (msg.type === 'hb') continue;
        if (msg.type === 'ack') { console.log(`[helper] ${msg.cmd} -> ${msg.ok ? 'ok' : 'FAILED'} (${msg.detail})`); continue; }
        this.onMessage(msg);
      }
    });
    proc.stderr.on('data', (d) => console.error('[helper]', String(d).trim()));
    proc.stdin.on('error', () => {}); // a write after the helper died must not throw
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (this.proc === proc && Date.now() - this.lastSeen > 10000) {
        console.error('[helper] no heartbeat for 10 s, restarting it');
        try { proc.kill(); } catch {}
      }
    }, 3000);
    proc.on('exit', (code) => {
      clearInterval(this.watch);
      if (this.proc === proc) this.proc = null;
      if (this.stopped) return;
      console.error(`[helper] exited (code ${code}), restarting`);
      this.onStatus('restarting');
      this.retry = setTimeout(() => this.start(), Math.min(10000, 1000 * ++this.restarts));
    });
  }
  send(cmd) {
    console.log(`[island] media command: ${cmd}`);
    if (this.proc?.stdin.writable) this.proc.stdin.write(cmd + '\n');
    else console.error('[helper] not running, command dropped');
  }
  stop() { this.stopped = true; clearInterval(this.watch); clearTimeout(this.retry); try { this.proc?.kill(); } catch {} }
}

function helperPath(app) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'helper', 'IslandHelper.exe')
    : path.join(__dirname, '..', 'helper', 'bin', 'IslandHelper.exe');
}

module.exports = { Helper, helperPath };
