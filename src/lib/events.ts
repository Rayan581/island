// A tiny app-wide event bus, so features can react to each other (e.g. Robo's mood) without importing each other.
// Conventional names: 'success' (something finished well), 'error' (something failed / needs attention),
// 'notice' (something arrived: download, notification, screenshot). Payload: { source: featureId, ... }.
type Handler = (data: { source: string; [k: string]: unknown }) => void;
const handlers = new Map<string, Set<Handler>>();

export const islandEvents = {
  emit(name: string, data: { source: string; [k: string]: unknown }) {
    for (const h of handlers.get(name) ?? []) try { h(data); } catch (e) { console.error(e); }
  },
  on(name: string, h: Handler) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name)!.add(h);
    return () => handlers.get(name)!.delete(h);
  }
};
