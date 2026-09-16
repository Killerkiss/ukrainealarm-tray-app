import { app } from 'electron';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderAutostartEntry, quoteForExec } from '../shared/desktopEntry';

/**
 * Launch-at-login.
 *
 * `app.setLoginItemSettings` is documented for macOS and Windows only, and on
 * Linux it is a silent no-op: it neither throws nor changes
 * `getLoginItemSettings().openAtLogin`. So on Linux the XDG autostart entry has
 * to be written by hand.
 *
 * @see https://specifications.freedesktop.org/autostart-spec/autostart-spec-latest.html
 */

const DESKTOP_FILE = 'ukrainealarm-tray-app.desktop';

export function setAutostart(enabled: boolean): void {
  if (process.platform !== 'linux') {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    } catch (error) {
      console.error('Could not update the launch-at-login setting', error);
    }
    return;
  }

  try {
    if (enabled) writeDesktopEntry();
    else rmSync(autostartFile(), { force: true });
  } catch (error) {
    console.error('Could not update the autostart entry', error);
  }
}

/** Whether the autostart entry currently exists and points at this build. */
export function isAutostartEnabled(): boolean {
  if (process.platform !== 'linux') {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  }

  try {
    const file = autostartFile();
    if (!existsSync(file)) return false;
    // A stale entry from an install that has since moved is worse than none:
    // report it as disabled so the UI prompts the user to set it again.
    return readFileSync(file, 'utf8').includes(quoteForExec(launchTarget()));
  } catch {
    return false;
  }
}

function autostartFile(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
  return join(configHome, 'autostart', DESKTOP_FILE);
}

/**
 * The command the desktop session should run at login.
 *
 * Inside an AppImage, `process.execPath` points into the temporary mount
 * (`/tmp/.mount_XXXX/…`), which is gone by the next boot. `APPIMAGE` holds the
 * real, durable path to the .AppImage file, so it wins when present.
 */
function launchTarget(): string {
  return process.env.APPIMAGE?.trim() || process.execPath;
}

function writeDesktopEntry(): void {
  const file = autostartFile();
  mkdirSync(dirname(file), { recursive: true });

  writeFileSync(
    file,
    renderAutostartEntry({
      name: app.getName(),
      comment: 'Ukrainian air-raid alerts in your system tray',
      exec: launchTarget(),
      iconName: 'ukrainealarm-tray-app',
      // Give the tray a moment after login, so the indicator area exists.
      delaySeconds: 5,
    }),
    'utf8',
  );
}
