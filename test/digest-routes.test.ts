import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const temporaryDirectories: string[] = [];

function tempRuns(files: Record<string, string> = {}): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content);
  return directory;
}

function event(at: string, job: string, status: string, owner: string | null, error?: string): string {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

function appFor(runsDir: string) {
  return createApp({ adapter: 'test', installed: 'test', beatEverySeconds: 30, runsDir });
}

// The digest table is intentionally simple; this extracts its known data-field cells.
function htmlRows(html: string): Array<{ job: string; fields: string[]; warning: boolean }> {
  return [...html.matchAll(/<tr\b([^>]*)>(.*?)<\/tr>/gs)]
    .flatMap(([, attributes, body]) => {
      const job = /data-job="([^"]*)"/.exec(attributes)?.[1];
      if (job === undefined) return [];
      return [{
        job: decodeHtml(job),
        fields: [...body.matchAll(/<td\b[^>]*data-field="[^"]+"[^>]*>(.*?)<\/td>/gs)]
          .map(([, value]) => decodeHtml(value.replace(/<[^>]*>/g, ''))),
        warning: /class="warn"/.test(attributes),
      }];
    });
}

function decodeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  })[entity] ?? entity);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('renders every JSON row field in sorted HTML rows, retaining failures and original offsets', async () => {
    const log = [
      event('2026-10-28T10:00:00+05:30', 'zeta', 'retry', 'owner-z', 'transient'),
      event('2026-10-28T10:01:00+05:30', 'zeta', 'retry', 'owner-z', 'transient'),
      event('2026-10-28T10:02:00+05:30', 'zeta', 'retry', 'owner-z', 'transient'),
      event('2026-10-28T10:03:00+05:30', 'zeta', 'ok', 'owner-z', 'recovered'),
      event('2026-10-28T23:00:00-04:00', 'alpha', 'fail', null, 'quota exceeded'),
      event('2026-10-28T23:01:00-04:00', 'alpha', 'ok', null),
    ].join('\n');
    const app = appFor(tempRuns({ [`${night}.jsonl`]: log }));

    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`), app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const digest = await api.json() as NightDigest;
    const expected: DigestRow[] = [
      { job: 'alpha', owner: null, runs: 2, retries: 0, failures: 1, lastStatus: 'ok', lastError: 'quota exceeded', firstTime: '2026-10-28T23:00:00-04:00', lastTime: '2026-10-28T23:01:00-04:00' },
      { job: 'zeta', owner: 'owner-z', runs: 4, retries: 3, failures: 0, lastStatus: 'ok', lastError: 'recovered', firstTime: '2026-10-28T10:00:00+05:30', lastTime: '2026-10-28T10:03:00+05:30' },
    ];
    expect(digest).toEqual({ night, rows: expected, badLines: 0, counts: { ok: 2, retry: 3, fail: 1 } });
    const html = await page.text();
    expect(htmlRows(html)).toEqual([
      { job: 'alpha', fields: ['alpha', '—', '2', '0', 'ok', 'quota exceeded', '2026-10-28T23:00:00-04:00', '2026-10-28T23:01:00-04:00'], warning: true },
      { job: 'zeta', fields: ['zeta', 'owner-z', '4', '3', 'ok', 'recovered', '2026-10-28T10:00:00+05:30', '2026-10-28T10:03:00+05:30'], warning: true },
    ]);
    expect(html).toContain('Bad lines: 0');
  });

  it('returns 404 from both routes for a missing night', async () => {
    const app = appFor(tempRuns());
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`), app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('Digest not found');
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: `Digest not found or invalid for night: ${night}` });
  });

  it('renders an empty night and returns rows: [] from JSON', async () => {
    const app = appFor(tempRuns({ [`${night}.jsonl`]: '' }));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`), app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('nothing ran');
    expect(htmlRows(html)).toEqual([]);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed lines and keeps valid output identical between routes', async () => {
    const app = appFor(tempRuns({ [`${night}.jsonl`]: [
      '{invalid json',
      event('2026-10-28T20:30:00+09:00', 'kept', 'retry', null, 'retry warning'),
      '{"job":',
    ].join('\n') }));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`), app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    const digest = await api.json() as NightDigest;
    expect(digest.badLines).toBe(2);
    expect(digest.rows).toEqual([{
      job: 'kept', owner: null, runs: 1, retries: 1, failures: 0, lastStatus: 'retry',
      lastError: 'retry warning', firstTime: '2026-10-28T20:30:00+09:00', lastTime: '2026-10-28T20:30:00+09:00',
    }]);
    const html = await page.text();
    expect(html).toContain('Bad lines: 2');
    expect(htmlRows(html)).toEqual([{
      job: 'kept', fields: ['kept', '—', '1', '1', 'retry', 'retry warning', '2026-10-28T20:30:00+09:00', '2026-10-28T20:30:00+09:00'], warning: false,
    }]);
  });

  it('HTML-escapes malicious job, owner, and error values in attributes and cells', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const app = appFor(tempRuns({ [`${night}.jsonl`]: event(
      '2026-10-28T12:00:00Z', malicious, 'fail', malicious, malicious,
    ) }));
    const [page, api] = await Promise.all([
      app.request(`/digest/${night}`), app.request(`/api/digest/${night}`),
    ]);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(htmlRows(html)).toEqual([{
      job: malicious,
      fields: [malicious, malicious, '1', '0', 'fail', malicious, '2026-10-28T12:00:00Z', '2026-10-28T12:00:00Z'],
      warning: true,
    }]);
    expect(await api.json()).toMatchObject({ rows: [{ job: malicious, owner: malicious, lastError: malicious }] });
  });
});
