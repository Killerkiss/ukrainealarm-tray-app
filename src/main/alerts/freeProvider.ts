import type { ActiveAlert, Region } from '../../shared/types';
import { fetchJson, ProviderError, type AlertProvider } from './provider';

const STATUSES_URL = 'https://vadimklimenko.com/map/statuses.json';

interface MirrorNode {
  enabled?: boolean;
  enabled_at?: string | null;
  districts?: Record<string, MirrorNode>;
}

interface MirrorResponse {
  states?: Record<string, MirrorNode>;
}

/**
 * Free, key-less source. It mirrors the public alert map at oblast and raion
 * level and reports no threat type, so every alert is reported as `air_raid`.
 *
 * Region ids are derived from the Ukrainian place names the mirror uses, since
 * it exposes no numeric ids: `free:<oblast>` and `free:<oblast>/<raion>`.
 */
export class FreeMirrorProvider implements AlertProvider {
  readonly id = 'free';
  readonly label = 'Public alert map mirror (no API key)';
  readonly requiresApiKey = false;

  async fetchRegions(signal: AbortSignal): Promise<Region[]> {
    const states = await this.fetchStates(signal);
    const regions: Region[] = [];

    for (const [stateName, state] of Object.entries(states)) {
      const stateId = regionId(stateName);
      regions.push({ id: stateId, name: stateName, level: 'state' });

      for (const districtName of Object.keys(state.districts ?? {})) {
        regions.push({
          id: regionId(stateName, districtName),
          name: districtName,
          level: 'district',
          parentId: stateId,
        });
      }
    }

    return regions;
  }

  async fetchAlerts(signal: AbortSignal): Promise<ActiveAlert[]> {
    const states = await this.fetchStates(signal);
    const alerts: ActiveAlert[] = [];

    for (const [stateName, state] of Object.entries(states)) {
      if (state.enabled) {
        alerts.push(toAlert(regionId(stateName), stateName, state));
      }

      for (const [districtName, district] of Object.entries(state.districts ?? {})) {
        if (district.enabled) {
          alerts.push(
            toAlert(regionId(stateName, districtName), `${districtName}, ${stateName}`, district),
          );
        }
      }
    }

    return alerts;
  }

  private async fetchStates(signal: AbortSignal): Promise<Record<string, MirrorNode>> {
    const body = await fetchJson<MirrorResponse>(STATUSES_URL, signal);
    if (!body.states || typeof body.states !== 'object') {
      throw new ProviderError('Alert mirror returned no region data');
    }
    return body.states;
  }
}

function toAlert(id: string, name: string, node: MirrorNode): ActiveAlert {
  const alert: ActiveAlert = { regionId: id, regionName: name, type: 'air_raid' };
  if (node.enabled_at) alert.since = node.enabled_at;
  return alert;
}

function regionId(state: string, district?: string): string {
  return district ? `free:${state}/${district}` : `free:${state}`;
}
