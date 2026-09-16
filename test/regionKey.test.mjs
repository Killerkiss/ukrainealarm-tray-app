import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ancestorKeys,
  migrateLegacyRegionId,
  normalizeName,
  parentKeyOf,
  regionKey,
} from '../dist/shared/regionKey.js';

test('administrative suffixes are stripped per level', () => {
  assert.equal(normalizeName('Вінницька область', 'state'), 'вінницька');
  assert.equal(normalizeName('Вінницький район', 'district'), 'вінницький');
  assert.equal(normalizeName('Іллінецька міська громада', 'community'), 'іллінецька');
  assert.equal(normalizeName('Іллінецька територіальна громада', 'community'), 'іллінецька');
  assert.equal(normalizeName('Іллінецька міська територіальна громада', 'community'), 'іллінецька');
});

test('a source that omits the suffix produces the same key', () => {
  // The mirror says "Вінницька область"; the official API may say "Вінницька".
  assert.equal(normalizeName('Вінницька', 'state'), normalizeName('Вінницька область', 'state'));
  assert.equal(normalizeName('Вінницький', 'district'), normalizeName('Вінницький район', 'district'));
});

test('city markers and apostrophe variants are unified', () => {
  assert.equal(normalizeName('м. Київ', 'state'), normalizeName('Київ', 'state'));
  assert.equal(normalizeName('м.Київ', 'state'), normalizeName('Київ', 'state'));
  assert.equal(
    normalizeName('Кам’янець-Подільський район', 'district'),
    normalizeName("Кам'янець-Подільський район", 'district'),
  );
});

test('known spelling differences collapse onto one key', () => {
  const viaShort = normalizeName('АР Крим', 'state');
  const viaLong = normalizeName('Автономна Республіка Крим', 'state');
  assert.equal(viaShort, viaLong);
});

test('Kyiv the city and Kyiv oblast stay distinct', () => {
  assert.notEqual(regionKey('state', 'м. Київ'), regionKey('state', 'Київська область'));
});

test('a suffix is never stripped down to an empty segment', () => {
  assert.equal(normalizeName('Громада', 'community'), 'громада');
  assert.equal(normalizeName('Область', 'state'), 'область');
});

test('keys encode their own ancestry', () => {
  const oblast = regionKey('state', 'Вінницька область');
  const raion = regionKey('district', 'Вінницький район', oblast);
  const hromada = regionKey('community', 'Іллінецька міська громада', raion);

  assert.equal(oblast, 'ua:вінницька');
  assert.equal(raion, 'ua:вінницька/вінницький');
  assert.equal(hromada, 'ua:вінницька/вінницький/іллінецька');

  assert.equal(parentKeyOf(hromada), raion);
  assert.equal(parentKeyOf(oblast), undefined);
  assert.deepEqual(ancestorKeys(hromada), [raion, oblast]);
});

test('v0.1 provider-scoped ids are migrated, not dropped', () => {
  assert.equal(migrateLegacyRegionId('free:Київська область'), 'ua:київська');
  assert.equal(
    migrateLegacyRegionId('free:Вінницька область/Вінницький район'),
    'ua:вінницька/вінницький',
  );
});

test('an already-canonical key migrates to itself', () => {
  assert.equal(migrateLegacyRegionId('ua:вінницька'), 'ua:вінницька');
});

test('an unresolvable numeric id is dropped rather than kept dead', () => {
  assert.equal(migrateLegacyRegionId('1234'), null);
});

test('the city marker never eats the leading letter of an М- name', () => {
  // Regression: `^м\.?\s*` made both the dot and the space optional, so
  // "Миколаївська область" normalised to "иколаївська".
  assert.equal(normalizeName('Миколаївська область', 'state'), 'миколаївська');
  assert.equal(normalizeName('Могилів-Подільський район', 'district'), 'могилів-подільський');
  assert.equal(normalizeName('Мукачівська міська громада', 'community'), 'мукачівська');
  assert.equal(regionKey('state', 'Миколаївська область'), 'ua:миколаївська');
});

test('genuine city markers are still stripped', () => {
  assert.equal(normalizeName('м. Київ', 'state'), normalizeName('Київ', 'state'));
  assert.equal(normalizeName('м.Київ', 'state'), normalizeName('Київ', 'state'));
  assert.equal(normalizeName('м Київ', 'state'), normalizeName('Київ', 'state'));
  assert.equal(normalizeName('місто Київ', 'state'), normalizeName('Київ', 'state'));
});

test('oblasts sort in Ukrainian alphabetical order', () => {
  const names = ['Миколаївська область', 'Івано-Франківська область', 'Запорізька область'];
  const sorted = names
    .map((name) => ({ name, id: regionKey('state', name) }))
    .sort((a, b) => a.id.localeCompare(b.id, 'uk'))
    .map((entry) => entry.name);
  assert.deepEqual(sorted, [
    'Запорізька область',
    'Івано-Франківська область',
    'Миколаївська область',
  ]);
});
