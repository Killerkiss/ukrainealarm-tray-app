import type { ActiveAlert, Region } from '../../shared/types';

/**
 * A source of air-raid data. Implementations must be stateless with respect to
 * user settings: the poller passes everything they need on each call.
 */
export interface AlertProvider {
  readonly id: string;
  /** Shown in the UI so the user knows where the data comes from. */
  readonly label: string;
  /** True when {@link fetchRegions}/{@link fetchAlerts} need an API key. */
  readonly requiresApiKey: boolean;
  /** The full list of places the user can subscribe to. */
  fetchRegions(signal: AbortSignal): Promise<Region[]>;
  /** Every alert currently active in the country. */
  fetchAlerts(signal: AbortSignal): Promise<ActiveAlert[]>;
}

/** Raised when a provider cannot produce data; the message is surfaced in the UI. */
export class ProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProviderError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `fetch` with a timeout that also honours an outer abort signal, so a poll in
 * flight is dropped immediately when settings change or the app quits.
 */
export async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
  init: { headers?: Record<string, string> } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: combined,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.aborted) throw new ProviderError('Request timed out', error);
    throw new ProviderError('Network request failed', error);
  }

  if (!response.ok) {
    throw new ProviderError(describeHttpError(response.status), response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderError('Provider returned a malformed response', error);
  }
}

function describeHttpError(status: number): string {
  if (status === 401 || status === 403) return 'API key rejected (HTTP ' + status + ')';
  if (status === 429) return 'Rate limited by the provider (HTTP 429) — try a longer poll interval';
  if (status >= 500) return `Provider is unavailable (HTTP ${status})`;
  return `Provider returned HTTP ${status}`;
}
