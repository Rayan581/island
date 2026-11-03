const test = require('node:test');
const assert = require('node:assert');
const c = require('../electron/features/clipboard.cjs');

test('summarize: first non-empty line, total length, truncation', () => {
  assert.deepStrictEqual(c.summarize('hello'), { text: 'hello', chars: 5, line: 'hello', truncated: false });
  assert.strictEqual(c.summarize('\r\n\n   first   line \nsecond').line, 'first line');
  assert.strictEqual(c.summarize('   \n\t').line, '');
  const big = c.summarize('x'.repeat(5000));
  assert.strictEqual(big.text.length, 2000);
  assert.strictEqual(big.chars, 5000);
  assert.strictEqual(big.truncated, true);
  assert.strictEqual(big.line.length, 200);
  assert.strictEqual(c.summarize(null).chars, 0);
});

test('isExcluded: password-manager flags', () => {
  const none = () => false;
  assert.strictEqual(c.isExcluded(none, () => Buffer.alloc(0)), false);
  assert.strictEqual(c.isExcluded((f) => f === 'ExcludeClipboardContentFromMonitorProcessing', none), true);
  assert.strictEqual(c.isExcluded((f) => f === 'Clipboard Viewer Ignore', none), true);
  // DWORD flags: 0 = exclude, 1 = fine
  const dword = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  assert.strictEqual(c.isExcluded((f) => f === 'CanIncludeInClipboardHistory', () => dword(0)), true);
  assert.strictEqual(c.isExcluded((f) => f === 'CanIncludeInClipboardHistory', () => dword(1)), false);
  assert.strictEqual(c.isExcluded((f) => f === 'CanUploadToCloudClipboard', () => dword(0)), true);
  assert.strictEqual(c.isExcluded((f) => f === 'CanIncludeInClipboardHistory', () => Buffer.alloc(0)), false);
  // a clipboard that throws must not break detection
  assert.strictEqual(c.isExcluded(() => { throw new Error('x'); }, () => { throw new Error('x'); }), false);
});

test('ChangeTracker: dedupes, ignores null and our own writes', () => {
  const t = new c.ChangeTracker();
  assert.strictEqual(t.update(c.textKey('a')), true);
  assert.strictEqual(t.update(c.textKey('a')), false);
  assert.strictEqual(t.update(null), false);
  assert.strictEqual(t.update(c.textKey('b')), true);
  t.set(c.textKey('from history'));            // Island re-copied this itself
  assert.strictEqual(t.update(c.textKey('from history')), false);
  assert.strictEqual(t.update(c.textKey('b')), true);
});

test('keys: text keys differ by content, image keys by size and pixels', () => {
  assert.notStrictEqual(c.textKey('abc'), c.textKey('abd'));
  assert.strictEqual(c.textKey('abc'), c.textKey('abc'));
  const px = Buffer.from([1, 2, 3, 4]);
  assert.strictEqual(c.imageKey(10, 5, px), c.imageKey(10, 5, Buffer.from([1, 2, 3, 4])));
  assert.notStrictEqual(c.imageKey(10, 5, px), c.imageKey(5, 10, px));
  assert.notStrictEqual(c.imageKey(10, 5, px), c.imageKey(10, 5, Buffer.from([1, 2, 3, 5])));
});

test('pruneList: keeps the newest N saved PNGs and only touches ours', () => {
  const names = [];
  for (let i = 0; i < 13; i++) names.push(`${1730000000000 + i}-${i}.png`);
  names.push('notes.txt', 'photo.png');
  const drop = c.pruneList(names, 10);
  assert.deepStrictEqual(drop.sort(), ['1730000000000-0.png', '1730000000001-1.png', '1730000000002-2.png']);
  assert.deepStrictEqual(c.pruneList(names.slice(0, 5), 10), []);
});

test('isScreenshotFile / matchesDisplay / fitThumb', () => {
  assert.strictEqual(c.isScreenshotFile('Screenshot 2026-11-02 101500.png'), true);
  assert.strictEqual(c.isScreenshotFile('x.JPG'), true);
  assert.strictEqual(c.isScreenshotFile('.hidden.png'), false);
  assert.strictEqual(c.isScreenshotFile('~tmp.png'), false);
  assert.strictEqual(c.isScreenshotFile('clip.mp4'), false);
  assert.strictEqual(c.isScreenshotFile('a.png.tmp'), false);
  const displays = [{ size: { width: 1920, height: 1080 }, scaleFactor: 1.25 }];
  assert.strictEqual(c.matchesDisplay(2400, 1350, displays), true);
  assert.strictEqual(c.matchesDisplay(1920, 1080, displays), true);
  assert.strictEqual(c.matchesDisplay(800, 600, displays), false);
  assert.deepStrictEqual(c.fitThumb(1920, 1080), { width: 171, height: 96 });
  assert.deepStrictEqual(c.fitThumb(4000, 100), { width: 240, height: 6 });
  assert.deepStrictEqual(c.fitThumb(50, 40), { width: 50, height: 40 });
  assert.deepStrictEqual(c.fitThumb(0, 0), { width: 1, height: 1 });
});

test('restored images: only our own PNG names count, newest first, capped', () => {
  const c = require('../electron/features/clipboard.cjs');
  const names = ['1793000000000.png', '1793000005000-2.png', 'notes.txt', 'photo.png', '1793000009000.png'];
  const mine = names.filter((n) => /^\d{10,}(-\d+)?\.png$/.test(n)).sort().reverse();
  assert.deepStrictEqual(mine, ['1793000009000.png', '1793000005000-2.png', '1793000000000.png']);
  assert.deepStrictEqual(c.pruneList(names, 2), ['1793000000000.png']); // same rule the deleter uses
});
