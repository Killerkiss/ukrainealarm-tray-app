import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../dist/shared/settingsSchema.js';
import { DEFAULT_SETTINGS } from '../dist/shared/types.js';

test('an empty object falls back to every default', () => {
  assert.deepEqual(sanitize({}), DEFAULT_SETTINGS);
});

test('garbage input does not throw and yields defaults', () => {
  assert.deepEqual(sanitize(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitize('nonsense'), DEFAULT_SETTINGS);
  assert.deepEqual(sanitize(42), DEFAULT_SETTINGS);
});

test('the poll interval is clamped into the allowed range', () => {
  assert.equal(sanitize({ pollIntervalSec: 1 }).pollIntervalSec, 15);
  assert.equal(sanitize({ pollIntervalSec: 99_999 }).pollIntervalSec, 600);
  assert.equal(sanitize({ pollIntervalSec: 'fast' }).pollIntervalSec, DEFAULT_SETTINGS.pollIntervalSec);
  assert.equal(sanitize({ pollIntervalSec: 45 }).pollIntervalSec, 45);
});

test('volume is clamped to 0..1', () => {
  assert.equal(sanitize({ soundVolume: -3 }).soundVolume, 0);
  assert.equal(sanitize({ soundVolume: 9 }).soundVolume, 1);
});

test('an unknown provider or language falls back to the default', () => {
  assert.equal(sanitize({ provider: 'hackers' }).provider, 'free');
  assert.equal(sanitize({ language: 'de' }).language, 'uk');
});

test('region ids are de-duplicated and non-strings dropped', () => {
  assert.deepEqual(sanitize({ regions: ['a', 'a', 'b', 7, null] }).regions, ['a', 'b']);
});

test('valid settings survive a round trip unchanged', () => {
  const settings = { ...DEFAULT_SETTINGS, regions: ['x'], provider: 'ukrainealarm', apiKey: 'k' };
  assert.deepEqual(sanitize(settings), settings);
});
