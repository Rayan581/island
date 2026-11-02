/** Built-in tabs, or `f:<feature id>` for a feature's own tab. */
export type View = 'home' | 'claude' | 'music' | 'focus' | 'settings' | `f:${string}`;

export interface Config { demo: boolean; platform: string; helper: string; claudeConnected: boolean; hookPort: number }

export interface HookEvent {
  hook_event_name: string; session_id?: string; cwd?: string; prompt?: string; message?: string;
  tool_name?: string; tool_input?: Record<string, unknown>;
  /** From the cloud-chat relay: pre-formatted detail, running tool count and the run's start time (this PC's clock). */
  detail?: string; tool_count?: number; started_at?: number;
}

export interface MediaEvent {
  type: 'media'; active: boolean; key?: string; title?: string; artist?: string; album?: string; playing?: boolean;
  position?: number; duration?: number; updatedAt?: number; source?: string; canSeek?: boolean; art?: string;
}

export interface VolumeEvent { type: 'volume'; level: number; muted: boolean; device: string; changed: boolean }

export interface LyricLine { t: number; text: string }
export interface LyricsResult { lines: LyricLine[]; instrumental: boolean }

export interface Settings {
  style: 'floating' | 'notch';
  idleWidth: number; activeWidth: number; height: number; topOffset: number;
  radius: number; radiusX: number; ear: number; expandedWidth: number;
  eyesFollow: boolean; keepOnTop: boolean;
  /** Feature on/off switches by feature id; missing = the feature's default. */
  features: Record<string, boolean>;
}

export interface IslandAPI {
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  onSettings(cb: (s: Settings) => void): () => void;
  /** Cursor position relative to the island window, or null when it is far away. */
  /** Ctrl key held down anywhere (read natively, since the island window never has focus). */
  /** The window was hidden and shown again: re-check where the pointer is. */
  onResync(cb: () => void): () => void;
  onFeature(cb: (m: { id: string; data: unknown }) => void): () => void;
  featureCall(id: string, action: string, arg?: unknown): Promise<unknown>;
  pathForFile(file: File): string;
  onCtrl(cb: (down: boolean) => void): () => void;
  onCursor(cb: (p: { x: number; y: number } | null) => void): () => void;
  /** Click-through on/off. Repeats are ignored by the main process unless `force`. */
  ignoreMouse(v: boolean, force?: boolean): void;
  media(cmd: 'toggle' | 'next' | 'prev' | 'seek', arg?: number): void;
  config(): Promise<Config>;
  lyrics(track: { title: string; artist: string; album: string; duration: number; fresh?: boolean }): Promise<LyricsResult | null>;
  onConfig(cb: (c: Config) => void): () => void;
  onClaude(cb: (e: HookEvent) => void): () => void;
  onMedia(cb: (e: MediaEvent) => void): () => void;
  onVolume(cb: (e: VolumeEvent) => void): () => void;
}

export type Phase = 0 | 1 | 2 | 3; // Read, Edit, Test, Done

export interface ClaudeSession {
  id: string; project: string; status: 'idle' | 'running' | 'attention' | 'done';
  startedAt: number; endedAt: number; updatedAt: number;
  tool: string; detail: string; toolCount: number; phase: Phase; seen: boolean;
}
