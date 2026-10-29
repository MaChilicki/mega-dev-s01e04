import { describe, expect, it } from 'vitest';
import { jsxRenderer } from 'hono/jsx-renderer';
import { Hono } from 'hono';
import type { Status } from '../src/status.js';
import type { NightDigest } from '../src/digest/types.js';
import { StatusBoard } from '../src/views/status.js';

const status: Status = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  lastBeat: null,
  nights: ['2026-10-28', '2026-10-27'],
};

const digests: NightDigest[] = [
  { night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 5, retry: 1, fail: 0 } },
  { night: '2026-10-27', rows: [], badLines: 2, counts: { ok: 2, retry: 3, fail: 1 } },
];

describe('status board digests', () => {
  it('links nights and shows each digest event count', async () => {
    const app = new Hono();
    app.use('*', jsxRenderer());
    app.get('/', (c) => c.render(<StatusBoard status={status} digests={digests} />));

    const html = await (await app.request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('5 ok · 1 retry · 0 fail log events');
    expect(html).toContain('2 ok · 3 retry · 1 fail log events');
  });
});
