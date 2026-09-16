import { nativeImage, type NativeImage } from 'electron';
import type { AlertLevel, AlertStatus } from '../shared/types';
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

type IconState = 'alert' | 'warn' | 'clear' | 'unknown' | 'mono';

const cache = new Map<IconState, NativeImage>();

/**
 * Picks the icon for the current status and severity.
 *
 * A yellow-level alert gets its own amber icon, so the tray distinguishes a
 * preliminary threat from a declared raid at a glance. With colour switching
 * disabled the same neutral icon is used throughout.
 */
export function iconFor(
  status: AlertStatus,
  level: AlertLevel | null,
  colorIcon: boolean,
): NativeImage {
  if (!colorIcon) return loadIcon('mono');
  if (status === 'alert') return loadIcon(level === 'yellow' ? 'warn' : 'alert');
  return loadIcon(status === 'clear' ? 'clear' : 'unknown');
}

function loadIcon(state: IconState): NativeImage {
  const cached = cache.get(state);
  if (cached) return cached;

  const size = SIZE_BY_PLATFORM[process.platform] ?? 22;
  const image = nativeImage.createFromPath(assetPath('icons', 'tray', `${state}-${size}.png`));

  cache.set(state, image);
  return image;
}

export function appIcon(): NativeImage {
  return nativeImage.createFromPath(assetPath('icons', 'app', 'icon-256.png'));
}
