const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { isTempName, extOf, isStable, createTracker, pushRecent } = require('../electron/features/downloads/logic.cjs');

const loadTs = (rel) => {
  const { transformSync } = require('esbuild');
  const code = transformSync(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports;
};

test('isTempName flags partial downloads and junk', () => {
  for (const n of ['a.crdownload', 'a.PART', 'a.partial', 'a.tmp', 'a.download', 'a.opdownload', '.hidden', '~$doc.docx', 'desktop.ini', 'Unconfirmed 123.crdownload', '', 'C:\\Users\\x\\a.crdownload'])
    assert.ok(isTempName(n), n);
  for (const n of ['a.zip', 'report.final.pdf', 'part.txt', 'tmp', 'setup (1).exe', 'C:\\Users\\x\\a.zip', 'noext'])
    assert.ok(!isTempName(n), n);
});

test('extOf', () => {
  assert.strictEqual(extOf('a.ZIP'), 'zip');
  assert.strictEqual(extOf('a.tar.gz'), 'gz');
  assert.strictEqual(extOf('noext'), '');
  assert.strictEqual(extOf('.bashrc'), '');
  assert.strictEqual(extOf('trailing.'), '');
});

test('isStable needs a non-zero size unchanged for the window', () => {
  assert.ok(!isStable(null, 5000));
  assert.ok(!isStable({ size: 0, changedAt: 0 }, 5000));
  assert.ok(!isStable({ size: 10, changedAt: 4000 }, 5000));
  assert.ok(isStable({ size: 10, changedAt: 3500 }, 5000));
});

const st = (size, mtimeMs, extra = {}) => ({ isFile: true, size, mtimeMs, birthtimeMs: mtimeMs, ...extra });

test('tracker reports a file once after it stops growing', () => {
  const t = createTracker({ startedAt: 1000, stableMs: 1500 });
  t.observe('/d/x', st(100, 2000), 2000);
  assert.deepStrictEqual(t.ready(2500), []);
  t.observe('/d/x', st(200, 2400), 2600); // still growing: timer restarts
  assert.deepStrictEqual(t.ready(3500), []);
  const r = t.ready(4200);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].size, 200);
  assert.deepStrictEqual(t.ready(9000), []);
  t.observe('/d/x', st(200, 2400), 9000); // same path+size+mtime: deduped
  assert.deepStrictEqual(t.ready(12000), []);
  t.observe('/d/x', st(300, 9500), 12000); // changed again: a new report
  assert.strictEqual(t.ready(14000).length, 1);
});

test('tracker ignores temp names, folders, empty and old files', () => {
  const t = createTracker({ startedAt: 5000, stableMs: 100 });
  t.observe('/d/a.crdownload', st(10, 6000), 6000);
  t.observe('/d/dir', { isFile: false, size: 0, mtimeMs: 6000, birthtimeMs: 6000 }, 6000);
  t.observe('/d/empty', st(0, 6000), 6000);
  t.observe('/d/old', st(10, 1000), 6000);
  t.observe('/d/gone', null, 6000);
  assert.deepStrictEqual(t.ready(9000), []);
  t.observe('/d/moved', st(10, 1000, { birthtimeMs: 6000 }), 6000); // old mtime, new birthtime
  assert.strictEqual(t.ready(9000).length, 1);
});

test('tracker drops empty files that never fill up', () => {
  const t = createTracker({ startedAt: 0, giveUpMs: 1000 });
  t.observe('/d/e', st(0, 10), 10);
  assert.strictEqual(t.pendingPaths().length, 1);
  t.ready(5000);
  assert.strictEqual(t.pendingPaths().length, 0);
});

test('pushRecent keeps newest first, unique, capped', () => {
  let l = [];
  for (let i = 0; i < 10; i++) l = pushRecent(l, { path: 'p' + i }, 8);
  assert.strictEqual(l.length, 8);
  assert.strictEqual(l[0].path, 'p9');
  l = pushRecent(l, { path: 'p5', n: 2 }, 8);
  assert.strictEqual(l[0].n, 2);
  assert.strictEqual(l.filter((x) => x.path === 'p5').length, 1);
});

test('formatSize', () => {
  const { formatSize } = loadTs('src/features/downloads/format.ts');
  assert.strictEqual(formatSize(0), '0 B');
  assert.strictEqual(formatSize(512), '512 B');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(24 * 1024 * 1024), '24 MB');
  assert.strictEqual(formatSize(24.6 * 1024 * 1024), '25 MB');
  assert.strictEqual(formatSize(1.234 * 1024 ** 3), '1.2 GB');
});

// A real watcher run against a temp folder, simulating a browser: x.crdownload written in chunks, then renamed to x.
test('watcher: crdownload written in chunks then renamed is reported once, after it settles', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'electron') return {
      shell: { openPath: async () => '', showItemInFolder() {} }, nativeImage: { createFromBitmap: () => ({}) },
      app: { getPath: () => dir, getFileIcon: async () => ({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AAAA' }) }
    };
    return orig.call(this, req, ...rest);
  };
  delete require.cache[require.resolve('../electron/features/downloads.cjs')];
  const feature = require('../electron/features/downloads.cjs');


  const sent = []; const handlers = new Map();
  const ctx = { enabled: () => true, send: (d) => sent.push(d), handle: (a, f) => handlers.set(a, f), win: () => null, log() {} };
  await new Promise((r) => setTimeout(r, 50));
  // junk that must never be reported
  fs.writeFileSync(path.join(dir, '.hidden'), 'x');
  fs.writeFileSync(path.join(dir, 'a.part'), 'x');
  fs.mkdirSync(path.join(dir, 'folder'));
  const stop = feature.start(ctx, dir);
  Module._load = orig;
  assert.strictEqual(typeof stop, 'function');
  try {
    const tmp = path.join(dir, 'movie.mkv.crdownload');
    for (let i = 0; i < 5; i++) { fs.appendFileSync(tmp, Buffer.alloc(1024 * 64, i)); await new Promise((r) => setTimeout(r, 200)); }
    assert.strictEqual(sent.length, 0, 'nothing reported while partial');
    fs.renameSync(tmp, path.join(dir, 'movie.mkv'));
    await new Promise((r) => setTimeout(r, 900));
    assert.strictEqual(sent.length, 0, 'not yet stable 1.5 s');
    await new Promise((r) => setTimeout(r, 1500));
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].name, 'movie.mkv');
    assert.strictEqual(sent[0].size, 5 * 64 * 1024);
    assert.strictEqual(sent[0].ext, 'mkv');
    assert.strictEqual(sent[0].icon, 'data:image/png;base64,AAAA');
    assert.strictEqual((await handlers.get('list')()).length, 1);
    // handlers only act on known paths
    assert.deepStrictEqual(await handlers.get('open')('/etc/passwd'), { ok: false, error: 'unknown' });
    // a file that is written directly under its final name (no temp name)
    const direct = path.join(dir, 'direct.bin');
    for (let i = 0; i < 3; i++) { fs.appendFileSync(direct, 'abcdef'); await new Promise((r) => setTimeout(r, 400)); }
    await new Promise((r) => setTimeout(r, 2000));
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(sent[1].name, 'direct.bin');
    // deleted after being reported: open says it is gone and drops it from the list
    fs.unlinkSync(path.join(dir, 'movie.mkv'));
    assert.deepStrictEqual(await handlers.get('open')(path.join(dir, 'movie.mkv')), { ok: false, error: 'missing' });
    assert.strictEqual((await handlers.get('list')()).length, 1);
  } finally { stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
