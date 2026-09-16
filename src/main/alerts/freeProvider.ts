import { parseAlertLevel } from '../../shared/alertLevel';
import { regionKey } from '../../shared/regionKey';
import type { ActiveAlert, Region } from '../../shared/types';
import { fetchJson, ProviderError, type AlertProvider } from './provider';

const STATUSES_URL = 'https://vadimklimenko.com/map/statuses.json';

interface MirrorNode {
  enabled?: boolean;
  enabled_at?: string | null;
  alert_level?: string | null;
  districts?: Record<string, MirrorNode>;
}

interface MirrorResponse {
  states?: Record<string, MirrorNode>;
}

/**
 * Free, key-less source. It mirrors the public alert map at oblast and raion
 * level and reports no threat type, so every alert is reported as `air_raid`.
 *
 * It has no city/hromada level at all — that granularity needs the official
 * API.
 */
export class FreeMirrorProvider implements AlertProvider {
  readonly id = 'free' as const;
  readonly label = 'Public alert map mirror (no API key)';
  readonly requiresApiKey = false;

  async fetchRegions(signal: AbortSignal): Promise<Region[]> {
    const states = await this.fetchStates(signal);
    const regions: Region[] = [];

    for (const [stateName, state] of Object.entries(states)) {
      const stateKey = regionKey('state', stateName);
      regions.push({
        id: stateKey,
        name: stateName,
        level: 'state',
        sources: [this.id],
      });

      for (const districtName of Object.keys(state.districts ?? {})) {
        regions.push({
          id: regionKey('district', districtName, stateKey),
          name: districtName,
          level: 'district',
          parentId: stateKey,
          sources: [this.id],
        });
      }
    }

    return regions;
  }

  async fetchAlerts(signal: AbortSignal): Promise<ActiveAlert[]> {
    const states = await this.fetchStates(signal);
    const alerts: ActiveAlert[] = [];

    for (const [stateName, state] of Object.entries(states)) {
      const stateKey = regionKey('state', stateName);
      if (state.enabled) {
        alerts.push(this.toAlert(stateKey, stateName, state));
      }

      for (const [districtName, district] of Object.entries(state.districts ?? {})) {
        if (district.enabled) {
          alerts.push(
            this.toAlert(
              regionKey('district', districtName, stateKey),
              `${districtName}, ${stateName}`,
              district,
            ),
          );
        }
      }
    }

    return alerts;
  }

  private toAlert(id: string, name: string, node: MirrorNode): ActiveAlert {
    const alert: ActiveAlert = {
      regionId: id,
      regionName: name,
      type: 'air_raid',
      level: parseAlertLevel(node.alert_level),
      sources: [this.id],
    };
    if (node.enabled_at) alert.since = node.enabled_at;
    return alert;
  }

  private async fetchStates(signal: AbortSignal): Promise<Record<string, MirrorNode>> {
    const body = await fetchJson<MirrorResponse>(STATUSES_URL, signal);
    if (!body.states || typeof body.states !== 'object') {
      throw new ProviderError('Alert mirror returned no region data');
    }
    return body.states;
  }
}
