import { regionKey } from '../../shared/regionKey';
import type { ActiveAlert, AlertType, Region } from '../../shared/types';
import { fetchJson, ProviderError, type AlertProvider } from './provider';

const BASE_URL = 'https://api.ukrainealarm.com/api/v3';

interface ApiRegion {
  regionId?: string;
  regionName?: string;
  regionType?: string;
  regionChildIds?: ApiRegion[];
}

interface ApiRegionsResponse {
  states?: ApiRegion[];
}

interface ApiAlert {
  regionId?: string;
  regionType?: string;
  type?: string;
  lastUpdate?: string;
}

interface ApiAlertRegion {
  regionId?: string;
  regionName?: string;
  regionType?: string;
  activeAlerts?: ApiAlert[];
}

/**
 * The official api.ukrainealarm.com source. It needs a free API key (issued by
 * the @ukrainealarm_bot Telegram bot) and in return gives threat types and
 * hromada-level precision that the free mirror cannot provide.
 */
export class UkraineAlarmProvider implements AlertProvider {
  readonly id = 'ukrainealarm' as const;
  readonly label = 'api.ukrainealarm.com (official, API key required)';
  readonly requiresApiKey = true;

  /** Numeric API region id -> canonical key, filled by {@link fetchRegions}. */
  private readonly keyById = new Map<string, string>();
  /** Canonical key -> display name, for alerts whose region we already know. */
  private readonly nameByKey = new Map<string, string>();

  constructor(private readonly apiKey: string) {}

  async fetchRegions(signal: AbortSignal): Promise<Region[]> {
    const body = await this.get<ApiRegionsResponse>('/regions', signal);
    const states = body.states ?? [];
    if (states.length === 0) {
      throw new ProviderError('The API returned an empty region list');
    }

    // Numeric API ids are kept only to translate alerts; the canonical key is
    // what the rest of the app and the other sources agree on.
    this.keyById.clear();

    const regions: Region[] = [];
    for (const state of states) {
      if (!state.regionId || !state.regionName) continue;
      const stateKey = regionKey('state', state.regionName);
      this.keyById.set(state.regionId, stateKey);
      this.nameByKey.set(stateKey, state.regionName);
      regions.push({ id: stateKey, name: state.regionName, level: 'state', sources: [this.id] });

      for (const child of state.regionChildIds ?? []) {
        if (!child.regionId || !child.regionName) continue;
        const level = childLevel(child.regionType);
        const childKey = regionKey(level, child.regionName, stateKey);
        this.keyById.set(child.regionId, childKey);
        this.nameByKey.set(childKey, `${child.regionName}, ${state.regionName}`);
        regions.push({
          id: childKey,
          name: child.regionName,
          level,
          parentId: stateKey,
          sources: [this.id],
        });
      }
    }
    return regions;
  }

  async fetchAlerts(signal: AbortSignal): Promise<ActiveAlert[]> {
    // This endpoint answers with an array, unlike /regions which wraps in an object.
    const body = await this.get<ApiAlertRegion[]>('/alerts', signal);
    if (!Array.isArray(body)) {
      throw new ProviderError('The API returned an unexpected alert payload');
    }

    const alerts: ActiveAlert[] = [];
    for (const region of body) {
      for (const active of region.activeAlerts ?? []) {
        // An entry may describe a hromada inside the parent oblast, in which
        // case the inner regionId is the one the user may have subscribed to.
        const apiId = active.regionId ?? region.regionId;
        if (!apiId) continue;

        // An alert for a region missing from /regions cannot be placed in the
        // hierarchy, so it is skipped rather than given a bogus key.
        const key = this.keyById.get(apiId);
        if (!key) continue;

        const alert: ActiveAlert = {
          regionId: key,
          regionName: this.nameByKey.get(key) ?? region.regionName ?? key,
          type: mapAlertType(active.type),
          // The v3 schema carries no severity, so it must not be guessed.
          level: 'unknown',
          sources: [this.id],
        };
        if (active.lastUpdate) alert.since = active.lastUpdate;
        alerts.push(alert);
      }
    }
    return alerts;
  }

  private get<T>(path: string, signal: AbortSignal): Promise<T> {
    if (!this.apiKey.trim()) {
      throw new ProviderError('No API key configured for api.ukrainealarm.com');
    }
    return fetchJson<T>(`${BASE_URL}${path}`, signal, {
      headers: { Authorization: this.apiKey.trim() },
    });
  }
}

/** The API nests hromadas under oblasts; anything else is treated as a raion. */
function childLevel(regionType: string | undefined): 'district' | 'community' {
  return (regionType ?? '').toLowerCase() === 'community' ? 'community' : 'district';
}

function mapAlertType(raw: string | undefined): AlertType {
  switch ((raw ?? '').toUpperCase()) {
    case 'AIR':
      return 'air_raid';
    case 'ARTILLERY':
      return 'artillery';
    case 'URBANFIGHTS':
      return 'urban_fights';
    case 'CHEMICAL':
      return 'chemical';
    case 'NUCLEAR':
      return 'nuclear';
    default:
      return 'unknown';
  }
}
