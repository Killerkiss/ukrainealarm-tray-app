import { app, ipcMain, shell } from 'electron';
import { IPC } from '../shared/ipc';
import type { AppState, Settings } from '../shared/types';
import { AlertPoller } from './alerts/poller';
import { Notifier } from './notifier';
import { setAutostart } from './autostart';
import { SettingsStore, sanitize } from './settingsStore';
import { SettingsWindow, markQuitting } from './settingsWindow';
import { SoundPlayer } from './soundPlayer';
import { TrayController } from './tray';

// Sounds play without a user gesture: the alert itself is the trigger, and the
// offscreen audio host never receives input events.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// A tray app must not quit when its only window closes.
app.on('window-all-closed', () => {
  // Intentionally empty: the tray keeps the app alive.
});

// A second launch should surface the existing instance, not start a rival tray.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

async function start(): Promise<void> {
  await app.whenReady();

  // Hide the dock icon on macOS: this is a menu-bar app, not a windowed one.
  app.dock?.hide();

  const store = new SettingsStore();
  const sound = new SoundPlayer();
  const notifier = new Notifier(sound);
  const poller = new AlertPoller(store.get());

  const buildState = (): AppState => ({
    settings: store.get(),
    snapshot: poller.getSnapshot(),
    regions: poller.getRegions(),
    regionsLoading: poller.isLoadingRegions(),
    regionsError: poller.getRegionsError(),
    appVersion: app.getVersion(),
  });

  const settingsWindow = new SettingsWindow(buildState);

  const tray = new TrayController(store.get(), poller.getSnapshot(), {
    openSettings: () => settingsWindow.show(),
    refreshNow: () => void poller.refreshNow(),
    toggleMute: () => {
      notifier.setMuted(!notifier.isMuted());
      tray.update(poller.getSnapshot(), store.get());
    },
    isMuted: () => notifier.isMuted(),
    quit: () => {
      markQuitting();
      app.quit();
    },
  });

  poller.on('snapshot', (snapshot, transition) => {
    const settings = store.get();
    notifier.handle(transition, settings);
    tray.update(snapshot, settings);
    settingsWindow.pushState(buildState());
  });

  poller.on('regions', () => settingsWindow.pushState(buildState()));

  app.on('second-instance', () => settingsWindow.show());
  app.on('activate', () => settingsWindow.show());

  registerIpc({ store, poller, tray, settingsWindow, sound, buildState });
  applyLaunchAtLogin(store.get());

  poller.start();

  // With no regions chosen the app cannot do its job, so make that visible
  // immediately instead of sitting silently in the tray.
  if (store.get().regions.length === 0 || !store.get().startMinimized) {
    settingsWindow.show();
  }

  app.on('before-quit', () => {
    markQuitting();
    poller.stop();
    sound.destroy();
    tray.destroy();
    settingsWindow.destroy();
  });
}

interface IpcContext {
  store: SettingsStore;
  poller: AlertPoller;
  tray: TrayController;
  settingsWindow: SettingsWindow;
  sound: SoundPlayer;
  buildState: () => AppState;
}

function registerIpc(ctx: IpcContext): void {
  ipcMain.handle(IPC.getState, () => ctx.buildState());

  ipcMain.handle(IPC.updateSettings, (_event, patch: unknown) => {
    // The renderer is trusted but not authoritative: re-validate every field.
    const merged = sanitize({ ...ctx.store.get(), ...(patch as Partial<Settings>) });
    const settings = ctx.store.update(merged);

    applyLaunchAtLogin(settings);
    ctx.poller.updateSettings(settings);
    ctx.tray.update(ctx.poller.getSnapshot(), settings);
    return ctx.buildState();
  });

  ipcMain.handle(IPC.refreshNow, () => ctx.poller.refreshNow());

  ipcMain.handle(IPC.testSound, () => {
    const settings = ctx.store.get();
    return ctx.sound.play('alert', settings.soundVolume);
  });

  ipcMain.handle(IPC.openExternal, (_event, url: unknown) => {
    // Only ever hand http(s) URLs to the OS handler.
    if (typeof url !== 'string') return;
    const parsed = tryParseUrl(url);
    if (parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
      return shell.openExternal(parsed.href);
    }
  });
}

function applyLaunchAtLogin(settings: Settings): void {
  setAutostart(settings.launchAtLogin);
}

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
