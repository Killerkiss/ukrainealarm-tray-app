import { BrowserWindow } from 'electron';
import { pathToFileURL } from 'node:url';
import { assetPath } from './paths';

export type SoundName = 'alert' | 'clear';

/**
 * Plays notification sounds through a hidden renderer.
 *
 * The main process cannot output audio itself, and shelling out to `paplay` /
 * `afplay` / PowerShell would be three platform-specific code paths with three
 * different failure modes. One offscreen window is simpler and behaves the same
 * everywhere.
 */
export class SoundPlayer {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;

  async play(sound: SoundName, volume: number): Promise<void> {
    try {
      await this.ensureWindow();
      const file = JSON.stringify(pathToFileURL(assetPath('sounds', `${sound}.wav`)).href);
      const result = await this.window?.webContents.executeJavaScript(
        `window.playSound(${file}, ${clampVolume(volume)})`,
      );
      // `playSound` resolves with a string when the browser refuses playback.
      if (typeof result === 'string') {
        console.error(`Could not play ${sound} sound: ${result}`);
      }
    } catch (error) {
      console.error(`Could not play ${sound} sound`, error);
    }
  }

  async stop(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      await this.window.webContents.executeJavaScript('window.stopSound()');
    } catch (error) {
      console.error('Could not stop sound', error);
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.ready = null;
  }

  private ensureWindow(): Promise<void> {
    if (this.window && !this.window.isDestroyed() && this.ready) return this.ready;

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        // The page is a local, script-only asset with no bridge to the app.
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    this.window = window;
    this.ready = window.loadFile(assetPath('player.html'));
    return this.ready;
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}
