// Where battery readings come from. The real one is navigator.getBattery(); a fake can be attached for tests and the
// browser preview (window.__battery), so plugging in and draining can be simulated anywhere.

export interface BatteryLike extends EventTarget {
  level: number; charging: boolean; chargingTime: number; dischargingTime: number;
}

export class FakeBattery extends EventTarget implements BatteryLike {
  level = 0.8; charging = false; chargingTime = Infinity; dischargingTime = 7200;
  set(patch: { level?: number; charging?: boolean }) {
    const chargingChanged = patch.charging !== undefined && patch.charging !== this.charging;
    const levelChanged = patch.level !== undefined && patch.level !== this.level;
    if (patch.level !== undefined) this.level = patch.level;
    if (patch.charging !== undefined) { this.charging = patch.charging; this.chargingTime = patch.charging ? 3600 : Infinity; }
    if (chargingChanged) this.dispatchEvent(new Event('chargingchange'));
    if (levelChanged) this.dispatchEvent(new Event('levelchange'));
  }
}

export async function realBattery(): Promise<BatteryLike | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    return nav.getBattery ? await nav.getBattery() : null;
  } catch { return null; }
}
