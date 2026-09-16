import { alertTypeLabel, formatDuration, formatTime, t } from '../shared/i18n';
import type { AlarmBridge } from '../shared/ipc';
import {
  POLL_INTERVAL_MAX_SEC,
  POLL_INTERVAL_MIN_SEC,
  type AppState,
  type Language,
  type Settings,
} from '../shared/types';
import { el, on } from './dom';
import { renderRegionPicker } from './regionPicker';

declare global {
  interface Window {
    alarm: AlarmBridge;
  }
}

const KEY_INSTRUCTIONS_URL = 'https://api.ukrainealarm.com/swagger/index.html';

/** UI-only state that must survive a re-render. */
const ui = {
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

  // Elapsed times in the status banner would otherwise only move when a poll
  // lands, which can be minutes apart.
  setInterval(() => {
    if (state?.snapshot.status === 'alert') render(container);
  }, 30_000);
}

async function patch(patchValue: Partial<Settings>, container: HTMLElement): Promise<void> {
  state = await window.alarm.updateSettings(patchValue);
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
    renderSourceSection(current, container),
    renderRegionSection(current, container),
    renderNotificationSection(current, container),
    renderAppearanceSection(current, container),
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
        ]),
      );
    }
    section.append(list);
  }

  if (snapshot.error) {
    section.append(el('p', { class: 'status-error', text: `${t(lang, 'error')}: ${snapshot.error}` }));
  }

  const refresh = el('button', {
    type: 'button',
    text: t(lang, 'refreshNow'),
    style: 'margin-top:10px',
  });
  on(refresh, 'click', () => void window.alarm.refreshNow());
  section.append(refresh);

  return section;
}

/* ---------------------------------------------------------------- source -- */

function renderSourceSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;
  const section = el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Джерело даних' : 'Data source' }),
  ]);

  const select = el('select', { 'aria-label': lang === 'uk' ? 'Джерело даних' : 'Data source' }, [
    el('option', {
      value: 'free',
      text: lang === 'uk' ? 'Публічне дзеркало (без ключа)' : 'Public mirror (no API key)',
      ...(settings.provider === 'free' ? { selected: true } : {}),
    }),
    el('option', {
      value: 'ukrainealarm',
      text: lang === 'uk' ? 'api.ukrainealarm.com (потрібен ключ)' : 'api.ukrainealarm.com (API key)',
      ...(settings.provider === 'ukrainealarm' ? { selected: true } : {}),
    }),
  ]);
  on(select, 'change', () => {
    // Region ids are provider-specific, so a switch invalidates the selection.
    void patch({ provider: select.value as Settings['provider'], regions: [] }, container);
  });

  section.append(
    el('div', { class: 'field' }, [
      el('label', { text: lang === 'uk' ? 'Постачальник' : 'Provider' }),
      select,
      el('span', {
        class: 'hint',
        text:
          lang === 'uk'
            ? 'Дзеркало працює без налаштувань (область/район). Офіційний API дає типи загроз і точність до громади.'
            : 'The mirror works with no setup (oblast/raion). The official API adds threat types and hromada-level precision.',
      }),
    ]),
  );

  if (settings.provider === 'ukrainealarm') {
    const input = el('input', {
      type: 'password',
      value: settings.apiKey,
      placeholder: lang === 'uk' ? 'Вставте API-ключ' : 'Paste your API key',
      'aria-label': 'API key',
    });
    // Commit on blur/Enter rather than per keystroke: each change re-fetches
    // the whole region list.
    on(input, 'change', () => void patch({ apiKey: input.value.trim() }, container));

    const link = el('a', { href: '#', text: KEY_INSTRUCTIONS_URL });
    on(link, 'click', (event) => {
      event.preventDefault();
      void window.alarm.openExternal(KEY_INSTRUCTIONS_URL);
    });

    section.append(
      el('div', { class: 'field' }, [
        el('label', { text: 'API key' }),
        input,
        el('span', { class: 'hint' }, [
          lang === 'uk' ? 'Безкоштовний ключ видає бот @ukrainealarm_bot у Telegram. Документація: ' : 'Get a free key from the @ukrainealarm_bot Telegram bot. Docs: ',
          link,
        ]),
      ]),
    );

    if (current.regionsError) {
      section.append(el('p', { class: 'status-error', text: current.regionsError }));
    }
  }

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
    el('div', { class: 'field' }, [
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

/* --------------------------------------------------------------- regions -- */

function renderRegionSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings, snapshot } = current;
  const lang = settings.language;
  const selected = new Set(settings.regions);

  const section = el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Мої регіони' : 'My regions' }),
  ]);

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

/* --------------------------------------------------------- notifications -- */

function renderNotificationSection(current: AppState, container: HTMLElement): HTMLElement {
  const { settings } = current;
  const lang = settings.language;

  const section = el('section', {}, [
    el('h2', { text: lang === 'uk' ? 'Сповіщення та звук' : 'Notifications & sound' }),
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
      el('label', { text: `${lang === 'uk' ? 'Гучність' : 'Volume'}: ${Math.round(settings.soundVolume * 100)}%` }),
      el('div', { class: 'row' }, [volume, test]),
    ]),
  );

  return section;
}

/* ------------------------------------------------------------ appearance -- */

function renderAppearanceSection(current: AppState, container: HTMLElement): HTMLElement {
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
    el('h2', { text: lang === 'uk' ? 'Вигляд і запуск' : 'Appearance & startup' }),
    toggle(
      lang === 'uk' ? 'Кольорова іконка в треї' : 'Colour-coded tray icon',
      lang === 'uk'
        ? 'Червона під час тривоги, зелена у спокої, жовта коли стан невідомий. Вимкніть для однотонної іконки.'
        : 'Red during an alert, green when clear, amber when unknown. Turn off for a single neutral icon.',
      settings.colorIcon,
      (checked) => void patch({ colorIcon: checked }, container),
    ),
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
    el('div', { class: 'field' }, [
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
      text: lang === 'uk' ? 'Закриття вікна залишає застосунок у треї' : 'Closing this window keeps the app in the tray',
    }),
  ]);
}

/* ----------------------------------------------------------------- utils -- */

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
