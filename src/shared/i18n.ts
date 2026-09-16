import type { AlertType, Language, ThreatType } from './types';

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

    tabRegions: 'Регіони',
    tabSources: 'Джерела',
    tabAlerts: 'Сповіщення',
    tabAppearance: 'Вигляд',

    regionPicker: 'Вибір регіонів',
    selectedRegions: 'Вибрано',
    noneSelected: 'Поки нічого не вибрано. Позначте область, район або громаду ліворуч.',
    remove: 'Прибрати',

    precision: 'Точність',
    matchParent: 'Сповіщати про тривоги по всій області',
    matchParentHint:
      'Увімкнено: тривога по всій області стосується і вас. Вимкніть, щоб отримувати сповіщення лише коли тривога саме у вашому районі чи місті.',
    strictNotice:
      'Суворий режим: тривоги рівня області ігноруються. Більшість тривог в Україні оголошують саме по області, тож сповіщень стане значно менше.',

    sources: 'Джерела даних',
    sourcesHint:
      'Можна увімкнути обидва. Тривога спрацює щойно про неї повідомить будь-яке джерело.',
    sourceFree: 'Публічне дзеркало',
    sourceFreeHint: 'Без ключа. Рівень області та району.',
    sourceOfficial: 'api.ukrainealarm.com',
    sourceOfficialHint: 'Потрібен безкоштовний ключ. Типи загроз і точність до громади.',
    sourceAlertsInUa: 'alerts.in.ua',
    sourceAlertsInUaHint:
      'Потрібен безкоштовний токен. Єдине джерело, що вказує саме тип загрози: дрони, балістика, крилаті ракети, КАБи.',
    alertsOnly: 'Лише тривоги — не надає список регіонів. Тримайте увімкненим ще одне джерело.',
    threats: 'Загрози',
    health: 'Стан джерел',
    healthOk: 'працює',
    healthFail: 'помилка',
    healthWaiting: 'очікування',
    alertsReported: 'тривог по країні',
    needOneSource: 'Має бути увімкнене хоча б одне джерело.',
    coverage: 'Покриття',
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

    tabRegions: 'Regions',
    tabSources: 'Sources',
    tabAlerts: 'Notifications',
    tabAppearance: 'Appearance',

    regionPicker: 'Pick regions',
    selectedRegions: 'Selected',
    noneSelected: 'Nothing selected yet. Tick an oblast, raion or hromada on the left.',
    remove: 'Remove',

    precision: 'Precision',
    matchParent: 'Alert on oblast-wide alerts',
    matchParentHint:
      'On: an alert covering the whole oblast counts for you. Turn it off to be notified only when the alert is for your own raion or city.',
    strictNotice:
      'Strict mode: oblast-level alerts are ignored. Most Ukrainian alerts are declared oblast-wide, so you will get far fewer notifications.',

    sources: 'Data sources',
    sourcesHint:
      'Both can be enabled. An alert fires as soon as the first source reports it.',
    sourceFree: 'Public mirror',
    sourceFreeHint: 'No key needed. Oblast and raion level.',
    sourceOfficial: 'api.ukrainealarm.com',
    sourceOfficialHint: 'Needs a free key. Threat types and hromada-level precision.',
    sourceAlertsInUa: 'alerts.in.ua',
    sourceAlertsInUaHint:
      'Needs a free token. The only source that names the actual threat: drones, ballistic, cruise missiles, guided bombs.',
    alertsOnly: 'Alerts only — publishes no region list. Keep another source enabled.',
    threats: 'Threats',
    health: 'Source health',
    healthOk: 'working',
    healthFail: 'failed',
    healthWaiting: 'waiting',
    alertsReported: 'alerts countrywide',
    needOneSource: 'At least one source must stay enabled.',
    coverage: 'Coverage',
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

const THREAT_LABELS: Record<Language, Record<ThreatType, string>> = {
  uk: {
    tactic_aircraft_activity: 'тактична авіація',
    strategic_aircraft_activity: 'стратегічна авіація',
    mig31k_departure: 'зліт МіГ-31К',
    ballistic_missiles: 'балістика',
    cruise_missiles: 'крилаті ракети',
    unspecified_missiles: 'ракети',
    drones: 'дрони',
    guided_aerial_bombs: 'КАБи',
    air_defense: 'робота ППО',
    unknown: 'невідома загроза',
  },
  en: {
    tactic_aircraft_activity: 'tactical aircraft',
    strategic_aircraft_activity: 'strategic aircraft',
    mig31k_departure: 'MiG-31K takeoff',
    ballistic_missiles: 'ballistic missiles',
    cruise_missiles: 'cruise missiles',
    unspecified_missiles: 'missiles',
    drones: 'drones',
    guided_aerial_bombs: 'guided bombs',
    air_defense: 'air defence active',
    unknown: 'unknown threat',
  },
};

export function threatLabel(language: Language, threat: ThreatType): string {
  return THREAT_LABELS[language][threat];
}

/** Joins the threat breakdown for a tooltip or notification line. */
export function threatSummary(language: Language, threats: ThreatType[] | undefined): string {
  if (!threats || threats.length === 0) return '';
  return threats.map((threat) => threatLabel(language, threat)).join(', ');
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
