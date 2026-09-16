import type { AlertLevel } from './types';

/**
 * Ranks levels so the tray can show the worst thing currently happening.
 *
 * `unknown` sits alongside `red` rather than below `yellow`: a source that does
 * not report levels is still reporting a real alert, and showing that as the
 * milder yellow would understate it.
 */
const SEVERITY: Record<AlertLevel, number> = {
  red: 2,
  unknown: 2,
  yellow: 1,
};

export function isMoreSevere(candidate: AlertLevel, current: AlertLevel): boolean {
  return SEVERITY[candidate] > SEVERITY[current];
}

/** The worst level in a set, or null when there is nothing to rank. */
export function worstLevel(levels: AlertLevel[]): AlertLevel | null {
  let worst: AlertLevel | null = null;
  for (const level of levels) {
    if (worst === null || isMoreSevere(level, worst)) worst = level;
  }
  return worst;
}

/**
 * Picks the level to keep when two sources describe the same alert.
 *
 * A source that actually reports a level beats one that does not, so a
 * `yellow` from alerts.in.ua is not silently promoted to red just because
 * another feed reported the same alert without a level.
 */
export function mergeLevels(a: AlertLevel, b: AlertLevel): AlertLevel {
  if (a === b) return a;
  if (a === 'unknown') return b;
  if (b === 'unknown') return a;
  return isMoreSevere(a, b) ? a : b;
}

export function parseAlertLevel(raw: unknown): AlertLevel {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'red') return 'red';
  if (value === 'yellow') return 'yellow';
  return 'unknown';
}
