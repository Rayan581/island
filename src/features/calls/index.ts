import type { IslandFeature } from '../types';
import { islandEvents } from '../../lib/events';
import { calls, callApp, inCall, MIC_COLOR, CAM_COLOR, DOT_PATH, MIC_PATH, type CallApp } from './state.svelte';
import CallPill from './CallPill.svelte';
import CallView from './CallView.svelte';
import CallSettings from './CallSettings.svelte';

interface Msg { helper?: boolean; mic?: CallApp[]; cam?: CallApp[]; muted?: boolean }

const feature: IslandFeature = {
  id: 'calls',
  label: 'Mic and camera',
  description: 'Mic and camera in-use dots, call mute (Ctrl+Alt+M)',
  defaultEnabled: true,
  init(ctx) {
    (window as unknown as { __calls: typeof calls }).__calls = calls; // handy in devtools, like window.__island
    const apply = (m: Msg | null | undefined) => {
      if (!m || typeof m !== 'object') return;
      if (!Array.isArray(m.mic)) { if (m.helper) calls.helper = true; return; } // { helper } only: nothing reported yet
      const wasIn = inCall();
      calls.helper = true;
      calls.mic = m.mic;
      calls.cam = Array.isArray(m.cam) ? m.cam : [];
      calls.muted = !!m.muted;
      const now = calls.mic.some((a) => a.call);
      if (now && !wasIn) {
        calls.callSince = Date.now();
        if (ctx.enabled) islandEvents.emit('notice', { source: 'calls', app: callApp() });
      } else if (!now) calls.callSince = 0;
    };
    ctx.on((d) => apply(d as Msg));
    ctx.call<Msg>('state').then(apply).catch(() => {}); // not on Windows / no handler: stay silent
  },
  pill: {
    priority: (ctx) => (ctx.enabled && inCall() ? 75 : null),
    width: () => 290,
    component: CallPill
  },
  badge: {
    live: (ctx) => ctx.enabled && (calls.mic.length > 0 || calls.cam.length > 0),
    icon: DOT_PATH,
    // Reactive getter: orange while the mic is in use (it wins when both are), green when only the camera is.
    get color() { return calls.mic.length ? MIC_COLOR : CAM_COLOR; }
  },
  panel: { label: 'Call', icon: MIC_PATH, component: CallView, height: 236 },
  settings: CallSettings
};
export default feature;
