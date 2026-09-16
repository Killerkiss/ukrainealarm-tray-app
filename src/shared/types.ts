/**
 * Types shared by the main process, the preload bridge and the renderer.
 * This file must stay free of any `electron` or `node:` imports so that Vite
 * can bundle it into the renderer.
 */

/** Kinds of threat the official API distinguishes. The free mirror only reports `air_raid`. */
export type AlertType =
  | 'air_raid'
  | 'artillery'
  | 'urban_fights'
  | 'chemical'
  | 'nuclear'
  | 'unknown';

export type ProviderId = 'free' | 'ukrainealarm';

/** A selectable place: an oblast (`state`) or a raion/hromada inside one (`district`). */
export interface Region {
  /** Stable, provider-scoped id, e.g. `free:Київська область`. */
  id: string;
  name: string;
  level: 'state' | 'district';
  /** Region id of the parent oblast; undefined for oblasts themselves. */
  parentId?: string;
}

/** One active threat in one region, as reported by the provider. */
export interface ActiveAlert {
  regionId: string;
  regionName: string;
  type: AlertType;
  /** ISO timestamp of when the alert started, when the provider reports it. */
  since?: string;
}

/** Why the tray is showing what it is showing. */
export type AlertStatus = 'alert' | 'clear' | 'unknown';

/** A full snapshot of the world, recomputed on every poll. */
export interface AlertSnapshot {
  status: AlertStatus;
  /** Alerts limited to the user's selected regions. Empty when `status !== 'alert'`. */
  alerts: ActiveAlert[];
  /** Every alert currently active in the country, for the "all regions" view. */
  countrywideCount: number;
  /** ISO timestamp of the last successful poll. */
  lastUpdated: string | null;
  /** Human-readable reason the last poll failed, if it did. */
  error: string | null;
}

export interface Settings {
  provider: ProviderId;
  /** API key for api.ukrainealarm.com. Ignored by the free provider. */
  apiKey: string;
  /** Region ids the user wants to be alerted about. Empty means "nothing selected". */
  regions: string[];
  pollIntervalSec: number;
  notifications: boolean;
  notifyOnClear: boolean;
  sound: boolean;
  soundOnClear: boolean;
  soundVolume: number;
  /** Colour the tray icon red during an alert; when false a single neutral icon is used. */
  colorIcon: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  language: Language;
}

export type Language = 'uk' | 'en';

export const DEFAULT_SETTINGS: Settings = {
  provider: 'free',
  apiKey: '',
  regions: [],
  pollIntervalSec: 30,
  notifications: true,
  notifyOnClear: true,
  sound: true,
  soundOnClear: false,
  soundVolume: 0.7,
  colorIcon: true,
  launchAtLogin: false,
  startMinimized: true,
  language: 'uk',
};

export const POLL_INTERVAL_MIN_SEC = 15;
export const POLL_INTERVAL_MAX_SEC = 600;

/** Payload pushed to the renderer whenever settings, regions or alerts change. */
export interface AppState {
  settings: Settings;
  snapshot: AlertSnapshot;
  regions: Region[];
  /** True while the region list is being (re)loaded from the provider. */
  regionsLoading: boolean;
  regionsError: string | null;
  appVersion: string;
}
