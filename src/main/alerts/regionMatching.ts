import type { Region } from '../../shared/types';

export type RegionIndex = Map<string, Region>;

export function buildRegionIndex(regions: Region[]): RegionIndex {
  return new Map(regions.map((region) => [region.id, region]));
}

/** Walks the parent chain, guarding against cycles in malformed provider data. */
export function ancestorsOf(regionId: string, index: RegionIndex): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([regionId]);

  let current = index.get(regionId)?.parentId;
  while (current && !seen.has(current)) {
    ancestors.push(current);
    seen.add(current);
    current = index.get(current)?.parentId;
  }
  return ancestors;
}

/**
 * Decides whether an alert concerns the user.
 *
 * Coverage runs both ways on purpose: an alert on an oblast reaches someone who
 * subscribed to a single raion inside it, and an alert on one raion is relevant
 * to someone who subscribed to the whole oblast.
 */
export function alertConcernsUser(
  alertRegionId: string,
  selectedIds: ReadonlySet<string>,
  index: RegionIndex,
): boolean {
  if (selectedIds.has(alertRegionId)) return true;

  // The alert sits inside a region the user selected.
  if (ancestorsOf(alertRegionId, index).some((id) => selectedIds.has(id))) return true;

  // The alert covers a whole oblast and the user selected a raion within it.
  for (const selectedId of selectedIds) {
    if (ancestorsOf(selectedId, index).includes(alertRegionId)) return true;
  }
  return false;
}
