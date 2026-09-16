import { migrateLegacyRegionId } from './regionKey';
import {
  ALL_PROVIDERS,
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
const LANGUAGES: Language[] = ['uk', 'en'];

export function sanitize(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  return {
    providers: readProviders(input),
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : DEFAULT_SETTINGS.apiKey,
    alertsInUaToken:
      typeof input.alertsInUaToken === 'string'
        ? input.alertsInUaToken
        : DEFAULT_SETTINGS.alertsInUaToken,
    regions: readRegions(input.regions),
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
    matchParentAlerts: bool(input.matchParentAlerts, DEFAULT_SETTINGS.matchParentAlerts),
    colorIcon: bool(input.colorIcon, DEFAULT_SETTINGS.colorIcon),
    launchAtLogin: bool(input.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    startMinimized: bool(input.startMinimized, DEFAULT_SETTINGS.startMinimized),
    language: oneOf(input.language, LANGUAGES, DEFAULT_SETTINGS.language),
  };
}

/**
 * Reads the source list, upgrading the single `provider` field written by
 * v0.1. An empty list would leave the app polling nothing, so it falls back to
 * the default rather than being accepted.
 */
function readProviders(input: Record<string, unknown>): ProviderId[] {
  const raw = Array.isArray(input.providers)
    ? input.providers
    : typeof input.provider === 'string'
      ? [input.provider]
      : [];

  const providers = [...new Set(raw)].filter((id): id is ProviderId =>
    ALL_PROVIDERS.includes(id as ProviderId),
  );
  return providers.length > 0 ? providers : [...DEFAULT_SETTINGS.providers];
}

/** Rewrites provider-scoped region ids from v0.1 into canonical keys. */
function readRegions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SETTINGS.regions];

  const migrated = raw
    .filter((id): id is string => typeof id === 'string')
    .map(migrateLegacyRegionId)
    .filter((id): id is string => id !== null);

  return [...new Set(migrated)];
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
