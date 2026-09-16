import { el, on } from './dom';
import type { Language, Region } from '../shared/types';

export interface RegionPickerOptions {
  regions: Region[];
  selected: Set<string>;
  /** Region ids currently under alert, highlighted in the list. */
  active: Set<string>;
  loading: boolean;
  error: string | null;
  query: string;
  openGroups: Set<string>;
  language: Language;
  onToggle(id: string, checked: boolean): void;
  onQueryChange(query: string): void;
  onGroupToggle(id: string, open: boolean): void;
  onClear(): void;
}

interface Node {
  region: Region;
  children: Node[];
}

/**
 * Nested oblast → raion → hromada picker.
 *
 * Selecting a region covers everything inside it, so a parent checkbox is not a
 * "tick all children" shortcut — it is a subscription in its own right. Whether
 * a *parent's* alert reaches a child subscription is the separate precision
 * setting on the Regions tab.
 */
export function renderRegionPicker(options: RegionPickerOptions): HTMLElement {
  const container = el('div');
  const uk = options.language === 'uk';

  const search = el('input', {
    type: 'search',
    placeholder: uk ? 'Пошук області, району або громади…' : 'Search oblast, raion or hromada…',
    value: options.query,
    'aria-label': uk ? 'Пошук регіону' : 'Search region',
  });
  on(search, 'input', () => options.onQueryChange(search.value));

  const clearButton = el('button', {
    type: 'button',
    text: uk ? 'Зняти все' : 'Clear all',
    ...(options.selected.size === 0 ? { disabled: true } : {}),
  });
  on(clearButton, 'click', () => options.onClear());

  container.append(el('div', { class: 'region-toolbar' }, [search, clearButton]));

  const list = el('div', { class: 'region-list', id: 'region-list' });

  if (options.error) {
    list.append(el('p', { class: 'empty', text: options.error }));
  } else if (options.loading && options.regions.length === 0) {
    list.append(el('p', { class: 'empty', text: uk ? 'Завантаження…' : 'Loading…' }));
  } else {
    const roots = filterNodes(buildTree(options.regions), options.query);
    if (roots.length === 0) {
      list.append(el('p', { class: 'empty', text: uk ? 'Нічого не знайдено' : 'No matches' }));
    }
    for (const node of roots) list.append(renderNode(node, options, 0));
  }

  container.append(list);
  return container;
}

function renderNode(node: Node, options: RegionPickerOptions, depth: number): HTMLElement {
  const isActive = options.active.has(node.region.id);

  // A leaf has nothing to expand, so it renders as a plain row.
  if (node.children.length === 0) {
    return renderLeaf(node.region, options, depth);
  }

  const open =
    options.openGroups.has(node.region.id) || options.query.trim().length > 0;

  const details = el('details', {
    class: 'region-group',
    'data-active': String(isActive),
    ...(open ? { open: true } : {}),
  });

  const checkbox = el('input', {
    type: 'checkbox',
    ...(options.selected.has(node.region.id) ? { checked: true } : {}),
    'aria-label': node.region.name,
  });
  on(checkbox, 'change', () => options.onToggle(node.region.id, checkbox.checked));
  // The checkbox lives inside <summary>, whose default click toggles the
  // <details>; stop that so ticking a box does not also collapse the group.
  on(checkbox, 'click', (event) => event.stopPropagation());

  details.append(
    el('summary', { style: depth > 0 ? `padding-left:${10 + depth * 16}px` : false }, [
      checkbox,
      el('span', { class: 'name', text: node.region.name }),
      isActive
        ? el('span', { class: 'badge', text: options.language === 'uk' ? 'тривога' : 'alert' })
        : null,
    ]),
  );

  on(details, 'toggle', () => options.onGroupToggle(node.region.id, details.open));

  const children = el('div', {
    class: 'region-children',
    style: `padding-left:${34 + depth * 16}px`,
  });
  for (const child of node.children) children.append(renderNode(child, options, depth + 1));
  details.append(children);

  return details;
}

function renderLeaf(region: Region, options: RegionPickerOptions, depth: number): HTMLElement {
  const checkbox = el('input', {
    type: 'checkbox',
    ...(options.selected.has(region.id) ? { checked: true } : {}),
  });
  on(checkbox, 'change', () => options.onToggle(region.id, checkbox.checked));

  const isActive = options.active.has(region.id);
  return el(
    'label',
    {
      class: 'region-row',
      'data-active': String(isActive),
      style: depth > 1 ? `padding-left:${(depth - 1) * 16}px` : false,
    },
    [
      checkbox,
      el('span', { class: 'name', text: region.name }),
      // Only the official API knows hromadas; say so rather than let the user
      // wonder why a city vanished when they turned that source off.
      region.sources.length === 1 && region.sources[0] === 'ukrainealarm'
        ? el('span', { class: 'source-tag', text: 'api' })
        : null,
      isActive
        ? el('span', { class: 'badge', text: options.language === 'uk' ? 'тривога' : 'alert' })
        : null,
    ],
  );
}

/** Builds the region forest from the flat list, at any depth. */
function buildTree(regions: Region[]): Node[] {
  const nodes = new Map<string, Node>();
  for (const region of regions) nodes.set(region.id, { region, children: [] });

  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = node.region.parentId ? nodes.get(node.region.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Keeps a node when it matches, or narrows it to its matching descendants, so a
 * search for a city surfaces it with its oblast and raion still around it.
 */
function filterNodes(nodes: Node[], query: string): Node[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;

  const result: Node[] = [];
  for (const node of nodes) {
    if (node.region.name.toLowerCase().includes(needle)) {
      result.push(node);
      continue;
    }
    const children = filterNodes(node.children, query);
    if (children.length > 0) result.push({ region: node.region, children });
  }
  return result;
}
