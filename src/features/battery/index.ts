import type { IslandFeature, FeatureCtx } from '../types';
import { islandEvents } from '../../lib/events';
import BatteryPill from './BatteryPill.svelte';
import BatterySettings from './BatterySettings.svelte';
import { bat, type PeekKind } from './state.svelte';
import { clampThreshold, isLow, looksLikeDesktop, nextWarn, shouldAnnounce, toPercent, type WarnState } from './logic';
import { FakeBattery, realBattery, type BatteryLike } from './source';

const PLUG_MS = 3500, LOW_MS = 5000;
const BATTERY_ICON = 'M3 8h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM22 11v2';

let warnState: WarnState = { done: [] };
let announced: boolean | null = null; // last plugged/unplugged state we told the user about
let detach = () => {};
let fake: FakeBattery | null = null;
let seq = 0;

function peek(kind: PeekKind) {
  bat.peek = { id: ++seq, kind, until: Date.now() + (kind === 'low' || kind === 'critical' ? LOW_MS : PLUG_MS) };
}

function setCharging(charging: boolean, announce: boolean) {
  bat.charging = charging;
  if (announce && shouldAnnounce(announced, charging)) peek(charging ? 'plug' : 'unplug');
  announced = charging;
}

function checkWarn(ctx: FeatureCtx) {
  if (!bat.has || !ctx.enabled) return;
  const r = nextWarn(warnState, { level: bat.level, charging: bat.charging, threshold: bat.threshold });
  warnState = r.state;
  if (!r.warn) return;
  peek(r.warn.kind);
  if (r.warn.kind === 'critical') islandEvents.emit('error', { source: 'battery', level: r.warn.level });
}

function attach(ctx: FeatureCtx, b: BatteryLike, proven = false) {
  detach();
  bat.level = toPercent(b.level);
  bat.has = proven || !looksLikeDesktop(b);
  announced = b.charging; bat.charging = b.charging;
  warnState = { done: [] };
  const onCharging = () => { bat.has = true; bat.level = toPercent(b.level); if (ctx.enabled) setCharging(b.charging, true); checkWarn(ctx); };
  const onLevel = () => { bat.has = true; bat.level = toPercent(b.level); checkWarn(ctx); };
  b.addEventListener('chargingchange', onCharging);
  b.addEventListener('levelchange', onLevel);
  detach = () => { b.removeEventListener('chargingchange', onCharging); b.removeEventListener('levelchange', onLevel); };
  checkWarn(ctx); // already low at startup
}

const feature: IslandFeature = {
  id: 'battery', label: 'Battery and charging', defaultEnabled: true,
  description: 'A charging animation when you plug in, and a warning when the battery runs low (laptops only).',
  init(ctx) {
    ctx.getConfig<{ threshold?: number }>().then((c) => { bat.threshold = clampThreshold(c.threshold); checkWarn(ctx); }).catch(() => {});
    // The Electron side confirms plug events from Windows' power monitor; whichever reports first wins.
    ctx.on((d) => {
      const m = d as { ac?: boolean } | null;
      if (typeof m?.ac !== 'boolean' || !ctx.enabled) return;
      bat.has = true;
      setCharging(m.ac, true);
    });
    realBattery().then((b) => { if (b && !fake) attach(ctx, b); });
    // Dev/test handle: __battery.set({ level: 0.5, charging: true }) simulates a laptop battery.
    (window as unknown as { __battery: unknown }).__battery = {
      set: (patch: { level?: number; charging?: boolean }) => {
        if (!fake) { fake = new FakeBattery(); attach(ctx, fake, true); }
        fake.set(patch);
      },
      state: bat
    };
  },
  pill: {
    priority: (ctx) => (bat.has && bat.peek.until > ctx.store.now ? (bat.peek.kind === 'low' || bat.peek.kind === 'critical' ? 92 : 87) : null),
    width: () => 226,
    component: BatteryPill,
    openTab: false
  },
  badge: { live: () => bat.has && isLow(bat.level, bat.charging, bat.threshold), icon: BATTERY_ICON, color: 'var(--attn)' },
  settings: BatterySettings
};
export default feature;
