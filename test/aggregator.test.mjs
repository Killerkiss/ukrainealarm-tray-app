import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderAggregator } from '../dist/main/alerts/aggregator.js';

/** Collects log lines so tests can assert each failure is reported separately. */
function recorder() {
  const lines = [];
  return { lines, error: (message) => lines.push(message) };
}

/** Replaces the aggregator's real providers with scripted stubs. */
function withProviders(aggregator, providers) {
  aggregator.providers = providers;
  aggregator.status = new Map(
    providers.map((p) => [p.id, { id: p.id, ok: false, error: null, alertCount: 0, lastSuccess: null }]),
  );
  return aggregator;
}

function stub(id, { regions = [], alerts = [], fail = null }) {
  return {
    id,
    fetchRegions: async () => {
      if (fail) throw new Error(fail);
      return regions;
    },
    fetchAlerts: async () => {
      if (fail) throw new Error(fail);
      return alerts;
    },
  };
}

const KYIV = 'ua:київська';
const build = (providers) =>
  withProviders(new ProviderAggregator({ providers: [], apiKey: '' }), providers);

test('the same alert from two sources merges into one entry naming both', async () => {
  const aggregator = build([
    stub('free', { alerts: [{ regionId: KYIV, regionName: 'Київська область', type: 'air_raid', since: '2026-09-16T10:00:00Z', sources: ['free'] }] }),
    stub('ukrainealarm', { alerts: [{ regionId: KYIV, regionName: 'Київська область', type: 'air_raid', since: '2026-09-16T10:02:00Z', sources: ['ukrainealarm'] }] }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, recorder());
  assert.equal(result.alerts.length, 1);
  assert.deepEqual(result.alerts[0].sources.sort(), ['free', 'ukrainealarm']);
});

test('whichever source reports the earlier start time wins', async () => {
  const aggregator = build([
    stub('free', { alerts: [{ regionId: KYIV, regionName: 'K', type: 'air_raid', since: '2026-09-16T10:05:00Z', sources: ['free'] }] }),
    stub('ukrainealarm', { alerts: [{ regionId: KYIV, regionName: 'K', type: 'air_raid', since: '2026-09-16T10:00:00Z', sources: ['ukrainealarm'] }] }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, recorder());
  assert.equal(result.alerts[0].since, '2026-09-16T10:00:00Z');
});

test('an alert only one source can see is still raised', async () => {
  const aggregator = build([
    stub('free', { alerts: [] }),
    stub('ukrainealarm', { alerts: [{ regionId: KYIV, regionName: 'K', type: 'artillery', sources: ['ukrainealarm'] }] }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, recorder());
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].type, 'artillery');
});

test('one source failing does not hide what the other can see', async () => {
  const log = recorder();
  const aggregator = build([
    stub('free', { alerts: [{ regionId: KYIV, regionName: 'K', type: 'air_raid', sources: ['free'] }] }),
    stub('ukrainealarm', { fail: 'API key rejected (HTTP 401)' }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, log);
  assert.equal(result.allFailed, false);
  assert.equal(result.alerts.length, 1);

  const failed = result.sources.find((s) => s.id === 'ukrainealarm');
  assert.equal(failed.ok, false);
  assert.match(failed.error, /401/);
  // Each failure is logged individually, naming the source that failed.
  assert.equal(log.lines.length, 1);
  assert.match(log.lines[0], /ukrainealarm/);
});

test('every source failing is reported as such, and each is logged separately', async () => {
  const log = recorder();
  const aggregator = build([
    stub('free', { fail: 'Network request failed' }),
    stub('ukrainealarm', { fail: 'Request timed out' }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, log);
  assert.equal(result.allFailed, true);
  assert.equal(result.alerts.length, 0);
  assert.equal(log.lines.length, 2);
});

test('regions seen by both sources appear once, listing both', async () => {
  const aggregator = build([
    stub('free', { regions: [{ id: KYIV, name: 'Київська область', level: 'state', sources: ['free'] }] }),
    stub('ukrainealarm', { regions: [{ id: KYIV, name: 'Київська', level: 'state', sources: ['ukrainealarm'] }] }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, recorder());
  assert.equal(result.regions.length, 1);
  assert.deepEqual(result.regions[0].sources.sort(), ['free', 'ukrainealarm']);
});

test('a region only the official API knows about is still offered', async () => {
  const hromada = 'ua:київська/бучанський/бучанська';
  const aggregator = build([
    stub('free', { regions: [{ id: KYIV, name: 'Київська область', level: 'state', sources: ['free'] }] }),
    stub('ukrainealarm', { regions: [{ id: hromada, name: 'Бучанська громада', level: 'community', parentId: 'ua:київська/бучанський', sources: ['ukrainealarm'] }] }),
  ]);

  const result = await aggregator.fetchAll(new AbortController().signal, recorder());
  assert.equal(result.regions.length, 2);
  assert.ok(result.regions.some((r) => r.id === hromada));
});
