const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const feature = require('../electron/features/notifications.cjs');
const { filetimeToMs, decodeEntities, payloadToString, parseToast, appInfo, resolveApp, isAllowed, toNotification, cleanName, WpnReader } = feature;
const { DatabaseSync } = require('node:sqlite');

const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wpn-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ft = (ms) => BigInt(ms) * 10000n + 11644473600000n * 10000n; // epoch ms -> FILETIME ticks (> 2^53!)

// ---- a fake wpndatabase.db with the schema documented by plaso (windows_push_notification plugin) ----
const SCHEMA = [
  'CREATE TABLE [Metadata]( [Key] TEXT, [Value] INT64, CONSTRAINT[] PRIMARY KEY([Key]) ON CONFLICT REPLACE)',
  'CREATE TABLE [NotificationHandler] ( [RecordId] INTEGER PRIMARY KEY, [PrimaryId] TEXT NOT NULL COLLATE NOCASE, [WNSId] TEXT COLLATE NOCASE, [HandlerType] TEXT, [WNFEventName] INT64, [SystemDataPropertySet] BLOB, [CreatedTime] DATETIME, [ModifiedTime] DATETIME, [ParentId] TEXT COLLATE NOCASE, [ContainerSid] TEXT COLLATE NOCASE)',
  'CREATE TABLE [Notification]( [Order] INTEGER NOT NULL PRIMARY KEY, [Id] INTEGER NOT NULL, [HandlerId] INTEGER CONSTRAINT[NotificationToHandler] REFERENCES[NotificationHandler]([RecordId]) ON DELETE CASCADE ON UPDATE CASCADE, [ActivityId] GUID,[Type] TEXT NOT NULL, [Payload] BLOB, [Tag] TEXT, [Group] TEXT, [ExpiryTime] INT64, [ArrivalTime] INT64, [DataVersion] INT64 DEFAULT \'0\', [PayloadType] TEXT NOT NULL, [BootId] INT64 DEFAULT \'0\', [ExpiresOnReboot] BOOLEAN DEFAULT \'FALSE\', UNIQUE([Id]) ON CONFLICT REPLACE)'
];
const toast = (title, body, extra = '') =>
  `<toast launch="x=1&amp;y=2" activationType="foreground"><visual><binding template="ToastGeneric"><image placement="appLogoOverride" src="C:\\a.png"/><text hint-maxLines="1">${title}</text>${body == null ? '' : `<text>${body}</text>`}${extra}</binding></visual><actions><action content="Reply" arguments="r"/></actions></toast>`;

function fakeDb(dir) {
  const file = path.join(dir, 'wpndatabase.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;'); // like Windows: rows sit in the -wal file
  for (const s of SCHEMA) db.exec(s);
  let id = 100;
  const handlers = new Map();
  return {
    file, db,
    handler(primary) {
      if (!handlers.has(primary)) { const r = db.prepare('INSERT INTO NotificationHandler (PrimaryId, HandlerType) VALUES (?, ?)').run(primary, 'app:toast'); handlers.set(primary, Number(r.lastInsertRowid)); }
      return handlers.get(primary);
    },
    add(primary, xml, { type = 'toast', at = Date.now(), payload } = {}) {
      id++;
      db.prepare('INSERT INTO Notification (Id, HandlerId, Type, Payload, PayloadType, ArrivalTime, ExpiryTime) VALUES (?,?,?,?,?,?,?)')
        .run(id, this.handler(primary), type, payload ?? Buffer.from(xml, 'utf8'), 'xml', ft(at), ft(at + 86400000));
      return id;
    },
    close() { db.close(); }
  };
}

const WA = '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App';
const DISCORD = 'com.squirrel.Discord.Discord';

// ---------------------------------------------------------------- pure helpers
test('FILETIME ticks convert to epoch ms, including values beyond 2^53', () => {
  const ms = Date.UTC(2026, 10, 2, 12, 0, 0);
  assert.strictEqual(filetimeToMs(ft(ms)), ms);
  assert.strictEqual(filetimeToMs(Number(ft(ms))), ms); // lossy Number input still lands within a few ms
  assert.strictEqual(filetimeToMs(0, 5), 5);
  assert.strictEqual(filetimeToMs(null, 7), 7);
  assert.strictEqual(filetimeToMs('junk', 9), 9);
});

test('entities decode once, numeric forms work, bad ones are dropped', () => {
  assert.strictEqual(decodeEntities('AT&amp;T &lt;b&gt; &quot;q&quot; &apos;x&apos;'), `AT&T <b> "q" 'x'`);
  assert.strictEqual(decodeEntities('&#65;&#x42;&#x1F600;'), 'AB😀');
  assert.strictEqual(decodeEntities('&amp;lt;'), '&lt;');
  assert.strictEqual(decodeEntities('&#0;&#xD800;&unknown;'), '&unknown;');
});

test('toast XML: first text is the title, the rest is the body, images/actions are ignored', () => {
  const t = parseToast(toast('Alice', 'hey &amp; welcome', '<text>second line</text>'));
  assert.deepStrictEqual(t, { title: 'Alice', body: 'hey & welcome\nsecond line', attribution: '' });
});

test('toast XML: real Phone Link shape, attribution, CDATA, comments, nested tags, whitespace', () => {
  const xml = `<toast activationType="protocol" launch="ms-phone:fre/?cid=x&amp;ref=y"><visual><binding template="ToastGeneric"><!-- <text>hidden</text> --><text hint-maxLines="1">Complete linking devices</text><text>Your PC and mobile device are almost linked</text><text placement="attribution">mail.google.com</text></binding></visual></toast>`;
  assert.deepStrictEqual(parseToast(xml), { title: 'Complete linking devices', body: 'Your PC and mobile device are almost linked', attribution: 'mail.google.com' });
  const t = parseToast('<toast><visual><binding template="ToastGeneric"><text><![CDATA[a <b> & c]]></text><text>  multi\n   line <i>x</i>  </text></binding></visual></toast>');
  assert.strictEqual(t.title, 'a <b> & c');
  assert.strictEqual(t.body, 'multi\nline x');
});

test('toast XML: prefers the ToastGeneric binding, survives junk, strips control and bidi characters', () => {
  const legacy = '<toast><visual><binding template="ToastText02"><text id="1">Legacy</text><text id="2">Body</text></binding></visual></toast>';
  assert.strictEqual(parseToast(legacy).title, 'Legacy');
  const two = '<toast><visual><binding template="ToastImageAndText01"><text>Old</text></binding><binding template="ToastGeneric"><text>New</text></binding></visual></toast>';
  assert.strictEqual(parseToast(two).title, 'New');
  for (const bad of ['', null, undefined, 42, '<toast', '<<<>>>', '<toast><visual></visual></toast>', '\u0000\u0001']) assert.deepStrictEqual(parseToast(bad), { title: '', body: '', attribution: '' });
  assert.strictEqual(parseToast('<toast><visual><binding><text>a\u202eb\u0007c\u200bd</text><text/></binding></visual></toast>').title, 'abcd');
  assert.ok(parseToast('<toast><visual><binding><text>' + 'x'.repeat(5000) + '</text></binding></visual></toast>').title.length <= 120);
  assert.ok(!/textbox/i.test(parseToast('<toast><visual><binding><textbox>no</textbox><text>yes</text></binding></visual></toast>').title)); // <textbox> is not <text>
});

test('payload bytes: UTF-8, UTF-8 BOM, UTF-16LE (with and without BOM), strings', () => {
  const x = toast('Zoë', '日本語');
  assert.strictEqual(parseToast(payloadToString(Buffer.from(x, 'utf8'))).title, 'Zoë');
  assert.strictEqual(parseToast(payloadToString(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(x)]))).body, '日本語');
  assert.strictEqual(parseToast(payloadToString(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(x, 'utf16le')]))).title, 'Zoë');
  assert.strictEqual(parseToast(payloadToString(Buffer.from(x, 'utf16le'))).title, 'Zoë');
  assert.strictEqual(parseToast(payloadToString(new Uint8Array(Buffer.from(x)))).title, 'Zoë');
  assert.strictEqual(payloadToString(null), '');
  assert.strictEqual(payloadToString(x), x);
});

test('app ids map to names, colours and defaults', () => {
  const cases = [
    [WA, 'WhatsApp', true], [DISCORD, 'Discord', true], ['com.squirrel.slack.slack', 'Slack', true],
    ['microsoft.windowscommunicationsapps_8wekyb3d8bbwe!microsoft.windowslive.mail', 'Mail', true],
    ['microsoft.windowscommunicationsapps_8wekyb3d8bbwe!microsoft.windowslive.calendar', 'Calendar', false],
    ['MSTeams_8wekyb3d8bbwe!MSTeams', 'Teams', true], ['Microsoft.Teams.Classic', 'Teams', true],
    ['TelegramMessengerLLP.TelegramDesktop_t4vj0pshhgkwm!Telegram.Desktop', 'Telegram', true],
    ['Chrome', 'Chrome', false], ['Chrome._crx_abcdef', 'Chrome', false], ['MSEdge', 'Edge', false], ['Microsoft.Windows.Explorer', 'Explorer', false]
  ];
  for (const [id, name, def] of cases) { const a = appInfo(id); assert.strictEqual(a.name, name, id); assert.strictEqual(a.def, def, id); assert.ok(a.color); }
  assert.strictEqual(appInfo(WA).color, '#25d366');
});

test('unknown ids become readable names, with a stable colour', () => {
  assert.strictEqual(cleanName('Contoso.MyCoolApp_abc123def4567!App'), 'My Cool App');
  assert.strictEqual(cleanName('C:\\Program Files\\Foo Bar\\foobar.exe'), 'foobar');
  assert.strictEqual(cleanName('com.example.some-tool'), 'some tool');
  assert.strictEqual(cleanName(''), 'App');
  assert.strictEqual(cleanName(null), 'App');
  const a = appInfo('Vendor.Thing'), b = appInfo('Vendor.Thing');
  assert.strictEqual(a.color, b.color);
  assert.strictEqual(a.key, 'id:vendor.thing');
  assert.strictEqual(a.def, false);
});

test('Gmail in a browser is recognised by the attribution', () => {
  assert.strictEqual(resolveApp('Chrome', 'mail.google.com').name, 'Gmail');
  assert.strictEqual(resolveApp('MSEdge', 'www.mail.google.com').name, 'Gmail');
  assert.strictEqual(resolveApp('Chrome', 'example.com').name, 'Chrome');
  assert.strictEqual(resolveApp(WA, 'mail.google.com').name, 'WhatsApp');
});

test('allow rules: explicit id, explicit key, then the default list', () => {
  const info = appInfo(WA), other = appInfo('Vendor.Thing');
  assert.strictEqual(isAllowed(WA, info, {}), true);
  assert.strictEqual(isAllowed('Vendor.Thing', other, undefined), false);
  assert.strictEqual(isAllowed(WA, info, { apps: { whatsapp: false } }), false);
  assert.strictEqual(isAllowed('Vendor.Thing', other, { apps: { 'id:vendor.thing': true } }), true);
  assert.strictEqual(isAllowed(WA, info, { apps: { [WA.toLowerCase()]: false, whatsapp: true } }), false); // id beats key
  assert.strictEqual(isAllowed(WA, info, { apps: { whatsapp: 'yes' } }), true); // non-boolean ignored
});

test('toNotification builds the renderer message and drops empty toasts', () => {
  const at = Date.now() - 5000;
  const n = toNotification({ id: 123n, at: ft(at), payload: Buffer.from(toast('Bob', 'lunch?')), app: WA }, {});
  assert.deepStrictEqual({ ...n.msg, at: undefined }, { type: 'notification', id: '123', appKey: 'whatsapp', app: 'WhatsApp', color: '#25d366', initial: 'W', title: 'Bob', body: 'lunch?', at: undefined });
  assert.strictEqual(n.msg.at, at);
  assert.strictEqual(n.raw.allowed, true);
  assert.strictEqual(toNotification({ id: 1n, at: 0n, payload: Buffer.from('<toast/>'), app: WA }, {}), null);
  assert.strictEqual(toNotification({ id: 1n, at: ft(Date.now() + 9e8), payload: Buffer.from(toast('a', 'b')), app: null }, {}).msg.at <= Date.now(), true); // future arrival clamped
});

// ---------------------------------------------------------------- reader against a realistic WAL database
const leftovers = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('island-wpn-'));

test('reader: baseline skips old rows, picks up new ones from the -wal file, never replays', async () => {
  const dir = mkdir();
  const f = fakeDb(dir);
  try {
    f.add(WA, toast('Old one', 'before launch'));
    f.add(DISCORD, toast('Old two', 'x'));
    assert.ok(fs.existsSync(f.file + '-wal') && fs.statSync(f.file + '-wal').size > 0, 'rows live in the WAL, as with the real database');
    const r = new WpnReader({ dir });
    assert.deepStrictEqual(await r.poll(), []);          // baseline
    assert.strictEqual(r.status, 'ok');
    assert.deepStrictEqual(await r.poll(), []);          // unchanged: no work

    f.add(WA, toast('Carol', 'new message'), { at: Date.now() });
    const rows = await r.poll();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(typeof rows[0].id, 'bigint');
    const n = toNotification(rows[0], {});
    assert.strictEqual(n.msg.title, 'Carol'); assert.strictEqual(n.msg.app, 'WhatsApp');

    assert.deepStrictEqual(await r.poll(), []);          // not replayed
    f.add(DISCORD, toast('Dave', 'hi'), { at: Date.now() });
    f.add(DISCORD, toast('Dave', 'again'), { at: Date.now() + 1 });
    f.add(WA, '<badge value="3"/>', { type: 'badge' });   // not a toast: ignored
    const more = await r.poll();
    assert.deepStrictEqual(more.map((x) => toNotification(x, {}).msg.body), ['hi', 'again']);
    assert.deepStrictEqual(await r.poll(), []);
    assert.deepStrictEqual(leftovers(), [], 'temporary copies are deleted');
  } finally { f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: dismissed (deleted) rows, replaced rows and a reused Id behave', async () => {
  const dir = mkdir();
  const f = fakeDb(dir);
  try {
    f.add(WA, toast('seed', 'x'));
    const r = new WpnReader({ dir });
    await r.poll();
    const id = f.add(WA, toast('First', '1'), { at: Date.now() });
    assert.strictEqual((await r.poll()).length, 1);
    f.db.prepare('DELETE FROM Notification WHERE Id = ?').run(id);   // user dismisses it
    assert.deepStrictEqual(await r.poll(), []);
    // Windows can hand out an Order/Id that was freed; ArrivalTime still moves forward so it's seen
    f.db.prepare('INSERT INTO Notification (Id, HandlerId, Type, Payload, PayloadType, ArrivalTime) VALUES (?,?,?,?,?,?)')
      .run(id, f.handler(WA), 'toast', Buffer.from(toast('Reused', 'id')), 'xml', ft(Date.now() + 50));
    const rows = await r.poll();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(toNotification(rows[0], {}).msg.title, 'Reused');
  } finally { f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: a burst is capped, oldest dropped, newest kept in order', async () => {
  const dir = mkdir();
  const f = fakeDb(dir);
  try {
    const r = new WpnReader({ dir });
    f.add(WA, toast('seed', 's'));
    await r.poll();
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) f.add(WA, toast('m' + i, 'b'), { at: t0 + i });
    const rows = await r.poll();
    assert.strictEqual(rows.length, 10);
    assert.strictEqual(toNotification(rows[9], {}).msg.title, 'm39');
    assert.deepStrictEqual(await r.poll(), []);
  } finally { f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: no database, then one appears', async () => {
  const dir = mkdir();
  try {
    const r = new WpnReader({ dir });
    assert.deepStrictEqual(await r.poll(), []);
    assert.strictEqual(r.status, 'missing');
    const f = fakeDb(dir);
    f.add(WA, toast('seed', 's'));
    await r.poll();
    assert.strictEqual(r.status, 'ok');
    f.add(WA, toast('Eve', 'hello'), { at: Date.now() });
    assert.strictEqual((await r.poll()).length, 1);
    f.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: schema mismatch disables it with a reason and stops reading', async () => {
  const dir = mkdir();
  try {
    const db = new DatabaseSync(path.join(dir, 'wpndatabase.db'));
    db.exec('CREATE TABLE Notification (Id INTEGER, Payload BLOB, Type TEXT); CREATE TABLE NotificationHandler (RecordId INTEGER, AppName TEXT);');
    db.close();
    const logs = [];
    const r = new WpnReader({ dir, log: (...a) => logs.push(a.join(' ')) });
    assert.deepStrictEqual(await r.poll(), []);
    assert.strictEqual(r.status, 'unsupported');
    assert.match(r.reason, /Notification is missing column\(s\): HandlerId, ArrivalTime/);
    assert.match(logs.join('\n'), /disabled/);
    assert.deepStrictEqual(await r.poll(), []);
    assert.deepStrictEqual(leftovers(), []);

    const dir2 = mkdir();
    const e = new DatabaseSync(path.join(dir2, 'wpndatabase.db')); e.exec('CREATE TABLE Other (x)'); e.close();
    const r2 = new WpnReader({ dir: dir2 });
    await r2.poll();
    assert.strictEqual(r2.status, 'unsupported'); assert.match(r2.reason, /table Notification not found/);
    fs.rmSync(dir2, { recursive: true, force: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: a corrupt/locked file is an error that recovers, not a crash', async () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'wpndatabase.db'), 'this is not a database'.repeat(100));
    const r = new WpnReader({ dir });
    assert.deepStrictEqual(await r.poll(), []);
    assert.strictEqual(r.status, 'error');
    fs.rmSync(path.join(dir, 'wpndatabase.db'));
    const f = fakeDb(dir);
    f.add(WA, toast('seed', 's'));
    await r.poll();
    assert.strictEqual(r.status, 'ok');
    f.close();
    assert.deepStrictEqual(leftovers(), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reader: reset() re-baselines instead of replaying what arrived while off', async () => {
  const dir = mkdir();
  const f = fakeDb(dir);
  try {
    f.add(WA, toast('seed', 's'));
    const r = new WpnReader({ dir });
    await r.poll();
    f.add(WA, toast('while off', 'x'), { at: Date.now() });
    r.reset();
    assert.deepStrictEqual(await r.poll(), []);
    f.add(WA, toast('after', 'x'), { at: Date.now() + 5 });
    assert.strictEqual((await r.poll()).length, 1);
  } finally { f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the whole feature with a fake ctx
test('feature: forwards allowed apps only, lists seen apps, saves toggles, stops cleanly', { timeout: 45000 }, async () => {
  const dir = mkdir();
  const f = fakeDb(dir);
  const prev = process.env.ISLAND_WPN_DIR;
  process.env.ISLAND_WPN_DIR = dir;
  try {
    f.add(WA, toast('seed', 's'));
    const sent = [], handlers = {}, logs = [];
    let cfg = {}, enabled = true;
    const ctx = {
      enabled: () => enabled, send: (d) => sent.push(d), handle: (n, fn) => (handlers[n] = fn), log: (...a) => logs.push(a.join(' ')),
      config: { get: () => cfg, set: (c) => { cfg = c; return c; } }
    };
    const stop = feature.start(ctx);
    assert.strictEqual(typeof stop, 'function');
    await sleep(2000);                                   // first poll = baseline
    f.add(WA, toast('Frank', 'private text'), { at: Date.now() });
    f.add('Vendor.Unlisted', toast('Nope', 'not on the list'), { at: Date.now() + 1 });
    f.add(DISCORD, toast('Grace', 'discord msg'), { at: Date.now() + 2 });
    await sleep(2600);
    const notes = sent.filter((m) => m.type === 'notification');
    assert.deepStrictEqual(notes.map((m) => m.title), ['Frank', 'Grace']);
    assert.ok(sent.some((m) => m.type === 'status' && m.status === 'ok'));

    const apps = await handlers.seenApps();
    assert.ok(apps.find((a) => a.key === 'whatsapp').enabled);
    assert.ok(apps.find((a) => a.key === 'telegram') && !apps.find((a) => a.key === 'telegram').seen);
    const unlisted = apps.find((a) => a.key === 'id:vendor.unlisted');
    assert.ok(unlisted && unlisted.seen && !unlisted.enabled);
    await handlers.setApp({ key: 'discord', enabled: false });
    await handlers.setApp({ key: 'id:vendor.unlisted', enabled: true });
    assert.deepStrictEqual(cfg.apps, { discord: false, 'id:vendor.unlisted': true });

    f.add(DISCORD, toast('Hidden', 'muted'), { at: Date.now() + 10 });
    f.add('Vendor.Unlisted', toast('Shown', 'opted in'), { at: Date.now() + 11 });
    await sleep(2600);
    assert.deepStrictEqual(sent.filter((m) => m.type === 'notification').map((m) => m.title), ['Frank', 'Grace', 'Shown']);

    enabled = false;                                     // switched off: nothing is sent, and nothing is replayed after
    await sleep(2300);
    f.add(WA, toast('Off', 'while disabled'), { at: Date.now() + 20 });
    await sleep(2600);
    enabled = true;
    await sleep(4500);
    assert.ok(!sent.some((m) => m.title === 'Off'));

    for (const l of logs) assert.ok(!/Frank|private text|Grace|Shown|opted/.test(l), 'log lines never contain notification content');
    stop();
    const n = sent.length;
    f.add(WA, toast('After stop', 'x'), { at: Date.now() + 99 });
    await sleep(2500);
    assert.strictEqual(sent.length, n);
    assert.deepStrictEqual(leftovers(), []);
  } finally {
    if (prev === undefined) delete process.env.ISLAND_WPN_DIR; else process.env.ISLAND_WPN_DIR = prev;
    f.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('launchTarget: apps open by their Windows app id, browser sites by URL, junk not at all', () => {
  const n = require('../electron/features/notifications.cjs');
  const t = (id, att) => n.launchTarget(id, n.resolveApp(id, att), att);
  assert.deepStrictEqual(t('5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App', ''), { kind: 'app', aumid: '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App' });
  assert.deepStrictEqual(t('Chrome', 'mail.google.com'), { kind: 'url', url: 'https://mail.google.com' }); // Gmail opens Gmail, not Chrome
  assert.deepStrictEqual(t('Chrome', 'example.com'), { kind: 'url', url: 'https://example.com' });
  assert.strictEqual(t('C:\\x" & calc "', ''), null);
  assert.strictEqual(t('..\\..\\evil', ''), null);
  assert.strictEqual(t('', ''), null);
});
