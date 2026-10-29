import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { registerDigestApi } from '../src/digest/json-route.js';
import type { NightDigest, ReadNight } from '../src/digest/types.js';

function createApi(readNight: ReadNight) {
  const app = new Hono();
  registerDigestApi(app, 'test-runs', readNight);
  return app;
}

describe('digest JSON API', () => {
  it('returns the reader result unchanged and calls the reader once', async () => {
    const digest: NightDigest = {
      night: '2026-10-28',
      rows: [{
        job: 'alpha', owner: null, runs: 3, retries: 1, failures: 1,
        lastStatus: 'fail', lastError: 'failed',
        firstTime: '2026-10-28T08:00:00+02:00', lastTime: '2026-10-28T08:30:00-04:00',
      }],
      badLines: 2,
      counts: { ok: 1, retry: 1, fail: 1 },
    };
    const readNight = vi.fn<ReadNight>(() => digest);

    const response = await createApi(readNight).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(digest);
    expect(readNight).toHaveBeenCalledTimes(1);
    expect(readNight).toHaveBeenCalledWith('test-runs', '2026-10-28');
  });

  it('returns a descriptive 404 when the reader returns null', async () => {
    const readNight = vi.fn<ReadNight>(() => null);

    const response = await createApi(readNight).request('/api/digest/not-a-night');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Digest not found or invalid for night: not-a-night' });
    expect(readNight).toHaveBeenCalledTimes(1);
  });

  it('preserves a digest with no rows', async () => {
    const digest: NightDigest = {
      night: '2026-10-29', rows: [], badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    };

    const response = await createApi(() => digest).request('/api/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(digest);
  });

  it('lets reader IO errors become Hono 500 responses', async () => {
    const app = createApi(() => { throw new Error('disk failure'); });
    app.onError((_error, c) => c.json({ error: 'internal server error' }, 500));

    const response = await app.request('/api/digest/2026-10-28');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal server error' });
  });
});
