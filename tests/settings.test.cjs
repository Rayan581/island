const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SettingsStore, sanitize, DEFAULTS, NUMBERS } = require('../electron/settings.cjs');
const { cursorRelative } = require('../electron/cursor.cjs');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'settings-')), 'island-settings.json');
// Load a TypeScript module from src/ without a build step, via esbuild (a dependency of vite).
const loadTs = (rel) => {
  const { transformSync } = require('esbuild');
  const code = transformSync(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports;
};

test('sanitize clamps numbers, rounds, and ignores junk and unknown keys', () => {
  const v = sanitize({ idleWidth: 99999, height: -5, radius: '22.6', ear: 'abc', topOffset: null, hacker: 1, style: 'blob', eyesFollow: 'yes', keepOnTop: false });
  assert.strictEqual(v.idleWidth, NUMBERS.idleWidth[1]);
  assert.strictEqual(v.height, NUMBERS.height[0]);
  assert.strictEqual(v.radius, 23);
  assert.strictEqual(v.ear, DEFAULTS.ear);
  assert.strictEqual(v.topOffset, DEFAULTS.topOffset);
  assert.strictEqual(v.style, 'floating');
  assert.strictEqual(v.eyesFollow, true);
  assert.strictEqual(v.keepOnTop, false);
  assert.ok(!('hacker' in v));
  assert.deepStrictEqual(sanitize(undefined), DEFAULTS);
});

test('SettingsStore: partial updates merge, persist after flush, and survive a corrupt file', () => {
  const f = tmp();
  const a = new SettingsStore(f, 10_000);
  a.update({ style: 'notch', ear: 12 });
  a.update({ idleWidth: 300 });
  assert.deepStrictEqual([a.value.style, a.value.ear, a.value.idleWidth], ['notch', 12, 300]);
  a.flush();
  const b = new SettingsStore(f);
  assert.deepStrictEqual([b.value.style, b.value.ear, b.value.idleWidth, b.value.height], ['notch', 12, 300, DEFAULTS.height]);
  fs.writeFileSync(f, '{ not json');
  assert.deepStrictEqual(new SettingsStore(f).value, DEFAULTS);
});

test('renderer defaults, presets and limits agree with the main-process ones', () => {
  const r = loadTs('src/lib/settings.ts');
  assert.deepStrictEqual(r.DEFAULT_SETTINGS, DEFAULTS);
  for (const c of r.CONTROLS) assert.deepStrictEqual([c.min, c.max], NUMBERS[c.key], `limits for ${c.key}`);
  for (const [name, preset] of Object.entries(r.PRESETS)) assert.deepStrictEqual(sanitize(preset), { ...DEFAULTS, ...preset }, `preset ${name} is within limits`);
});

test('collapsedRadius keeps the ear straight and never lets the browser rescale the curve', () => {
  const { collapsedRadius, DEFAULT_SETTINGS, PRESETS } = loadTs('src/lib/settings.ts');
  assert.strictEqual(collapsedRadius(DEFAULT_SETTINGS, 132), '18px / 18px');
  const n = { ...DEFAULT_SETTINGS, ...PRESETS.notch };
  assert.strictEqual(collapsedRadius(n, 288), `0 0 20px 20px / 0 0 17px 17px`, 'vertical curve limited to height minus ear (32-15)');
  assert.match(collapsedRadius({ ...n, radiusX: 260 }, 200), /^0 0 100px 100px/, 'horizontal curve limited to half the width');
});

test('cursorRelative: always gives window coordinates, however far the cursor is', () => {
  const b = { x: 610, y: 0, width: 700, height: 400 };
  assert.deepStrictEqual(cursorRelative({ x: 700, y: 50 }, b), { x: 90, y: 50 });
  assert.deepStrictEqual(cursorRelative({ x: 100, y: 1500 }, b), { x: -510, y: 1500 });
});
