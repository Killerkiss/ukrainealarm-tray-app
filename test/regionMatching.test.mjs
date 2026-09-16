import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertConcernsUser, ancestorsOf, buildRegionIndex } from '../dist/main/alerts/regionMatching.js';

const REGIONS = [
  { id: 'kyiv-oblast', name: 'Київська область', level: 'state' },
  { id: 'brovary', name: 'Броварський район', level: 'district', parentId: 'kyiv-oblast' },
  { id: 'bucha', name: 'Бучанський район', level: 'district', parentId: 'kyiv-oblast' },
  { id: 'lviv-oblast', name: 'Львівська область', level: 'state' },
];

const index = buildRegionIndex(REGIONS);

test('an alert on the exact selected region matches', () => {
  assert.equal(alertConcernsUser('brovary', new Set(['brovary']), index), true);
});

test('an alert on a raion matches a user subscribed to the whole oblast', () => {
  assert.equal(alertConcernsUser('brovary', new Set(['kyiv-oblast']), index), true);
});

test('an oblast-wide alert reaches a user subscribed to one raion inside it', () => {
  assert.equal(alertConcernsUser('kyiv-oblast', new Set(['bucha']), index), true);
});

test('unrelated regions do not match', () => {
  assert.equal(alertConcernsUser('lviv-oblast', new Set(['brovary']), index), false);
  assert.equal(alertConcernsUser('brovary', new Set(['bucha']), index), false);
});

test('an empty selection matches nothing', () => {
  assert.equal(alertConcernsUser('kyiv-oblast', new Set(), index), false);
});

test('an unknown region id is handled without throwing', () => {
  assert.equal(alertConcernsUser('does-not-exist', new Set(['kyiv-oblast']), index), false);
});

test('ancestorsOf survives a parent cycle in malformed data', () => {
  const cyclic = buildRegionIndex([
    { id: 'a', name: 'A', level: 'state', parentId: 'b' },
    { id: 'b', name: 'B', level: 'state', parentId: 'a' },
  ]);
  assert.deepEqual(ancestorsOf('a', cyclic), ['b']);
});
