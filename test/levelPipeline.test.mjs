import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FreeMirrorProvider } from '../dist/main/alerts/freeProvider.js';
import { ProviderAggregator } from '../dist/main/alerts/aggregator.js';

const signal = () => new AbortController().signal;

function withFetch(body, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('the mirror’s red and yellow levels are carried through', async () => {
  await withFetch(
    {
      states: {
        'Сумська область': { enabled: true, alert_level: 'red', enabled_at: '2026-09-16T10:00:00Z', districts: {} },
        'Київська область': {
          enabled: false,
          alert_level: null,
          districts: {
            'Бучанський район': { enabled: true, alert_level: 'yellow', enabled_at: '2026-09-16T10:30:00Z' },
          },
        },
      },
    },
    async () => {
      const alerts = await new FreeMirrorProvider().fetchAlerts(signal());
      const byLevel = Object.fromEntries(alerts.map((a) => [a.level, a.regionName]));
      assert.equal(alerts.length, 2);
      assert.ok(byLevel.red.includes('Сумська'));
      assert.ok(byLevel.yellow.includes('Бучанський'));
    },
  );
});

test('an active alert with no level reported degrades to unknown', async () => {
  await withFetch(
    { states: { 'Сумська область': { enabled: true, alert_level: null, districts: {} } } },
    async () => {
      const alerts = await new FreeMirrorProvider().fetchAlerts(signal());
      assert.equal(alerts[0].level, 'unknown');
    },
  );
});

/** Drives the aggregator with scripted sources, as in aggregator.test.mjs. */
function build(providers) {
  const aggregator = new ProviderAggregator({ providers: [], apiKey: '', alertsInUaToken: '' });
  aggregator.providers = providers;
  aggregator.status = new Map(
    providers.map((p) => [p.id, { id: p.id, ok: false, error: null, alertCount: 0, lastSuccess: null }]),
  );
  return aggregator;
}

const stub = (id, alerts) => ({
  id,
  fetchRegions: async () => [],
  fetchAlerts: async () => alerts,
});

const KYIV = 'ua:київська';

test('a reported yellow survives merging with a source that reports no level', async () => {
  const aggregator = build([
    stub('free', [{ regionId: KYIV, regionName: 'K', type: 'air_raid', level: 'unknown', sources: ['free'] }]),
    stub('alertsinua', [{ regionId: KYIV, regionName: 'K', type: 'air_raid', level: 'yellow', sources: ['alertsinua'] }]),
  ]);

  const result = await aggregator.fetchAll(signal(), { error: () => {} });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].level, 'yellow');
});

test('when sources disagree on severity, the worse level wins', async () => {
  const aggregator = build([
    stub('free', [{ regionId: KYIV, regionName: 'K', type: 'air_raid', level: 'yellow', sources: ['free'] }]),
    stub('alertsinua', [{ regionId: KYIV, regionName: 'K', type: 'air_raid', level: 'red', sources: ['alertsinua'] }]),
  ]);

  const result = await aggregator.fetchAll(signal(), { error: () => {} });
  assert.equal(result.alerts[0].level, 'red');
});
