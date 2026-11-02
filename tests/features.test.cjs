const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

test('feature loader: starts each electron/features/*.cjs, routes calls and respects the switch', async () => {
  const dir = path.join(__dirname, '..', 'electron', 'features');
  const probe = path.join(dir, 'zz-probe.cjs');
  fs.writeFileSync(probe, `module.exports = { id: 'zz-probe', defaultEnabled: false, start(ctx) { ctx.handle('echo', async (a) => ({ a, on: ctx.enabled() })); ctx.send('hi'); return () => { global.__probeStopped = true; }; } };`);
  try {
    delete require.cache[require.resolve('../electron/features/index.cjs')];
    const { loadFeatures } = require('../electron/features/index.cjs');
    const handlers = {}, sent = [];
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    const settings = { value: { features: {} } };
    const stop = loadFeatures({ app: {}, ipcMain, getWin: () => null, send: (ch, d) => sent.push([ch, d]), settings, helper: () => ({ send() {} }), onHelper() {}, dataDir: os.tmpdir() });
    assert.deepStrictEqual(sent, [['feature', { id: 'zz-probe', data: 'hi' }]]);
    assert.deepStrictEqual(await handlers['feature:call'](null, 'zz-probe', 'echo', 5), { a: 5, on: false });
    settings.value.features['zz-probe'] = true;
    assert.deepStrictEqual(await handlers['feature:call'](null, 'zz-probe', 'echo', 6), { a: 6, on: true });
    await assert.rejects(handlers['feature:call'](null, 'zz-probe', 'nope'));
    stop();
    assert.strictEqual(global.__probeStopped, true);
  } finally { fs.unlinkSync(probe); }
});

test('settings: feature switches are kept, junk keys and non-booleans dropped', () => {
  const { sanitize } = require('../electron/settings.cjs');
  const s = sanitize({ features: { clipboard: false, 'Bad Key': true, game: 'yes' } });
  assert.deepStrictEqual(s.features, { clipboard: false });
  assert.deepStrictEqual(sanitize({ features: { game: true } }, s).features, { clipboard: false, game: true });
});
