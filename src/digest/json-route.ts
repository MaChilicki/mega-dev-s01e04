import type { Hono } from 'hono';
import type { ReadNight } from './types.js';

export function registerDigestApi(app: Hono, runsDir: string, readNight: ReadNight): void {
  app.get('/api/digest/:night', (c) => {
    const digest = readNight(runsDir, c.req.param('night'));
    if (digest === null) {
      return c.json({ error: `Digest not found or invalid for night: ${c.req.param('night')}` }, 404);
    }
    return c.json(digest);
  });
}
