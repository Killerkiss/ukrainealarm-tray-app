import type { RegionLevel } from './regionKey';

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

export const ALL_PROVIDERS: ProviderId[] = ['free', 'ukrainealarm'];

/**
 * A selectable place, identified by its canonical key (see `regionKey.ts`) so
 * that the same place from two different sources is one entry, not two.
 */
export interface Region {
  id: string;
  name: string;
  level: RegionLevel;
  /** Canonical key of the enclosing region; undefined for oblasts. */
  parentId?: string;
  /** Which sources know about this region. */
  sources: ProviderId[];
}

/** One active threat in one region, after merging all enabled sources. */
export interface ActiveAlert {
  regionId: string;
  regionName: string;
  type: AlertType;
  /** ISO timestamp of when the alert started, when a source reports it. */
  since?: string;
  /** Sources that are currently reporting this alert. */
  sources: ProviderId[];
}

/** Per-source health, so the UI can show which feeds are actually working. */
export interface SourceStatus {
  id: ProviderId;
  ok: boolean;
  error: string | null;
  /** Alerts this source contributed countrywide on the last poll. */
  alertCount: number;
  lastSuccess: string | null;
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
  /** Health of each enabled source on the last poll. */
  sources: SourceStatus[];
  /** ISO timestamp of the last successful poll. */
  lastUpdated: string | null;
  /** Human-readable reason the last poll failed, if it did. */
  error: string | null;
}

export interface Settings {
  /**
   * Every source to poll, merged together. Running both means an alert is
   * raised as soon as the first of them reports it.
   */
  providers: ProviderId[];
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
  /**
   * When true, an alert covering the whole oblast also counts for someone who
   * subscribed only to a raion or city inside it. Turn it off to be alerted
   * strictly about your own place.
   */
  matchParentAlerts: boolean;
  /** Colour the tray icon red during an alert; when false a single neutral icon is used. */
  colorIcon: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  language: Language;
}

export type Language = 'uk' | 'en';

export const DEFAULT_SETTINGS: Settings = {
  providers: ['free'],
  apiKey: '',
  regions: [],
  pollIntervalSec: 30,
  notifications: true,
  notifyOnClear: true,
  sound: true,
  soundOnClear: false,
  soundVolume: 0.7,
  matchParentAlerts: true,
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
