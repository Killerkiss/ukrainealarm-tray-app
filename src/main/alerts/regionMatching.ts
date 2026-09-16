import { ancestorKeys } from '../../shared/regionKey';
import type { Region } from '../../shared/types';

export type RegionIndex = Map<string, Region>;

export function buildRegionIndex(regions: Region[]): RegionIndex {
  return new Map(regions.map((region) => [region.id, region]));
}

/**
 * Walks the parent chain. Canonical keys encode their own ancestry, so this
 * works even for a region the provider never listed.
 */
export function ancestorsOf(regionId: string, index: RegionIndex): string[] {
  const declared = index.get(regionId)?.parentId;
  const fromKey = ancestorKeys(regionId);
  if (fromKey.length > 0) return fromKey;
  return declared ? [declared] : [];
}

export interface MatchOptions {
  /**
   * Whether an alert covering an enclosing region (typically the whole oblast)
   * counts for someone subscribed to a smaller place inside it.
   */
  matchParentAlerts: boolean;
}

/**
 * Decides whether an alert concerns the user.
 *
 * Downward coverage is unconditional: if you subscribe to an oblast you want to
 * hear about anything inside it. Upward coverage is the configurable half —
 * most Ukrainian alerts are declared oblast-wide, so someone who only cares
 * about their own city can switch it off and stop hearing about the rest of the
 * oblast.
 */
export function alertConcernsUser(
  alertRegionId: string,
  selectedIds: ReadonlySet<string>,
  index: RegionIndex,
  options: MatchOptions = { matchParentAlerts: true },
): boolean {
  if (selectedIds.has(alertRegionId)) return true;

  // The alert sits inside a region the user selected.
  if (ancestorsOf(alertRegionId, index).some((id) => selectedIds.has(id))) return true;

  if (!options.matchParentAlerts) return false;

  // The alert covers a whole oblast and the user selected a place within it.
  for (const selectedId of selectedIds) {
    if (ancestorsOf(selectedId, index).includes(alertRegionId)) return true;
  }
  return false;
}
