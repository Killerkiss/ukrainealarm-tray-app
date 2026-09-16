import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatTime, alertTypeLabel, t } from '../dist/shared/i18n.js';

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

test('both languages cover every alert type and string key', () => {
  for (const lang of ['uk', 'en']) {
    for (const type of ['air_raid', 'artillery', 'urban_fights', 'chemical', 'nuclear', 'unknown']) {
      assert.equal(typeof alertTypeLabel(lang, type), 'string');
      assert.ok(alertTypeLabel(lang, type).length > 0);
    }
    assert.ok(t(lang, 'statusAlert').length > 0);
  }
});
