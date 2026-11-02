import type { IslandFeature } from '../types';
import { islandEvents } from '../../lib/events';
import NotifyPill from './NotifyPill.svelte';
import NotifyPanel from './NotifyPanel.svelte';
import NotifySettings from './NotifySettings.svelte';
import { nstate, push, isNote, type Note } from './state.svelte';

const BELL = 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0';

const feature: IslandFeature = {
  id: 'notifications',
  label: 'Notification mirror',
  description: 'Shows notifications from chosen apps (WhatsApp, Discord, Mail…) in the island',
  defaultEnabled: true,
  init(ctx) {
    // dev handle, like window.__island: lets the browser preview seed state
    (window as unknown as { __notifications: unknown }).__notifications = { state: nstate, push };
    ctx.on((d) => {
      if (isNote(d)) {
        if (!ctx.enabled) return;
        const n: Note = { id: d.id, appKey: d.appKey, app: d.app, color: d.color, initial: d.initial, title: d.title, body: d.body, at: d.at };
        push(n);
        islandEvents.emit('notice', { source: 'notifications', app: n.app });
      } else if ((d as { type?: string } | null)?.type === 'status') {
        const s = d as { status: string; reason?: string };
        nstate.status = s.status; nstate.reason = s.reason ?? '';
      }
    });
    ctx.call<{ status: string; reason: string } | null>('status').then((s) => { if (s) { nstate.status = s.status; nstate.reason = s.reason; } }).catch(() => {});
  },
  pill: {
    priority: (ctx) => (nstate.current && nstate.showUntil > ctx.store.now ? 84 : null),
    width: () => 380,
    component: NotifyPill
  },
  panel: { label: 'Notifications', icon: BELL, component: NotifyPanel, height: 280 },
  settings: NotifySettings
};
export default feature;
