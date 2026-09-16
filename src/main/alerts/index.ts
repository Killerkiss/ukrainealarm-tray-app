import type { ProviderId, Settings } from '../../shared/types';
import { FreeMirrorProvider } from './freeProvider';
import type { AlertProvider } from './provider';
import { UkraineAlarmProvider } from './ukraineAlarmProvider';

/** Builds the provider described by the current settings. */
export function createProvider(settings: Settings): AlertProvider {
  const id: ProviderId = settings.provider;
  return id === 'ukrainealarm'
    ? new UkraineAlarmProvider(settings.apiKey)
    : new FreeMirrorProvider();
}

export { ProviderError } from './provider';
export type { AlertProvider } from './provider';
