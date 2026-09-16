import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertLevelLabel,
  alertTypeLabel,
  formatDateTime,
  formatDuration,
  formatTime,
  localTimeZone,
  t,
  threatLabel,
} from '../dist/shared/i18n.js';

const NOW = Date.parse('2026-09-16T12:00:00Z');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

test('sub-minute durations read as "just now"', () => {
  assert.equal(formatDuration('en', ago(0), NOW), 'just now');
  assert.equal(formatDuration('uk', ago(0.5), NOW), 'щойно');
});

test('minutes, hours and days each use the two most significant units', () => {
  assert.equal(formatDuration('en', ago(20), NOW), '20 min');
  assert.equal(formatDuration('en', ago(185), NOW), '3 h 5 min');
  assert.equal(formatDuration('en', ago(120), NOW), '2 h');
  assert.equal(formatDuration('en', ago(1440), NOW), '1 d');
  assert.equal(formatDuration('en', ago(1440 + 120 + 30), NOW), '1 d 2 h');
});

test('multi-year alerts stay readable instead of showing five-digit hours', () => {
  const since = new Date('2022-12-10T22:22:00Z').toISOString();
  const formatted = formatDuration('uk', since, NOW);
  assert.match(formatted, /^\d+ д( \d+ год)?$/);
  assert.ok(!formatted.includes('хв'));
});

test('an unparseable timestamp degrades instead of printing NaN', () => {
  assert.equal(formatDuration('en', 'not-a-date', NOW), 'just now');
});

test('a future timestamp does not produce a negative duration', () => {
  assert.equal(formatDuration('en', new Date(NOW + 60_000).toISOString(), NOW), 'just now');
});

test('a null last-updated time reads as "never"', () => {
  assert.equal(formatTime('en', null), 'never');
});

test('both languages cover every alert type, threat type and level', () => {
  const alertTypes = ['air_raid', 'artillery', 'urban_fights', 'chemical', 'nuclear', 'unknown'];
  const threatTypes = [
    'tactic_aircraft_activity',
    'strategic_aircraft_activity',
    'mig31k_departure',
    'ballistic_missiles',
    'cruise_missiles',
    'unspecified_missiles',
    'drones',
    'guided_aerial_bombs',
    'air_defense',
    'unknown',
  ];

  for (const lang of ['uk', 'en']) {
    for (const type of alertTypes) {
      assert.ok(alertTypeLabel(lang, type)?.length > 0, `${lang}/${type}`);
    }
    for (const threat of threatTypes) {
      assert.ok(threatLabel(lang, threat)?.length > 0, `${lang}/${threat}`);
    }
    for (const level of ['red', 'yellow', 'unknown']) {
      assert.ok(alertLevelLabel(lang, level)?.length > 0, `${lang}/${level}`);
    }
    assert.ok(t(lang, 'statusAlertRed').length > 0);
    assert.ok(t(lang, 'statusAlertYellow').length > 0);
  }
});

test('neither language is missing a string the other has', () => {
  // Catches a key added to one dictionary but not the other, which would
  // otherwise surface as `undefined` in the UI only for that language.
  const keys = ['statusAlertRed', 'statusAlertYellow', 'startedAt', 'timezoneNote', 'levelRed',
    'levelYellow', 'levelUnknown', 'threats', 'alertsOnly', 'sourceAlertsInUa', 'sourceOfficial',
    'tabRegions', 'tabSources', 'tabAlerts', 'tabAppearance', 'precision', 'matchParent', 'health'];

  // Brand names are intentionally identical in both dictionaries.
  const properNouns = new Set(['sourceAlertsInUa', 'sourceOfficial']);

  for (const key of keys) {
    for (const lang of ['uk', 'en']) {
      assert.equal(typeof t(lang, key), 'string', `${lang} is missing "${key}"`);
      assert.ok(t(lang, key).length > 0, `${lang}/${key} is empty`);
    }
    if (!properNouns.has(key)) {
      assert.notEqual(t('uk', key), t('en', key), `"${key}" is untranslated`);
    }
  }
});

test('alert start times render in the local timezone with an explicit zone name', () => {
  const formatted = formatDateTime('uk', '2026-09-16T06:14:31.265Z');
  // Format is DD.MM.YYYY, HH:MM — an absolute time, not a relative one.
  assert.match(formatted, /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  assert.ok(localTimeZone().length > 0);
});

test('an unparseable or missing start time does not render as NaN', () => {
  assert.equal(formatDateTime('en', null), 'never');
  assert.equal(formatDateTime('en', 'not-a-date'), 'never');
});
