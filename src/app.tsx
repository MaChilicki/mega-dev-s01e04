import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { readNight } from './digest/read-night.js';
import { registerDigestApi } from './digest/json-route.js';
import { DigestPage } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  registerDigestApi(app, config.runsDir, readNight);

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) {
      return c.html(<Layout title="digest not found" lane={lane()}><h1>Digest not found</h1><p>{night}</p></Layout>, 404);
    }
    return c.html(<Layout title={`digest · ${night}`} lane={lane()}><DigestPage digest={digest} /></Layout>);
  });

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const digests = status.nights.flatMap((night) => {
      const digest = readNight(config.runsDir, night);
      return digest === null ? [] : [digest];
    });
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} digests={digests} />
      </Layout>,
    );
  });

  return app;
}
