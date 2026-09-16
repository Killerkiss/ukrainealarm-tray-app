import {
  alertTypeLabel,
  formatDuration,
  formatTime,
  t,
  threatSummary,
  type StringKey,
} from '../shared/i18n';
import type { AlarmBridge } from '../shared/ipc';
import {
  ALL_PROVIDERS,
  POLL_INTERVAL_MAX_SEC,
  POLL_INTERVAL_MIN_SEC,
  type AppState,
  type Language,
  type ProviderId,
  type Settings,
} from '../shared/types';
import { el, on } from './dom';
import { renderRegionPicker } from './regionPicker';

declare global {
  interface Window {
    alarm: AlarmBridge;
  }
}

const UKRAINEALARM_DOCS_URL = 'https://api.ukrainealarm.com/swagger/index.html';
const ALERTS_IN_UA_DOCS_URL = 'https://devs.alerts.in.ua/';

type TabId = 'regions' | 'sources' | 'alerts' | 'appearance';

const TABS: { id: TabId; label: StringKey }[] = [
  { id: 'regions', label: 'tabRegions' },
  { id: 'sources', label: 'tabSources' },
  { id: 'alerts', label: 'tabAlerts' },
  { id: 'appearance', label: 'tabAppearance' },
];

/** UI-only state that must survive a re-render. */
const ui = {
  tab: 'regions' as TabId,
  query: '',
  openGroups: new Set<string>(),
  scrollTop: 0,
  searchFocused: false,
};

let state: AppState | null = null;

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

void bootstrap(root);

async function bootstrap(container: HTMLElement): Promise<void> {
  state = await window.alarm.getState();
  render(container);

  window.alarm.onStateChanged((next) => {
    state = next;
    render(container);
  });

  // Elapsed times would otherwise only move when a poll lands.
  setInterval(() => {
    if (state?.snapshot.status === 'alert') render(container);
  }, 30_000);
}

async function patch(value: Partial<Settings>, container: HTMLElement): Promise<void> {
  state = await window.alarm.updateSettings(value);
  render(container);
}

function render(container: HTMLElement): void {
  if (!state) return;
  const current = state;

  // Capture transient UI state before the DOM is replaced.
  const list = document.getElementById('region-list');
  if (list) ui.scrollTop = list.scrollTop;
  ui.searchFocused = document.activeElement?.getAttribute('type') === 'search';

  container.replaceChildren(
    renderStatus(current),
    renderTabBar(current, container),
    renderTabPanel(current, container),
    renderFooter(current),
  );
  container.removeAttribute('aria-busy');

  const newList = document.getElementById('region-list');
  if (newList) newList.scrollTop = ui.scrollTop;
  if (ui.searchFocused) {
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  }
}

/* ------------------------------------------------------------------ tabs -- */

function renderTabBar(current: AppState, container: HTMLElement): HTMLElement {
  const lang = current.settings.language;
  const bar = el('nav', { class: 'tabs', role: 'tablist' });

  for (const tab of TABS) {
    const button = el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(ui.tab === tab.id),
      text: t(lang, tab.label),
    });
    on(button, 'click', () => {
      ui.tab = tab.id;
      render(container);
    });
    bar.append(button);
  }
  return bar;
}

function renderTabPanel(current: AppState, container: HTMLElement): HTMLElement {
  const panel = el('div', { class: 'tab-panel', role: 'tabpanel' });

  switch (ui.tab) {
    case 'regions':
      panel.append(renderRegionSection(current, container), renderSelectionSection(current, container));
      break;
    case 'sources':
      panel.append(renderSourceSection(current, container), renderHealthSection(current, container));
      break;
    case 'alerts':
      panel.append(renderNotificationSection(current, container), renderSoundSection(current, container));
      break;
    case 'appearance':
      panel.append(renderIconSection(current, container), renderStartupSection(current, container));
      break;
  }
  return panel;
}

/* ---------------------------------------------------------------- status -- */

function renderStatus(current: AppState): HTMLElement {
  const { settings, snapshot } = current;
  const lang = settings.language;

  const headline =
    settings.regions.length === 0
      ? t(lang, 'noRegions')
      : snapshot.status === 'alert'
        ? t(lang, 'statusAlert')
        : snapshot.status === 'clear'
          ? t(lang, 'statusClear')
          : t(lang, 'statusUnknown');

  const section = el('div', { class: 'status', 'data-status': snapshot.status }, [
    el('p', { class: 'status-headline', text: headline }),
    el('p', {
      class: 'status-meta',
      text: `${t(lang, 'lastUpdated')}: ${formatTime(lang, snapshot.lastUpdated)} · ${t(lang, 'countrywide')}: ${snapshot.countrywideCount}`,
    }),
  ]);

  if (snapshot.alerts.length > 0) {
    const list = el('ul', { class: 'status-list' });
    for (const alert of snapshot.alerts) {
      list.append(
        el('li', {}, [
          el('span', { class: 'region', text: alert.regionName }),
          ' — ',
          alertTypeLabel(lang, alert.type),
          alert.since
            ? el('span', {
                class: 'elapsed',
                text: ` (${t(lang, 'since')} ${formatDuration(lang, alert.since)})`,
              })
            : null,
          // Which feed saw it matters when two sources disagree.
          el('span', { class: 'source-tag', text: alert.sources.join(' + ') }),
          // Only alerts.in.ua says what is actually inbound.
          alert.threats?.length
            ? el('span', { class: 'threats', text: threatSummary(lang, alert.threats) })
            : null,
        ]),
      );
    }
    section.append(list);
  }

  if (snapshot.error) {
    section.append(el('p', { class: 'status-error', text: `${t(lang, 'error')}: ${snapshot.error}` }));
  }

  const refresh = el('button', { type: 'button', text: t(lang, 'refreshNow'), style: 'margin-top:10px' });
  on(refresh, 'click', () => void window.alarm.refreshNow());
  section.append(refresh);
  return section;
}

/* --------------------------------------------------------------- regions -- */

function renderRegionSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings, snapshot } = current;
  const lang = settings.language;
  const selected = new Set(settings.regions);

  const section = el('section', {}, [el('h2', { text: t(lang, 'regionPicker') })]);

  section.append(
    renderRegionPicker({
      regions: current.regions,
      selected,
      active: new Set(snapshot.alerts.map((alert) => alert.regionId)),
      loading: current.regionsLoading,
      error: current.regionsError,
      query: ui.query,
      openGroups: ui.openGroups,
      language: lang,
      onToggle: (id, checked) => {
        const next = new Set(selected);
        if (checked) next.add(id);
        else next.delete(id);
        void patch({ regions: [...next] }, container);
      },
      onQueryChange: (query) => {
        ui.query = query;
        render(container);
      },
      onGroupToggle: (id, open) => {
        if (open) ui.openGroups.add(id);
        else ui.openGroups.delete(id);
      },
      onClear: () => void patch({ regions: [] }, container),
    }),
  );
  return section;
}

/** Right-hand column of the Regions tab: what is selected, and how precisely. */
function renderSelectionSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;
  const byId = new Map(current.regions.map((region) => [region.id, region]));

  const section = el('section', {}, [
    el('h2', { text: `${t(lang, 'selectedRegions')} (${settings.regions.length})` }),
  ]);

  if (settings.regions.length === 0) {
    section.append(el('p', { class: 'hint', text: t(lang, 'noneSelected') }));
  } else {
    const chips = el('div', { class: 'chips' });
    for (const id of settings.regions) {
      const region = byId.get(id);
      const parent = region?.parentId ? byId.get(region.parentId) : undefined;
      const name = region ? (parent ? `${region.name}, ${parent.name}` : region.name) : id;

      const remove = el('button', { type: 'button', text: '✕', 'aria-label': t(lang, 'remove') });
      on(remove, 'click', () =>
        void patch({ regions: settings.regions.filter((other) => other !== id) }, container),
      );

      chips.append(
        el('div', { class: 'chip' }, [
          el('span', { class: 'chip-name', text: name }),
          el('span', { class: 'chip-level', text: levelLabel(lang, region?.level) }),
          remove,
        ]),
      );
    }
    section.append(chips);
  }

  section.append(
    el('h2', { text: t(lang, 'precision'), style: 'margin-top:16px' }),
    toggle(
      t(lang, 'matchParent'),
      t(lang, 'matchParentHint'),
      settings.matchParentAlerts,
      (checked) => void patch({ matchParentAlerts: checked }, container),
    ),
  );

  if (!settings.matchParentAlerts) {
    section.append(el('p', { class: 'notice', text: t(lang, 'strictNotice') }));
  }
  return section;
}

function levelLabel(lang: Language, level: string | undefined): string {
  if (level === 'state') return lang === 'uk' ? 'область' : 'oblast';
  if (level === 'district') return lang === 'uk' ? 'район' : 'raion';
  if (level === 'community') return lang === 'uk' ? 'громада' : 'hromada';
  return '';
}

/* --------------------------------------------------------------- sources -- */

function renderSourceSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;
  const enabled = new Set(settings.providers);

  const section = el('section', {}, [
    el('h2', { text: t(lang, 'sources') }),
    el('p', { class: 'hint', text: t(lang, 'sourcesHint') }),
  ]);

  const labels: Record<ProviderId, { name: StringKey; hint: StringKey; alertsOnly?: boolean }> = {
    free: { name: 'sourceFree', hint: 'sourceFreeHint' },
    ukrainealarm: { name: 'sourceOfficial', hint: 'sourceOfficialHint' },
    alertsinua: { name: 'sourceAlertsInUa', hint: 'sourceAlertsInUaHint', alertsOnly: true },
  };

  for (const id of ALL_PROVIDERS) {
    // Turning off the last source would leave the app polling nothing.
    const isLastEnabled = enabled.has(id) && enabled.size === 1;
    const hint = labels[id].alertsOnly
      ? `${t(lang, labels[id].hint)} ${t(lang, 'alertsOnly')}`
      : t(lang, labels[id].hint);

    section.append(
      toggle(
        t(lang, labels[id].name),
        hint,
        enabled.has(id),
        (checked) => {
          const next = new Set(enabled);
          if (checked) next.add(id);
          else next.delete(id);
          void patch({ providers: [...next] }, container);
        },
        { disabled: isLastEnabled },
      ),
    );
  }

  if (enabled.size === 1) {
    section.append(el('p', { class: 'hint', text: t(lang, 'needOneSource') }));
  }

  if (enabled.has('ukrainealarm')) {
    section.append(
      credentialField({
        label: 'API key',
        value: settings.apiKey,
        placeholder: lang === 'uk' ? 'Вставте API-ключ' : 'Paste your API key',
        hint:
          lang === 'uk'
            ? 'Безкоштовний ключ видає бот @ukrainealarm_bot у Telegram. Документація: '
            : 'Get a free key from the @ukrainealarm_bot Telegram bot. Docs: ',
        url: UKRAINEALARM_DOCS_URL,
        onCommit: (value) => void patch({ apiKey: value }, container),
      }),
    );
  }

  if (enabled.has('alertsinua')) {
    section.append(
      credentialField({
        label: 'alerts.in.ua token',
        value: settings.alertsInUaToken,
        placeholder: lang === 'uk' ? 'Вставте токен' : 'Paste your token',
        hint:
          lang === 'uk'
            ? 'Безкоштовний токен можна отримати за формою на сайті. Документація: '
            : 'Request a free token via the form on their site. Docs: ',
        url: ALERTS_IN_UA_DOCS_URL,
        onCommit: (value) => void patch({ alertsInUaToken: value }, container),
      }),
    );
  }

  return section;
}

/** Right-hand column of the Sources tab: live health plus the poll interval. */
function renderHealthSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings, snapshot } = current;
  const lang = settings.language;

  const section = el('section', {}, [el('h2', { text: t(lang, 'health') })]);
  const health = el('div', { class: 'health' });

  for (const id of settings.providers) {
    const status = snapshot.sources.find((source) => source.id === id);
    const state = status === undefined ? 'wait' : status.ok ? 'ok' : 'fail';
    const label =
      state === 'ok' ? t(lang, 'healthOk') : state === 'fail' ? t(lang, 'healthFail') : t(lang, 'healthWaiting');

    health.append(
      el('div', { class: 'health-row' }, [
        el('span', { class: 'dot', 'data-state': state }),
        el('span', { class: 'health-name', text: id }),
        el('span', {
          class: 'health-meta',
          text:
            state === 'ok'
              ? `${label} · ${status?.alertCount ?? 0} ${t(lang, 'alertsReported')}`
              : label,
        }),
      ]),
    );

    if (status && !status.ok && status.error) {
      health.append(el('p', { class: 'status-error', text: status.error }));
    }
  }
  section.append(health);

  const interval = el('input', {
    type: 'number',
    min: POLL_INTERVAL_MIN_SEC,
    max: POLL_INTERVAL_MAX_SEC,
    step: 5,
    value: settings.pollIntervalSec,
    'aria-label': lang === 'uk' ? 'Інтервал оновлення' : 'Poll interval',
  });
  on(interval, 'change', () => void patch({ pollIntervalSec: Number(interval.value) }, container));

  section.append(
    el('div', { class: 'field', style: 'margin-top:16px' }, [
      el('label', { text: lang === 'uk' ? 'Інтервал оновлення (секунд)' : 'Poll interval (seconds)' }),
      interval,
      el('span', {
        class: 'hint',
        text: `${POLL_INTERVAL_MIN_SEC}–${POLL_INTERVAL_MAX_SEC} ${lang === 'uk' ? 'секунд' : 'seconds'}`,
      }),
    ]),
  );
  return section;
}

/* --------------------------------------------------------- notifications -- */

function renderNotificationSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;

  return el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Сповіщення' : 'Notifications' }),
    toggle(
      lang === 'uk' ? 'Показувати сповіщення' : 'Show desktop notifications',
      lang === 'uk' ? 'Системне сповіщення на початку тривоги.' : 'A system notification when an alert starts.',
      settings.notifications,
      (checked) => void patch({ notifications: checked }, container),
    ),
    toggle(
      lang === 'uk' ? 'Сповіщати про відбій' : 'Notify on all-clear',
      null,
      settings.notifyOnClear,
      (checked) => void patch({ notifyOnClear: checked }, container),
      { nested: true, disabled: !settings.notifications },
    ),
  ]);
}

function renderSoundSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;

  const section = el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Звук' : 'Sound' }),
    toggle(
      lang === 'uk' ? 'Відтворювати звук' : 'Play sound',
      lang === 'uk' ? 'Сирена на початку тривоги.' : 'A siren when an alert starts.',
      settings.sound,
      (checked) => void patch({ sound: checked }, container),
    ),
    toggle(
      lang === 'uk' ? 'Звук на відбій' : 'Sound on all-clear',
      null,
      settings.soundOnClear,
      (checked) => void patch({ soundOnClear: checked }, container),
      { nested: true, disabled: !settings.sound },
    ),
  ]);

  const volume = el('input', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    value: settings.soundVolume,
    'aria-label': lang === 'uk' ? 'Гучність' : 'Volume',
    ...(settings.sound ? {} : { disabled: true }),
  });
  on(volume, 'change', () => void patch({ soundVolume: Number(volume.value) }, container));

  const test = el('button', {
    type: 'button',
    text: lang === 'uk' ? 'Перевірити' : 'Test',
    ...(settings.sound ? {} : { disabled: true }),
  });
  on(test, 'click', () => void window.alarm.testSound());

  section.append(
    el('div', { class: 'field' }, [
      el('label', {
        text: `${lang === 'uk' ? 'Гучність' : 'Volume'}: ${Math.round(settings.soundVolume * 100)}%`,
      }),
      el('div', { class: 'row' }, [volume, test]),
    ]),
  );
  return section;
}

/* ------------------------------------------------------------ appearance -- */

function renderIconSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;

  return el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Іконка' : 'Tray icon' }),
    toggle(
      lang === 'uk' ? 'Кольорова іконка в треї' : 'Colour-coded tray icon',
      lang === 'uk'
        ? 'Червона під час тривоги, зелена у спокої, жовта коли стан невідомий. Вимкніть для однотонної іконки.'
        : 'Red during an alert, green when clear, amber when unknown. Turn off for a single neutral icon.',
      settings.colorIcon,
      (checked) => void patch({ colorIcon: checked }, container),
    ),
  ]);
}

function renderStartupSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;

  const languageSelect = el('select', { 'aria-label': lang === 'uk' ? 'Мова' : 'Language' }, [
    el('option', { value: 'uk', text: 'Українська', ...(lang === 'uk' ? { selected: true } : {}) }),
    el('option', { value: 'en', text: 'English', ...(lang === 'en' ? { selected: true } : {}) }),
  ]);
  on(languageSelect, 'change', () =>
    void patch({ language: languageSelect.value as Language }, container),
  );

  return el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Запуск' : 'Startup' }),
    toggle(
      lang === 'uk' ? 'Запускати разом із системою' : 'Launch at login',
      null,
      settings.launchAtLogin,
      (checked) => void patch({ launchAtLogin: checked }, container),
    ),
    toggle(
      lang === 'uk' ? 'Запускати згорнутим у трей' : 'Start minimised to tray',
      lang === 'uk' ? 'Не відкривати це вікно на старті.' : 'Do not open this window on launch.',
      settings.startMinimized,
      (checked) => void patch({ startMinimized: checked }, container),
    ),
    el('div', { class: 'field', style: 'margin-top:12px' }, [
      el('label', { text: lang === 'uk' ? 'Мова' : 'Language' }),
      languageSelect,
    ]),
  ]);
}

function renderFooter(current: AppState): HTMLElement {
  const lang = current.settings.language;
  return el('footer', {}, [
    el('span', { text: `v${current.appVersion}` }),
    el('span', {
      text:
        lang === 'uk'
          ? 'Закриття вікна залишає застосунок у треї'
          : 'Closing this window keeps the app in the tray',
    }),
  ]);
}

/* ----------------------------------------------------------------- utils -- */

/** A password-style credential input that commits on blur, not per keystroke. */
function credentialField(options: {
  label: string;
  value: string;
  placeholder: string;
  hint: string;
  url: string;
  onCommit: (value: string) => void;
}): HTMLElement {
  const input = el('input', {
    type: 'password',
    value: options.value,
    placeholder: options.placeholder,
    'aria-label': options.label,
  });
  // Each change re-fetches from the source, so commit on blur/Enter only.
  on(input, 'change', () => options.onCommit(input.value.trim()));

  const link = el('a', { href: '#', text: options.url });
  on(link, 'click', (event) => {
    event.preventDefault();
    void window.alarm.openExternal(options.url);
  });

  return el('div', { class: 'field', style: 'margin-top:12px' }, [
    el('label', { text: options.label }),
    input,
    el('span', { class: 'hint' }, [options.hint, link]),
  ]);
}

function toggle(
  label: string,
  hint: string | null,
  checked: boolean,
  onChange: (checked: boolean) => void,
  options: { nested?: boolean; disabled?: boolean } = {},
): HTMLElement {
  const input = el('input', {
    type: 'checkbox',
    ...(checked ? { checked: true } : {}),
    ...(options.disabled ? { disabled: true } : {}),
  });
  on(input, 'change', () => onChange(input.checked));

  return el('label', { class: 'toggle', 'data-nested': String(Boolean(options.nested)) }, [
    input,
    el('span', { class: 'toggle-body' }, [
      el('span', { text: label }),
      hint ? el('span', { class: 'hint', text: hint }) : null,
    ]),
  ]);
}
