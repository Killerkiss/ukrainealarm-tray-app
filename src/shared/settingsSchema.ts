import {
  DEFAULT_SETTINGS,
  POLL_INTERVAL_MAX_SEC,
  POLL_INTERVAL_MIN_SEC,
  type Language,
  type ProviderId,
  type Settings,
} from './types';

/**
 * Validates an untrusted settings object field by field.
 *
 * Both the on-disk file and IPC messages from the renderer go through here, so
 * a hand-edited file or a malformed patch degrades to defaults instead of
 * putting the app into an unusable state. Kept free of Electron imports so it
 * can be unit-tested in plain Node.
 */
const PROVIDERS: ProviderId[] = ['free', 'ukrainealarm'];
const LANGUAGES: Language[] = ['uk', 'en'];

export function sanitize(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  return {
    provider: oneOf(input.provider, PROVIDERS, DEFAULT_SETTINGS.provider),
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : DEFAULT_SETTINGS.apiKey,
    regions: Array.isArray(input.regions)
      ? [...new Set(input.regions.filter((id): id is string => typeof id === 'string'))]
      : [...DEFAULT_SETTINGS.regions],
    pollIntervalSec: clamp(
      input.pollIntervalSec,
      POLL_INTERVAL_MIN_SEC,
      POLL_INTERVAL_MAX_SEC,
      DEFAULT_SETTINGS.pollIntervalSec,
    ),
    notifications: bool(input.notifications, DEFAULT_SETTINGS.notifications),
    notifyOnClear: bool(input.notifyOnClear, DEFAULT_SETTINGS.notifyOnClear),
    sound: bool(input.sound, DEFAULT_SETTINGS.sound),
    soundOnClear: bool(input.soundOnClear, DEFAULT_SETTINGS.soundOnClear),
    soundVolume: clamp(input.soundVolume, 0, 1, DEFAULT_SETTINGS.soundVolume),
    colorIcon: bool(input.colorIcon, DEFAULT_SETTINGS.colorIcon),
    launchAtLogin: bool(input.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    startMinimized: bool(input.startMinimized, DEFAULT_SETTINGS.startMinimized),
    language: oneOf(input.language, LANGUAGES, DEFAULT_SETTINGS.language),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
