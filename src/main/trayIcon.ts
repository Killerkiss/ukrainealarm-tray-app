import { nativeImage, type NativeImage } from 'electron';
import type { AlertStatus } from '../shared/types';
import { assetPath } from './paths';

/**
 * Indicator sizes differ per platform: GNOME/KDE app indicators render at 22px,
 * while Windows and macOS menu bars expect 16px (scaled up by the OS on HiDPI).
 */
const SIZE_BY_PLATFORM: Record<string, number> = {
  linux: 22,
  darwin: 16,
  win32: 16,
};

type IconState = AlertStatus | 'mono';

const cache = new Map<IconState, NativeImage>();

/**
 * Picks the icon for the current status. With colour switching disabled the
 * same neutral icon is used throughout, so the tray never changes appearance.
 */
export function iconFor(status: AlertStatus, colorIcon: boolean): NativeImage {
  return loadIcon(colorIcon ? status : 'mono');
}

function loadIcon(state: IconState): NativeImage {
  const cached = cache.get(state);
  if (cached) return cached;

  const size = SIZE_BY_PLATFORM[process.platform] ?? 22;
  const name = state === 'alert' ? 'alert' : state === 'clear' ? 'clear' : state === 'mono' ? 'mono' : 'unknown';
  const image = nativeImage.createFromPath(assetPath('icons', 'tray', `${name}-${size}.png`));

  cache.set(state, image);
  return image;
}

export function appIcon(): NativeImage {
  return nativeImage.createFromPath(assetPath('icons', 'app', 'icon-256.png'));
}
