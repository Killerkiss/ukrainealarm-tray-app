import { BrowserWindow, shell } from 'electron';
import { IPC } from '../shared/ipc';
import type { AppState } from '../shared/types';
import { appIcon } from './trayIcon';
import { preloadPath, rendererEntry } from './paths';

/**
 * The settings window is created lazily and hidden rather than destroyed on
 * close, so reopening it from the tray is instant and keeps scroll position in
 * the (long) region list.
 */
export class SettingsWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly getState: () => AppState) {}

  show(): void {
    const window = this.ensureWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  /** Pushes new state to the window if it exists; a no-op when it is closed. */
  pushState(state: AppState): void {
    if (this.window && !this.window.isDestroyed() && !this.window.webContents.isLoading()) {
      this.window.webContents.send(IPC.stateChanged, state);
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: 560,
      height: 760,
      minWidth: 460,
      minHeight: 560,
      show: false,
      title: 'Ukraine Alarm',
      icon: appIcon(),
      autoHideMenuBar: true,
      backgroundColor: '#14161a',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // Closing the window returns the app to the tray instead of quitting.
    window.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        window.hide();
      }
    });

    window.webContents.once('did-finish-load', () => this.pushState(this.getState()));

    // Any link in the settings UI (API key instructions, data sources) opens in
    // the user's browser rather than navigating this window away from the app.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    const entry = rendererEntry();
    void ('url' in entry ? window.loadURL(entry.url) : window.loadFile(entry.file));

    this.window = window;
    return window;
  }
}

let isQuitting = false;

/** Lets the real close happen when the user quits from the tray menu. */
export function markQuitting(): void {
  isQuitting = true;
}
