import { EventEmitter } from 'node:events';
import type { ActiveAlert, AlertSnapshot, Region, Settings } from '../../shared/types';
import { ProviderAggregator, type Logger } from './aggregator';
import { alertConcernsUser, buildRegionIndex, type RegionIndex } from './regionMatching';

/** What changed between two polls, used to drive notifications and sound. */
export interface AlertTransition {
  started: ActiveAlert[];
  ended: ActiveAlert[];
}

const EMPTY_SNAPSHOT: AlertSnapshot = {
  status: 'unknown',
  alerts: [],
  countrywideCount: 0,
  sources: [],
  lastUpdated: null,
  error: null,
};

/**
 * Owns the polling loop. Every poll asks the aggregator for a merged view of
 * all enabled sources, then narrows it to the regions the user selected.
 */
export class AlertPoller extends EventEmitter {
  private settings: Settings;
  private aggregator: ProviderAggregator;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: AbortController | null = null;

  private regions: Region[] = [];
  private regionIndex: RegionIndex = new Map();
  private regionsError: string | null = null;
  private regionsLoading = false;

  private snapshot: AlertSnapshot = EMPTY_SNAPSHOT;
  /** User-relevant alerts from the previous poll, keyed by `regionId|type`.
   *  `null` means no successful poll has happened yet. */
  private previousAlerts: Map<string, ActiveAlert> | null = null;

  constructor(
    settings: Settings,
    private readonly logger: Logger = console,
  ) {
    super();
    this.settings = settings;
    this.aggregator = new ProviderAggregator(settings);
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

    const sourcesChanged =
      previous.providers.join() !== settings.providers.join() || previous.apiKey !== settings.apiKey;
    if (sourcesChanged) {
      this.aggregator = new ProviderAggregator(settings);
    }

    // Narrowing the match rules can silence an alert that was active a moment
    // ago; that is a settings change, not an all-clear worth announcing.
    if (previous.matchParentAlerts !== settings.matchParentAlerts) {
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

    if (this.regions.length === 0) {
      this.regionsLoading = true;
      this.emit('regions', this.regions, this.regionsError, true);
    }

    try {
      const result = await this.aggregator.fetchAll(controller.signal, this.logger);
      if (controller.signal.aborted) return;

      if (result.regions.length > 0) {
        this.regions = result.regions.sort(compareRegions);
        this.regionIndex = buildRegionIndex(this.regions);
      }

      if (result.allFailed) {
        const reasons = result.sources
          .map((source) => `${source.id}: ${source.error ?? 'unknown error'}`)
          .join('; ');
        this.regionsError = reasons;
        this.applyError(`All sources failed — ${reasons}`);
        return;
      }

      this.regionsError = null;
      this.applyAlerts(result.alerts, result);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.applyError(describeError(error));
    } finally {
      this.regionsLoading = false;
      if (this.inFlight === controller) this.inFlight = null;
      this.emit('regions', this.regions, this.regionsError, false);
    }
  }

  private applyAlerts(
    all: ActiveAlert[],
    result: { sources: AlertSnapshot['sources'] },
  ): void {
    const selected = new Set(this.settings.regions);
    const relevant = all.filter((alert) =>
      alertConcernsUser(alert.regionId, selected, this.regionIndex, {
        matchParentAlerts: this.settings.matchParentAlerts,
      }),
    );

    // A partial failure still produces usable data, but say so in the UI.
    const failed = result.sources.filter((source) => !source.ok);

    const snapshot: AlertSnapshot = {
      status: selected.size === 0 ? 'unknown' : relevant.length > 0 ? 'alert' : 'clear',
      alerts: relevant,
      countrywideCount: all.length,
      sources: result.sources,
      lastUpdated: new Date().toISOString(),
      error:
        failed.length > 0
          ? failed.map((source) => `${source.id}: ${source.error ?? 'failed'}`).join('; ')
          : null,
    };

    const transition = this.diff(relevant);
    this.snapshot = snapshot;
    this.emit('snapshot', snapshot, transition);
  }

  private applyError(message: string): void {
    this.snapshot = { ...this.snapshot, status: 'unknown', error: message };
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

/** Oblasts alphabetically, each with its children immediately after it. */
function compareRegions(a: Region, b: Region): number {
  return a.id.localeCompare(b.id, 'uk');
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
