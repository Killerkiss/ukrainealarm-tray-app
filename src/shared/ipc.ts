import type { AppState, Settings } from './types';

/** Channel names shared by the preload bridge and the main-process handlers. */
export const IPC = {
  getState: 'app:get-state',
  updateSettings: 'app:update-settings',
  refreshNow: 'app:refresh-now',
  testSound: 'app:test-sound',
  openExternal: 'app:open-external',
  stateChanged: 'app:state-changed',
} as const;

/** The API the preload script exposes on `window.alarm`. */
export interface AlarmBridge {
  getState(): Promise<AppState>;
  updateSettings(patch: Partial<Settings>): Promise<AppState>;
  refreshNow(): Promise<void>;
  testSound(): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Subscribes to pushed state updates; returns an unsubscribe function. */
  onStateChanged(listener: (state: AppState) => void): () => void;
}
