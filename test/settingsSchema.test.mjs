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
  assert.deepEqual(sanitize({ providers: ['hackers'] }).providers, ['free']);
  assert.equal(sanitize({ language: 'de' }).language, 'uk');
});

test('unknown providers are filtered out but valid ones are kept', () => {
  assert.deepEqual(sanitize({ providers: ['hackers', 'ukrainealarm'] }).providers, ['ukrainealarm']);
});

test('both sources can be enabled at once', () => {
  const settings = sanitize({ providers: ['free', 'ukrainealarm'] });
  assert.deepEqual(settings.providers, ['free', 'ukrainealarm']);
});

test('duplicate providers are collapsed', () => {
  assert.deepEqual(sanitize({ providers: ['free', 'free'] }).providers, ['free']);
});

test('an empty source list falls back to the default rather than polling nothing', () => {
  assert.deepEqual(sanitize({ providers: [] }).providers, ['free']);
});

test('the v0.1 single `provider` field is upgraded to a source list', () => {
  assert.deepEqual(sanitize({ provider: 'ukrainealarm' }).providers, ['ukrainealarm']);
  assert.deepEqual(sanitize({ provider: 'free' }).providers, ['free']);
});

test('v0.1 provider-scoped region ids are migrated, not silently lost', () => {
  const settings = sanitize({
    provider: 'free',
    regions: ['free:Київська область', 'free:Вінницька область/Вінницький район'],
  });
  assert.deepEqual(settings.regions, ['ua:київська', 'ua:вінницька/вінницький']);
});

test('region ids are de-duplicated and unusable entries dropped', () => {
  const regions = sanitize({
    regions: ['ua:київська', 'ua:київська', 'free:Львівська область', 7, null, 'garbage'],
  }).regions;
  assert.deepEqual(regions, ['ua:київська', 'ua:львівська']);
});

test('matchParentAlerts defaults on and accepts an explicit false', () => {
  assert.equal(sanitize({}).matchParentAlerts, true);
  assert.equal(sanitize({ matchParentAlerts: false }).matchParentAlerts, false);
  assert.equal(sanitize({ matchParentAlerts: 'no' }).matchParentAlerts, true);
});

test('valid settings survive a round trip unchanged', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    regions: ['ua:київська'],
    providers: ['free', 'ukrainealarm'],
    apiKey: 'k',
    matchParentAlerts: false,
  };
  assert.deepEqual(sanitize(settings), settings);
});
