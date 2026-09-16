import { EventEmitter } from 'node:events';
import type { ActiveAlert, AlertSnapshot, Region, Settings } from '../../shared/types';
import { createProvider, type AlertProvider } from './index';
import { alertConcernsUser, buildRegionIndex, type RegionIndex } from './regionMatching';

/** What changed between two polls, used to drive notifications and sound. */
export interface AlertTransition {
  started: ActiveAlert[];
  ended: ActiveAlert[];
}

export interface PollerEvents {
  snapshot: (snapshot: AlertSnapshot, transition: AlertTransition) => void;
  regions: (regions: Region[], error: string | null, loading: boolean) => void;
}

const EMPTY_SNAPSHOT: AlertSnapshot = {
  status: 'unknown',
  alerts: [],
  countrywideCount: 0,
  lastUpdated: null,
  error: null,
};

/**
 * Owns the polling loop. It re-reads settings on every change, re-fetching the
 * region list only when the provider or its credentials actually change, since
 * that list is large and nearly static.
 */
export class AlertPoller extends EventEmitter {
  private settings: Settings;
  private provider: AlertProvider;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: AbortController | null = null;

  private regions: Region[] = [];
  private regionIndex: RegionIndex = new Map();
  private regionsError: string | null = null;
  private regionsLoading = false;
  /** Identifies the provider configuration the cached regions belong to. */
  private regionsFor = '';

  private snapshot: AlertSnapshot = EMPTY_SNAPSHOT;
  /** User-relevant alerts from the previous poll, keyed by `regionId|type`.
   *  `null` means no successful poll has happened yet. */
  private previousAlerts: Map<string, ActiveAlert> | null = null;

  constructor(settings: Settings) {
    super();
    this.settings = settings;
    this.provider = createProvider(settings);
  }

  getSnapshot(): AlertSnapshot {
    return this.snapshot;
  }

  getRegions(): Region[] {
    return this.regions;
  }

  getRegionsError(): string | null {
    return this.regionsError;
  }

  isLoadingRegions(): boolean {
    return this.regionsLoading;
  }

  start(): void {
    void this.refresh();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /** Applies new settings and re-polls immediately so the UI reacts at once. */
  updateSettings(settings: Settings): void {
    const previous = this.settings;
    this.settings = settings;
    this.provider = createProvider(settings);

    const providerChanged =
      previous.provider !== settings.provider || previous.apiKey !== settings.apiKey;
    if (providerChanged) {
      this.regionsFor = '';
      // Selections belong to the old provider's id space; forget what we knew.
      this.previousAlerts = null;
    }

    this.stop();
    this.start();
  }

  /** Runs one poll now, out of band, and reschedules the periodic timer. */
  async refreshNow(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.refresh();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.refresh().finally(() => this.scheduleNext());
    }, this.settings.pollIntervalSec * 1000);
  }

  private async refresh(): Promise<void> {
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    try {
      await this.ensureRegions(controller.signal);
      const alerts = await this.provider.fetchAlerts(controller.signal);
      if (controller.signal.aborted) return;
      this.applyAlerts(alerts);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.applyError(error);
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  private async ensureRegions(signal: AbortSignal): Promise<void> {
    const key = `${this.settings.provider}:${this.settings.apiKey}`;
    if (this.regionsFor === key && this.regions.length > 0) return;

    this.regionsLoading = true;
    this.emit('regions', this.regions, this.regionsError, true);
    try {
      const regions = await this.provider.fetchRegions(signal);
      this.regions = regions;
      this.regionIndex = buildRegionIndex(regions);
      this.regionsError = null;
      this.regionsFor = key;
    } catch (error) {
      if (signal.aborted) return;
      this.regionsError = describeError(error);
      throw error;
    } finally {
      this.regionsLoading = false;
      this.emit('regions', this.regions, this.regionsError, false);
    }
  }

  private applyAlerts(all: ActiveAlert[]): void {
    const selected = new Set(this.settings.regions);
    const relevant = all.filter((alert) =>
      alertConcernsUser(alert.regionId, selected, this.regionIndex),
    );

    const snapshot: AlertSnapshot = {
      status: selected.size === 0 ? 'unknown' : relevant.length > 0 ? 'alert' : 'clear',
      alerts: relevant,
      countrywideCount: all.length,
      lastUpdated: new Date().toISOString(),
      error: null,
    };

    const transition = this.diff(relevant);
    this.snapshot = snapshot;
    this.emit('snapshot', snapshot, transition);
  }

  private applyError(error: unknown): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'unknown',
      error: describeError(error),
    };
    // A failed poll tells us nothing, so it must not fire "all clear".
    this.emit('snapshot', this.snapshot, { started: [], ended: [] });
  }

  private diff(relevant: ActiveAlert[]): AlertTransition {
    const current = new Map(relevant.map((alert) => [alertKey(alert), alert]));
    const previous = this.previousAlerts;
    this.previousAlerts = current;

    // The first successful poll establishes a baseline; announcing every alert
    // that was already running before launch would be noise, not news.
    if (previous === null) return { started: [], ended: [] };

    const started: ActiveAlert[] = [];
    for (const [key, alert] of current) {
      if (!previous.has(key)) started.push(alert);
    }

    const ended: ActiveAlert[] = [];
    for (const [key, alert] of previous) {
      if (!current.has(key)) ended.push(alert);
    }

    return { started, ended };
  }
}

function alertKey(alert: ActiveAlert): string {
  return `${alert.regionId}|${alert.type}`;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
