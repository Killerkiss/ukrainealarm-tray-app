/**
 * Canonical, provider-independent region identity.
 *
 * Each data source numbers its regions differently: the public mirror keys them
 * by Ukrainian name, the official API by opaque numeric id. To run both sources
 * at once and merge their alerts, a region needs one identity that does not
 * belong to either of them. That identity is derived from the place name, since
 * both sources use the same official Ukrainian names.
 *
 * Keys look like `ua:вінницька/вінницький/іллінецька` — one segment per level,
 * so a key also encodes its own ancestry.
 */

export type RegionLevel = 'state' | 'district' | 'community';

const KEY_PREFIX = 'ua:';

/** Every apostrophe variant that shows up in Ukrainian place names. */
const APOSTROPHES = /[’ʼ'`´]/g;

/** Administrative suffixes that carry no distinguishing information. */
const SUFFIXES: Record<RegionLevel, RegExp[]> = {
  state: [/\s+обл(асть|\.)?$/],
  district: [/\s+район$/, /\s+р-н\.?$/],
  community: [
    /\s+(міська|селищна|сільська)\s+територіальна\s+громада$/,
    /\s+територіальна\s+громада$/,
    /\s+(міська|селищна|сільська)\s+громада$/,
    /\s+громада$/,
    /\s+тг$/,
  ],
};

/**
 * Names the two sources spell differently. Keyed by the already-normalised
 * form, so every spelling collapses onto one canonical segment.
 */
const ALIASES = new Map<string, string>([
  ['ар крим', 'крим'],
  ['автономна республіка крим', 'крим'],
  ['республіка крим', 'крим'],
  ['київ', 'київ-місто'],
  ['києва', 'київ-місто'],
  ['київська міська', 'київ-місто'],
  ['севастополь', 'севастополь-місто'],
  ['севастополя', 'севастополь-місто'],
]);

/**
 * Lower-cases, unifies apostrophes and dashes, drops the `м.` city marker and
 * the administrative suffix for the given level, and collapses whitespace.
 */
export function normalizeName(raw: string, level: RegionLevel): string {
  let value = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // `м. Київ`, `м.Київ`, `м Київ` and `місто Київ` all name the same place.
  // The dot or the space is required: without one, this would eat the leading
  // letter of every name beginning with М, turning `Миколаївська` into
  // `иколаївська`.
  value = value
    .replace(/^м\.\s*/, '')
    .replace(/^м\s+/, '')
    .replace(/^місто\s+/, '');

  for (const suffix of SUFFIXES[level]) {
    const stripped = value.replace(suffix, '');
    // Never strip a suffix down to nothing: `Громада` alone must stay itself.
    if (stripped.trim().length > 0 && stripped !== value) {
      value = stripped.trim();
      break;
    }
  }

  value = value.replace(/\s+/g, ' ').trim();
  return ALIASES.get(value) ?? value;
}

/**
 * Builds a region's canonical key.
 *
 * `parentKey` must be the already-canonical key of the enclosing region, which
 * makes keys stable regardless of how deeply a provider nests its tree.
 */
export function regionKey(level: RegionLevel, name: string, parentKey?: string): string {
  const segment = normalizeName(name, level);
  if (!parentKey) return `${KEY_PREFIX}${segment}`;
  return `${parentKey}/${segment}`;
}

/** The key of the region one level up, or undefined for an oblast. */
export function parentKeyOf(key: string): string | undefined {
  const index = key.lastIndexOf('/');
  return index === -1 ? undefined : key.slice(0, index);
}

/** Every ancestor key, nearest first. Derived from the key itself. */
export function ancestorKeys(key: string): string[] {
  const ancestors: string[] = [];
  let current = parentKeyOf(key);
  while (current) {
    ancestors.push(current);
    current = parentKeyOf(current);
  }
  return ancestors;
}

export function isRegionKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length;
}

/**
 * Upgrades a region id stored by an older version.
 *
 * v0.1 keyed regions by provider: `free:Вінницька область/Вінницький район`.
 * Those selections are rewritten rather than dropped, so nobody loses their
 * setup on upgrade.
 */
export function migrateLegacyRegionId(id: string): string | null {
  if (isRegionKey(id)) return id;

  if (id.startsWith('free:')) {
    const [state, district] = id.slice('free:'.length).split('/');
    if (!state) return null;
    const stateKey = regionKey('state', state);
    return district ? regionKey('district', district, stateKey) : stateKey;
  }

  // Numeric ids came from the official API and cannot be resolved to a name
  // without calling it; dropping them is better than keeping a dead id.
  return null;
}
