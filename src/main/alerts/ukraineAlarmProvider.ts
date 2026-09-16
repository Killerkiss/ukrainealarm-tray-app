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
  readonly id = 'ukrainealarm';
  readonly label = 'api.ukrainealarm.com (official, API key required)';
  readonly requiresApiKey = true;

  constructor(private readonly apiKey: string) {}

  async fetchRegions(signal: AbortSignal): Promise<Region[]> {
    const body = await this.get<ApiRegionsResponse>('/regions', signal);
    const states = body.states ?? [];
    if (states.length === 0) {
      throw new ProviderError('The API returned an empty region list');
    }

    const regions: Region[] = [];
    for (const state of states) {
      if (!state.regionId || !state.regionName) continue;
      regions.push({ id: state.regionId, name: state.regionName, level: 'state' });

      for (const child of state.regionChildIds ?? []) {
        if (!child.regionId || !child.regionName) continue;
        regions.push({
          id: child.regionId,
          name: child.regionName,
          level: 'district',
          parentId: state.regionId,
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
        const id = active.regionId ?? region.regionId;
        if (!id) continue;

        const alert: ActiveAlert = {
          regionId: id,
          regionName: region.regionName ?? id,
          type: mapAlertType(active.type),
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
