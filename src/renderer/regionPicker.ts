import { el, on } from './dom';
import type { Region } from '../shared/types';

export interface RegionPickerOptions {
  regions: Region[];
  selected: Set<string>;
  /** Region ids currently under alert, highlighted in the list. */
  active: Set<string>;
  loading: boolean;
  error: string | null;
  query: string;
  openGroups: Set<string>;
  language: 'uk' | 'en';
  onToggle(id: string, checked: boolean): void;
  onQueryChange(query: string): void;
  onGroupToggle(id: string, open: boolean): void;
  onClear(): void;
}

interface Group {
  state: Region;
  districts: Region[];
}

/**
 * Two-level oblast → raion picker.
 *
 * Selecting an oblast covers every raion inside it (the main process resolves
 * that hierarchy), so the parent checkbox is not a "select all children" bulk
 * action — it is a subscription in its own right. Children are shown as
 * indeterminate-free independent checkboxes to keep that distinction honest.
 */
export function renderRegionPicker(options: RegionPickerOptions): HTMLElement {
  const container = el('div');

  const search = el('input', {
    type: 'search',
    placeholder: options.language === 'uk' ? 'Пошук області або району…' : 'Search oblast or raion…',
    value: options.query,
    'aria-label': options.language === 'uk' ? 'Пошук регіону' : 'Search region',
  });
  on(search, 'input', () => options.onQueryChange(search.value));

  const clearButton = el('button', {
    type: 'button',
    text: options.language === 'uk' ? 'Зняти все' : 'Clear all',
    ...(options.selected.size === 0 ? { disabled: true } : {}),
  });
  on(clearButton, 'click', () => options.onClear());

  container.append(el('div', { class: 'region-toolbar' }, [search, clearButton]));
  container.append(
    el('p', {
      class: 'selected-count',
      text:
        options.language === 'uk'
          ? `Вибрано регіонів: ${options.selected.size}`
          : `${options.selected.size} region(s) selected`,
    }),
  );

  const list = el('div', { class: 'region-list', id: 'region-list' });

  if (options.error) {
    list.append(el('p', { class: 'empty', text: options.error }));
  } else if (options.loading && options.regions.length === 0) {
    list.append(el('p', { class: 'empty', text: options.language === 'uk' ? 'Завантаження…' : 'Loading…' }));
  } else {
    const groups = filterGroups(buildGroups(options.regions), options.query);
    if (groups.length === 0) {
      list.append(
        el('p', { class: 'empty', text: options.language === 'uk' ? 'Нічого не знайдено' : 'No matches' }),
      );
    }
    for (const group of groups) {
      list.append(renderGroup(group, options));
    }
  }

  container.append(list);
  return container;
}

function renderGroup(group: Group, options: RegionPickerOptions): HTMLElement {
  const groupActive = options.active.has(group.state.id);
  // A search hit or an alert inside the oblast should reveal its raions.
  const open =
    options.openGroups.has(group.state.id) || (options.query.trim().length > 0 && group.districts.length > 0);

  const details = el('details', {
    class: 'region-group',
    'data-active': String(groupActive),
    ...(open ? { open: true } : {}),
  });

  const checkbox = el('input', {
    type: 'checkbox',
    ...(options.selected.has(group.state.id) ? { checked: true } : {}),
    'aria-label': group.state.name,
  });
  on(checkbox, 'change', () => options.onToggle(group.state.id, checkbox.checked));
  // The checkbox lives inside <summary>, whose default click toggles the
  // <details>; stop that so ticking a box does not also collapse the group.
  on(checkbox, 'click', (event) => event.stopPropagation());

  const summary = el('summary', {}, [
    checkbox,
    el('span', { class: 'name', text: group.state.name }),
    groupActive && el('span', { class: 'badge', text: options.language === 'uk' ? 'тривога' : 'alert' }),
  ]);
  details.append(summary);

  on(details, 'toggle', () => options.onGroupToggle(group.state.id, details.open));

  if (group.districts.length > 0) {
    const children = el('div', { class: 'region-children' });
    for (const district of group.districts) {
      children.append(renderDistrict(district, options));
    }
    details.append(children);
  }

  return details;
}

function renderDistrict(district: Region, options: RegionPickerOptions): HTMLElement {
  const checkbox = el('input', {
    type: 'checkbox',
    ...(options.selected.has(district.id) ? { checked: true } : {}),
  });
  on(checkbox, 'change', () => options.onToggle(district.id, checkbox.checked));

  const isActive = options.active.has(district.id);
  return el('label', { class: 'region-row', 'data-active': String(isActive) }, [
    checkbox,
    el('span', { class: 'name', text: district.name }),
    isActive && el('span', { class: 'badge', text: options.language === 'uk' ? 'тривога' : 'alert' }),
  ]);
}

function buildGroups(regions: Region[]): Group[] {
  const groups = new Map<string, Group>();

  for (const region of regions) {
    if (region.level === 'state') {
      const existing = groups.get(region.id);
      if (existing) existing.state = region;
      else groups.set(region.id, { state: region, districts: [] });
    }
  }

  for (const region of regions) {
    if (region.level !== 'district' || !region.parentId) continue;
    groups.get(region.parentId)?.districts.push(region);
  }

  return [...groups.values()];
}

/** Keeps an oblast when it matches, or narrows it to its matching raions. */
function filterGroups(groups: Group[], query: string): Group[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;

  const result: Group[] = [];
  for (const group of groups) {
    if (group.state.name.toLowerCase().includes(needle)) {
      result.push(group);
      continue;
    }
    const districts = group.districts.filter((d) => d.name.toLowerCase().includes(needle));
    if (districts.length > 0) result.push({ state: group.state, districts });
  }
  return result;
}
