import { regionKey } from '../../shared/regionKey';
import type { ActiveAlert, AlertType, Region, ThreatType } from '../../shared/types';
import { ProviderError, type AlertProvider } from './provider';

const ACTIVE_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const REQUEST_TIMEOUT_MS = 15_000;

interface ApiThreat {
  threat_type?: string;
}

interface ApiAlert {
  location_title?: string;
  location_type?: string;
  location_oblast?: string;
  location_raion?: string;
  alert_type?: string;
  started_at?: string;
  finished_at?: string | null;
  notes?: string;
  threats?: ApiThreat[];
}

interface ApiResponse {
  alerts?: ApiAlert[];
}

const THREAT_TYPES = new Set<ThreatType>([
  'tactic_aircraft_activity',
  'strategic_aircraft_activity',
  'mig31k_departure',
  'ballistic_missiles',
  'cruise_missiles',
  'unspecified_missiles',
  'drones',
  'guided_aerial_bombs',
  'air_defense',
  'unknown',
]);

/**
 * alerts.in.ua — needs a free app token, and is the only source that breaks an
 * alert down into what is actually inbound (drones, cruise or ballistic
 * missiles, guided bombs).
 *
 * It publishes only *active* alerts, with no endpoint listing every region, so
 * it cannot populate the region picker on its own — hence `providesRegions`.
 * Keep another source enabled alongside it for the catalogue.
 */
export class AlertsInUaProvider implements AlertProvider {
  readonly id = 'alertsinua' as const;
  readonly label = 'alerts.in.ua (token required)';
  readonly requiresApiKey = true;
  readonly providesRegions = false;

  /** Last `Last-Modified` value, replayed so the API can answer 304. */
  private lastModified: string | null = null;
  private cached: ActiveAlert[] = [];

  constructor(private readonly token: string) {}

  async fetchRegions(): Promise<Region[]> {
    // No catalogue endpoint exists; the aggregator merges regions from the
    // other sources and this one contributes alerts only.
    return [];
  }

  async fetchAlerts(signal: AbortSignal): Promise<ActiveAlert[]> {
    const token = this.token.trim();
    if (!token) throw new ProviderError('No app token configured for alerts.in.ua');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      // The token goes in the header, never the query string, so it cannot
      // leak into logs or proxy history.
      Authorization: `Bearer ${token}`,
    };
    // Conditional requests keep us well inside the 12 req/min hard limit.
    if (this.lastModified) headers['If-Modified-Since'] = this.lastModified;

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);

    let response: Response;
    try {
      response = await fetch(ACTIVE_URL, { signal: combined, headers });
    } catch (error) {
      if (signal.aborted) throw error;
      if (timeout.aborted) throw new ProviderError('Request timed out', error);
      throw new ProviderError('Network request failed', error);
    }

    // Nothing changed since the last poll; the cached view is still correct.
    if (response.status === 304) return this.cached;

    if (!response.ok) throw new ProviderError(describeStatus(response.status), response.status);

    let body: ApiResponse;
    try {
      body = (await response.json()) as ApiResponse;
    } catch (error) {
      throw new ProviderError('alerts.in.ua returned a malformed response', error);
    }

    if (!Array.isArray(body.alerts)) {
      throw new ProviderError('alerts.in.ua returned no alert list');
    }

    this.lastModified = response.headers.get('last-modified');
    this.cached = body.alerts
      .map((alert) => this.toAlert(alert))
      .filter((alert): alert is ActiveAlert => alert !== null);
    return this.cached;
  }

  private toAlert(raw: ApiAlert): ActiveAlert | null {
    // `finished_at` should always be null on this endpoint, but a finished
    // alert must never be shown as active if one slips through.
    if (raw.finished_at) return null;

    const id = this.regionIdFor(raw);
    if (!id) return null;

    const alert: ActiveAlert = {
      regionId: id,
      regionName: displayName(raw),
      type: mapAlertType(raw.alert_type),
      sources: [this.id],
    };

    if (raw.started_at) alert.since = raw.started_at;
    if (raw.notes) alert.notes = raw.notes;

    const threats = (raw.threats ?? [])
      .map((threat) => threat.threat_type)
      .filter((type): type is ThreatType => THREAT_TYPES.has(type as ThreatType));
    if (threats.length > 0) alert.threats = [...new Set(threats)];

    return alert;
  }

  /** Places the alert in the shared oblast → raion → hromada key space. */
  private regionIdFor(raw: ApiAlert): string | null {
    const title = raw.location_title?.trim();
    if (!title) return null;

    const type = (raw.location_type ?? '').toLowerCase();
    if (type === 'oblast') return regionKey('state', title);

    const oblast = raw.location_oblast?.trim();
    // Anything below oblast level needs its oblast to be placed correctly.
    if (!oblast) return null;
    const oblastKey = regionKey('state', oblast);

    if (type === 'raion') return regionKey('district', title, oblastKey);

    if (type === 'hromada' || type === 'city') {
      const raion = raw.location_raion?.trim();
      const parent = raion ? regionKey('district', raion, oblastKey) : oblastKey;
      return regionKey('community', title, parent);
    }

    return null;
  }
}

function displayName(raw: ApiAlert): string {
  const title = raw.location_title ?? '';
  const oblast = raw.location_oblast;
  return oblast && oblast !== title ? `${title}, ${oblast}` : title;
}

function mapAlertType(raw: string | undefined): AlertType {
  switch ((raw ?? '').toLowerCase()) {
    case 'air_raid':
      return 'air_raid';
    case 'artillery_shelling':
      return 'artillery';
    case 'urban_fights':
      return 'urban_fights';
    case 'chemical':
      return 'chemical';
    case 'nuclear':
      return 'nuclear';
    default:
      return 'unknown';
  }
}

function describeStatus(status: number): string {
  if (status === 401) return 'Token rejected by alerts.in.ua (HTTP 401)';
  if (status === 403) return 'alerts.in.ua refused the request (HTTP 403)';
  if (status === 429) return 'Rate limited by alerts.in.ua (HTTP 429) — use a longer poll interval';
  if (status >= 500) return `alerts.in.ua is unavailable (HTTP ${status})`;
  return `alerts.in.ua returned HTTP ${status}`;
}
