import type { AlertType, Language } from './types';

/**
 * Small hand-rolled dictionary. The app is Ukrainian-first: `uk` is the default
 * and `en` exists so non-Ukrainian speakers can configure it.
 */
const STRINGS = {
  uk: {
    appName: 'Тривога',
    settings: 'Налаштування…',
    refreshNow: 'Оновити зараз',
    quit: 'Вийти',
    muteFor: 'Приглушити звук',
    muted: 'Звук приглушено',
    unmute: 'Увімкнути звук',
    statusAlert: 'ПОВІТРЯНА ТРИВОГА',
    statusClear: 'Відбій — тривоги немає',
    statusUnknown: 'Стан невідомий',
    noRegions: 'Регіон не вибрано — відкрийте налаштування',
    lastUpdated: 'Оновлено',
    since: 'з',
    countrywide: 'По країні активних тривог',
    error: 'Помилка',
    alertStarted: 'Тривога!',
    alertEnded: 'Відбій тривоги',
    never: 'ще не оновлювалось',
    durationNow: 'щойно',
  },
  en: {
    appName: 'Ukraine Alarm',
    settings: 'Settings…',
    refreshNow: 'Refresh now',
    quit: 'Quit',
    muteFor: 'Mute sound',
    muted: 'Sound muted',
    unmute: 'Unmute sound',
    statusAlert: 'AIR RAID ALERT',
    statusClear: 'All clear — no alert',
    statusUnknown: 'Status unknown',
    noRegions: 'No region selected — open Settings',
    lastUpdated: 'Updated',
    since: 'since',
    countrywide: 'Active alerts countrywide',
    error: 'Error',
    alertStarted: 'Air raid alert!',
    alertEnded: 'All clear',
    never: 'never',
    durationNow: 'just now',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];

export function t(language: Language, key: StringKey): string {
  return STRINGS[language][key];
}

const ALERT_TYPE_LABELS: Record<Language, Record<AlertType, string>> = {
  uk: {
    air_raid: 'Повітряна тривога',
    artillery: 'Загроза артобстрілу',
    urban_fights: 'Вуличні бої',
    chemical: 'Хімічна загроза',
    nuclear: 'Радіаційна загроза',
    unknown: 'Тривога',
  },
  en: {
    air_raid: 'Air raid',
    artillery: 'Artillery threat',
    urban_fights: 'Urban fighting',
    chemical: 'Chemical threat',
    nuclear: 'Radiation threat',
    unknown: 'Alert',
  },
};

export function alertTypeLabel(language: Language, type: AlertType): string {
  return ALERT_TYPE_LABELS[language][type];
}

/**
 * Formats an elapsed duration as `20 хв`, `3 год 5 хв` or `412 д 7 год`.
 *
 * Days matter: alerts over the occupied territories have been running since
 * 2022, and rendering those as a five-digit hour count is unreadable.
 */
export function formatDuration(language: Language, fromIso: string, now = Date.now()): string {
  const started = new Date(fromIso).getTime();
  if (!Number.isFinite(started)) return t(language, 'durationNow');

  const minutesTotal = Math.floor((now - started) / 60_000);
  if (minutesTotal < 1) return t(language, 'durationNow');

  const d = language === 'uk' ? 'д' : 'd';
  const h = language === 'uk' ? 'год' : 'h';
  const m = language === 'uk' ? 'хв' : 'min';

  const days = Math.floor(minutesTotal / 1440);
  const hours = Math.floor((minutesTotal % 1440) / 60);
  const minutes = minutesTotal % 60;

  // Only ever show the two most significant units.
  if (days > 0) return hours > 0 ? `${days} ${d} ${hours} ${h}` : `${days} ${d}`;
  if (hours > 0) return minutes > 0 ? `${hours} ${h} ${minutes} ${m}` : `${hours} ${h}`;
  return `${minutes} ${m}`;
}

export function formatTime(language: Language, iso: string | null): string {
  if (!iso) return t(language, 'never');
  return new Date(iso).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
