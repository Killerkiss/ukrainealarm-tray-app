import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AlarmBridge } from '../shared/ipc';
import type { AppState, Settings } from '../shared/types';

/**
 * The only bridge between the renderer and Node. Context isolation stays on and
 * nothing but these six functions crosses the boundary.
 */
const bridge: AlarmBridge = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<AppState>,
  updateSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.updateSettings, patch) as Promise<AppState>,
  refreshNow: () => ipcRenderer.invoke(IPC.refreshNow) as Promise<void>,
  testSound: () => ipcRenderer.invoke(IPC.testSound) as Promise<void>,
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>,
  onStateChanged: (listener) => {
    const handler = (_event: unknown, state: AppState) => listener(state);
    ipcRenderer.on(IPC.stateChanged, handler);
    return () => ipcRenderer.off(IPC.stateChanged, handler);
  },
};

contextBridge.exposeInMainWorld('alarm', bridge);
