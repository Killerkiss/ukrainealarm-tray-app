import type { ActiveAlert, ProviderId, Region, Settings, SourceStatus } from '../../shared/types';
import { FreeMirrorProvider } from './freeProvider';
import type { AlertProvider } from './provider';
import { UkraineAlarmProvider } from './ukraineAlarmProvider';

export interface AggregateResult {
  regions: Region[];
  alerts: ActiveAlert[];
  sources: SourceStatus[];
  /** True when every enabled source failed, so the data is not trustworthy. */
  allFailed: boolean;
}

/**
 * Polls every enabled source and merges the results.
 *
 * Sources are independent: one being down must not hide what the others can
 * see, so failures are collected per source and the merge continues with
 * whatever succeeded. An alert reported by *any* source counts — whichever
 * source sees it first is what raises the alarm.
 */
export class ProviderAggregator {
  private readonly providers: AlertProvider[];
  /** Per-source health carried between polls so the UI can show last success. */
  private readonly status = new Map<ProviderId, SourceStatus>();

  constructor(settings: Settings) {
    this.providers = settings.providers.map((id) =>
      id === 'ukrainealarm' ? new UkraineAlarmProvider(settings.apiKey) : new FreeMirrorProvider(),
    );
    for (const provider of this.providers) {
      this.status.set(provider.id, {
        id: provider.id,
        ok: false,
        error: null,
        alertCount: 0,
        lastSuccess: null,
      });
    }
  }

  async fetchAll(signal: AbortSignal, logger: Logger): Promise<AggregateResult> {
    const settled = await Promise.allSettled(
      this.providers.map((provider) => fetchOne(provider, signal)),
    );

    const succeeded: SourceResult[] = [];

    settled.forEach((outcome, index) => {
      const provider = this.providers[index];
      if (!provider) return;
      const previous = this.status.get(provider.id);

      if (outcome.status === 'rejected') {
        // Each failure is reported on its own: "some sources failed" would not
        // tell the user which feed to fix.
        const message = describeError(outcome.reason);
        logger.error(`Source "${provider.id}" failed: ${message}`, outcome.reason);
        this.status.set(provider.id, {
          id: provider.id,
          ok: false,
          error: message,
          alertCount: 0,
          lastSuccess: previous?.lastSuccess ?? null,
        });
        return;
      }

      succeeded.push(outcome.value);
      this.status.set(provider.id, {
        id: provider.id,
        ok: true,
        error: null,
        alertCount: outcome.value.alerts.length,
        lastSuccess: new Date().toISOString(),
      });
    });

    return {
      regions: mergeRegions(succeeded),
      alerts: mergeAlerts(succeeded),
      sources: this.providers
        .map((provider) => this.status.get(provider.id))
        .filter((entry): entry is SourceStatus => entry !== undefined),
      allFailed: succeeded.length === 0,
    };
  }
}

export interface Logger {
  error(message: string, cause?: unknown): void;
}

interface SourceResult {
  id: ProviderId;
  regions: Region[];
  alerts: ActiveAlert[];
}

async function fetchOne(provider: AlertProvider, signal: AbortSignal): Promise<SourceResult> {
  // Regions first: the official provider needs its id map populated before it
  // can translate alerts into canonical keys.
  const regions = await provider.fetchRegions(signal);
  const alerts = await provider.fetchAlerts(signal);
  return { id: provider.id, regions, alerts };
}

/**
 * Unions the region trees. The same place seen by two sources becomes one
 * entry listing both, so the picker shows each region exactly once.
 */
function mergeRegions(results: SourceResult[]): Region[] {
  const merged = new Map<string, Region>();

  for (const result of results) {
    for (const region of result.regions) {
      const existing = merged.get(region.id);
      if (!existing) {
        merged.set(region.id, { ...region, sources: [...region.sources] });
        continue;
      }
      for (const source of region.sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
      // Prefer a parent link if either source provides one.
      if (!existing.parentId && region.parentId) existing.parentId = region.parentId;
    }
  }

  return [...merged.values()];
}

/**
 * Unions the alerts, keyed by canonical region and threat type.
 *
 * When both sources report the same alert, the earliest start time wins: if one
 * feed is lagging, the alarm should reflect when the alert actually began.
 */
function mergeAlerts(results: SourceResult[]): ActiveAlert[] {
  const merged = new Map<string, ActiveAlert>();

  for (const result of results) {
    for (const alert of result.alerts) {
      const key = `${alert.regionId}|${alert.type}`;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, { ...alert, sources: [...alert.sources] });
        continue;
      }

      for (const source of alert.sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
      if (isEarlier(alert.since, existing.since)) existing.since = alert.since;
      // A longer name usually carries the parent region too; keep the richer one.
      if (alert.regionName.length > existing.regionName.length) {
        existing.regionName = alert.regionName;
      }
    }
  }

  return [...merged.values()];
}

function isEarlier(candidate: string | undefined, current: string | undefined): boolean {
  if (!candidate) return false;
  if (!current) return true;
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  if (!Number.isFinite(a)) return false;
  if (!Number.isFinite(b)) return true;
  return a < b;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
