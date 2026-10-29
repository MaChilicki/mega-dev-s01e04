import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNight } from '../src/digest/read-night';

const night = '2026-10-28';
const temporaryDirectories: string[] = [];

function tempRuns(content = ''): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, `${night}.jsonl`), content);
  return directory;
}

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook', ...overrides });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real sample without modifying it', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1 });
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest?.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('returns null for missing files and invalid or traversing night paths', () => {
    const directory = tempRuns();
    expect(readNight(directory, '2026-10-27')).toBeNull();
    for (const invalid of ['', '../2026-10-28', '..\\2026-10-28', '2026-10-28.jsonl', '2026-1-01', '2026-02-29', '2026-04-31', '/2026-10-28', '2026-10-28/../2026-10-28']) {
      expect(readNight(directory, invalid)).toBeNull();
    }
  });

  it('returns an empty digest for empty and whitespace-only nights', () => {
    for (const content of ['', '\r\n  \n\t\r\n']) {
      expect(readNight(tempRuns(content), night)).toEqual({
        night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
      });
    }
  });

  it('counts malformed JSON and invalid event shapes, while keeping null owners', () => {
    const invalid = [
      '{broken', 'null', '[]', '42', '{}', event({ at: 'yesterday' }),
      event({ at: '2026-02-30T12:00:00Z' }), event({ at: '2026-10-28T12:00:00' }),
      event({ job: 1 }), event({ status: 'unknown' }), event({ owner: 42 }),
      event({ error: null }), event({ owner: undefined }),
    ];
    const digest = readNight(tempRuns([...invalid, '', event({ owner: null })].join('\r\n')), night);
    expect(digest?.badLines).toBe(invalid.length);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1 });
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('uses chronological order across offsets and retains the latest error after recovery', () => {
    const digest = readNight(tempRuns([
      event({ at: '2026-10-29T00:10:00+02:00', owner: 'middle', status: 'retry', error: 'latest error' }),
      event({ at: '2026-10-28T23:20:00+01:00', owner: null }),
      event({ at: '2026-10-28T22:00:00Z', owner: 'first', status: 'fail', error: 'older error' }),
    ].join('\n')), night);
    expect(digest?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, failures: 1, lastStatus: 'ok', lastError: 'latest error',
      firstTime: '2026-10-28T22:00:00Z', lastTime: '2026-10-28T23:20:00+01:00',
    }]);
    expect(digest?.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('sorts job names ordinally and resolves equal times by log order', () => {
    const digest = readNight(tempRuns([
      event({ job: 'z' }), event({ job: 'a' }), event({ job: 'Z' }),
      event({ job: 'z', status: 'fail', owner: null, error: '' }),
    ].join('\n')), night);
    expect(digest?.rows.map(row => row.job)).toEqual(['Z', 'a', 'z']);
    expect(digest?.rows[2]).toMatchObject({ lastStatus: 'fail', owner: null, lastError: '', failures: 1 });
  });

  it('accepts real leap days and preserves fractional timestamp text', () => {
    const directory = tempRuns();
    writeFileSync(join(directory, '2024-02-29.jsonl'), event({ at: '2024-02-29T00:00:00.123+00:00' }));
    expect(readNight(directory, '2024-02-29')?.rows[0].lastTime).toBe('2024-02-29T00:00:00.123+00:00');
  });

  it('orders timestamps with precision finer than milliseconds', () => {
    const digest = readNight(tempRuns([
      event({ at: '2026-10-28T23:00:00.1239+01:00', owner: 'latest', error: 'latest' }),
      event({ at: '2026-10-28T22:00:00.1231Z', owner: 'earliest', error: 'earliest' }),
    ].join('\n')), night);
    expect(digest?.rows[0]).toMatchObject({
      owner: 'latest', lastError: 'latest',
      firstTime: '2026-10-28T22:00:00.1231Z', lastTime: '2026-10-28T23:00:00.1239+01:00',
    });
  });

  it('throws real IO errors instead of treating unreadable paths as missing', () => {
    const directory = tempRuns();
    mkdirSync(join(directory, '2026-10-27.jsonl'));
    expect(() => readNight(directory, '2026-10-27')).toThrow();
  });
});
