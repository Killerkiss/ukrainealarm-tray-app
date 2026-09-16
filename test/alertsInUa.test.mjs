import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertsInUaProvider } from '../dist/main/alerts/alertsInUaProvider.js';
import { regionKey } from '../dist/shared/regionKey.js';

/**
 * The live API needs a token, so these drive the provider through a stubbed
 * `fetch` using payloads shaped exactly like the documented schema.
 */
function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const ok = (body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

const signal = () => new AbortController().signal;

test('an oblast alert maps onto the shared canonical key', async () => {
  await withFetch(
    async () =>
      ok({
        alerts: [
          {
            id: 10,
            location_title: 'Луганська область',
            location_type: 'oblast',
            location_oblast: 'Луганська область',
            alert_type: 'air_raid',
            started_at: '2026-09-16T10:00:00.000Z',
            finished_at: null,
          },
        ],
      }),
    async () => {
      const alerts = await new AlertsInUaProvider('token').fetchAlerts(signal());
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].regionId, regionKey('state', 'Луганська область'));
      assert.equal(alerts[0].type, 'air_raid');
      assert.deepEqual(alerts[0].sources, ['alertsinua']);
    },
  );
});

test('a hromada alert nests under its raion and oblast', async () => {
  await withFetch(
    async () =>
      ok({
        alerts: [
          {
            location_title: 'Бучанська міська громада',
            location_type: 'hromada',
            location_oblast: 'Київська область',
            location_raion: 'Бучанський район',
            alert_type: 'air_raid',
            finished_at: null,
          },
        ],
      }),
    async () => {
      const alerts = await new AlertsInUaProvider('token').fetchAlerts(signal());
      const oblast = regionKey('state', 'Київська область');
      const raion = regionKey('district', 'Бучанський район', oblast);
      assert.equal(alerts[0].regionId, regionKey('community', 'Бучанська міська громада', raion));
    },
  );
});

test('the threat breakdown is carried through', async () => {
  await withFetch(
    async () =>
      ok({
        alerts: [
          {
            location_title: 'Київська область',
            location_type: 'oblast',
            alert_type: 'air_raid',
            finished_at: null,
            threats: [
              { threat_type: 'drones' },
              { threat_type: 'ballistic_missiles' },
              { threat_type: 'drones' },
              { threat_type: 'not_a_real_threat' },
            ],
          },
        ],
      }),
    async () => {
      const alerts = await new AlertsInUaProvider('token').fetchAlerts(signal());
      // De-duplicated, and the unknown value is dropped rather than shown raw.
      assert.deepEqual(alerts[0].threats, ['drones', 'ballistic_missiles']);
    },
  );
});

test('artillery_shelling maps onto the shared artillery type', async () => {
  await withFetch(
    async () =>
      ok({
        alerts: [
          { location_title: 'Сумська область', location_type: 'oblast', alert_type: 'artillery_shelling', finished_at: null },
        ],
      }),
    async () => {
      const alerts = await new AlertsInUaProvider('token').fetchAlerts(signal());
      assert.equal(alerts[0].type, 'artillery');
    },
  );
});

test('a finished alert is never reported as active', async () => {
  await withFetch(
    async () =>
      ok({
        alerts: [
          {
            location_title: 'Київська область',
            location_type: 'oblast',
            alert_type: 'air_raid',
            finished_at: '2026-09-16T11:00:00.000Z',
          },
        ],
      }),
    async () => {
      assert.deepEqual(await new AlertsInUaProvider('token').fetchAlerts(signal()), []);
    },
  );
});

test('a sub-oblast alert with no oblast is skipped rather than mis-placed', async () => {
  await withFetch(
    async () => ok({ alerts: [{ location_title: 'Якийсь район', location_type: 'raion', alert_type: 'air_raid' }] }),
    async () => {
      assert.deepEqual(await new AlertsInUaProvider('token').fetchAlerts(signal()), []);
    },
  );
});

test('a 304 replays the cached view and re-sends If-Modified-Since', async () => {
  const seen = [];
  let call = 0;
  await withFetch(
    async (_url, init) => {
      seen.push(init.headers['If-Modified-Since']);
      call += 1;
      if (call === 1) {
        return ok(
          { alerts: [{ location_title: 'Київська область', location_type: 'oblast', alert_type: 'air_raid', finished_at: null }] },
          { 'last-modified': 'Wed, 16 Sep 2026 10:00:00 GMT' },
        );
      }
      return new Response(null, { status: 304 });
    },
    async () => {
      const provider = new AlertsInUaProvider('token');
      const first = await provider.fetchAlerts(signal());
      const second = await provider.fetchAlerts(signal());

      assert.equal(first.length, 1);
      // Unchanged data must not read as "all clear".
      assert.deepEqual(second, first);
      assert.equal(seen[0], undefined);
      assert.equal(seen[1], 'Wed, 16 Sep 2026 10:00:00 GMT');
    },
  );
});

test('the token travels in the header, never the query string', async () => {
  let requested;
  let headers;
  await withFetch(
    async (url, init) => {
      requested = url;
      headers = init.headers;
      return ok({ alerts: [] });
    },
    async () => {
      await new AlertsInUaProvider('secret-token').fetchAlerts(signal());
      assert.ok(!requested.includes('secret-token'), 'token must not appear in the URL');
      assert.equal(headers.Authorization, 'Bearer secret-token');
    },
  );
});

test('a missing token fails before any request is made', async () => {
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return ok({ alerts: [] });
    },
    async () => {
      await assert.rejects(() => new AlertsInUaProvider('   ').fetchAlerts(signal()), /No app token/);
      assert.equal(called, false);
    },
  );
});

test('HTTP failures carry an actionable message', async () => {
  for (const [status, pattern] of [
    [401, /Token rejected/],
    [429, /Rate limited/],
    [503, /unavailable/],
  ]) {
    await withFetch(
      async () => new Response(null, { status }),
      async () => {
        await assert.rejects(() => new AlertsInUaProvider('t').fetchAlerts(signal()), pattern);
      },
    );
  }
});

test('it publishes no region catalogue and says so', async () => {
  const provider = new AlertsInUaProvider('t');
  assert.equal(provider.providesRegions, false);
  assert.deepEqual(await provider.fetchRegions(), []);
});
