import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMoreSevere, mergeLevels, parseAlertLevel, worstLevel } from '../dist/shared/alertLevel.js';

test('levels are parsed case- and whitespace-insensitively', () => {
  assert.equal(parseAlertLevel('red'), 'red');
  assert.equal(parseAlertLevel(' YELLOW '), 'yellow');
  assert.equal(parseAlertLevel('Red'), 'red');
});

test('a missing or unrecognised level reads as unknown', () => {
  for (const value of [null, undefined, '', 'orange', 42, {}]) {
    assert.equal(parseAlertLevel(value), 'unknown');
  }
});

test('red outranks yellow', () => {
  assert.equal(isMoreSevere('red', 'yellow'), true);
  assert.equal(isMoreSevere('yellow', 'red'), false);
});

test('unknown is treated as severe as red, never as mild as yellow', () => {
  // A source that reports no level is still reporting a real alert; ranking it
  // below yellow would understate it in the tray.
  assert.equal(isMoreSevere('yellow', 'unknown'), false);
  assert.equal(worstLevel(['yellow', 'unknown']), 'unknown');
});

test('worstLevel picks the most severe in the set', () => {
  assert.equal(worstLevel(['yellow', 'red']), 'red');
  assert.equal(worstLevel(['yellow', 'yellow']), 'yellow');
  assert.equal(worstLevel(['red']), 'red');
  assert.equal(worstLevel([]), null);
});

test('merging prefers a source that actually reports a level', () => {
  // The whole point: a yellow from alerts.in.ua must not be promoted to red
  // just because the mirror also saw the alert without reporting a level.
  assert.equal(mergeLevels('unknown', 'yellow'), 'yellow');
  assert.equal(mergeLevels('yellow', 'unknown'), 'yellow');
});

test('merging two known levels keeps the more severe one', () => {
  assert.equal(mergeLevels('yellow', 'red'), 'red');
  assert.equal(mergeLevels('red', 'yellow'), 'red');
  assert.equal(mergeLevels('red', 'red'), 'red');
  assert.equal(mergeLevels('unknown', 'unknown'), 'unknown');
});
