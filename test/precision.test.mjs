import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertConcernsUser, buildRegionIndex } from '../dist/main/alerts/regionMatching.js';
import { regionKey } from '../dist/shared/regionKey.js';

const OBLAST = regionKey('state', 'Дніпропетровська область');
const MY_RAION = regionKey('district', 'Криворізький район', OBLAST);
const OTHER_RAION = regionKey('district', 'Павлоградський район', OBLAST);
const MY_CITY = regionKey('community', 'Криворізька міська громада', MY_RAION);

const index = buildRegionIndex([
  { id: OBLAST, name: 'Дніпропетровська область', level: 'state', sources: ['free'] },
  { id: MY_RAION, name: 'Криворізький район', level: 'district', parentId: OBLAST, sources: ['free'] },
  { id: OTHER_RAION, name: 'Павлоградський район', level: 'district', parentId: OBLAST, sources: ['free'] },
  { id: MY_CITY, name: 'Криворізька міська громада', level: 'community', parentId: MY_RAION, sources: ['ukrainealarm'] },
]);

const LOOSE = { matchParentAlerts: true };
const STRICT = { matchParentAlerts: false };

test('strict mode ignores an oblast-wide alert when only my city is selected', () => {
  const selected = new Set([MY_CITY]);
  assert.equal(alertConcernsUser(OBLAST, selected, index, LOOSE), true);
  assert.equal(alertConcernsUser(OBLAST, selected, index, STRICT), false);
});

test('strict mode still alerts when my own city is the one under alert', () => {
  const selected = new Set([MY_CITY]);
  assert.equal(alertConcernsUser(MY_CITY, selected, index, STRICT), true);
});

test('a neighbouring raion never alerts me, in either mode', () => {
  const selected = new Set([MY_RAION]);
  assert.equal(alertConcernsUser(OTHER_RAION, selected, index, LOOSE), false);
  assert.equal(alertConcernsUser(OTHER_RAION, selected, index, STRICT), false);
});

test('downward coverage is unconditional: selecting the oblast catches everything inside', () => {
  const selected = new Set([OBLAST]);
  for (const options of [LOOSE, STRICT]) {
    assert.equal(alertConcernsUser(MY_RAION, selected, index, options), true);
    assert.equal(alertConcernsUser(MY_CITY, selected, index, options), true);
    assert.equal(alertConcernsUser(OTHER_RAION, selected, index, options), true);
  }
});

test('strict mode ignores my raion alerting when I only selected my city', () => {
  const selected = new Set([MY_CITY]);
  assert.equal(alertConcernsUser(MY_RAION, selected, index, LOOSE), true);
  assert.equal(alertConcernsUser(MY_RAION, selected, index, STRICT), false);
});

test('matching works for a region the sources never listed, via the key path', () => {
  const unlisted = regionKey('community', 'Нікопольська міська громада', OTHER_RAION);
  assert.equal(alertConcernsUser(unlisted, new Set([OBLAST]), index, STRICT), true);
});
