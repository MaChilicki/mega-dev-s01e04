import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isNight(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'at' in value && isTimestamp(value.at)
    && 'job' in value && typeof value.job === 'string'
    && 'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && 'owner' in value && (typeof value.owner === 'string' || value.owner === null)
    && (!('error' in value) || typeof value.error === 'string');
}

function compareTime(a: string, b: string): number {
  const milliseconds = Date.parse(a) - Date.parse(b);
  if (milliseconds !== 0) return milliseconds;
  // Date.parse truncates sub-millisecond precision, which the log may retain.
  const aFraction = /\.(\d+)/.exec(a)?.[1] ?? '';
  const bFraction = /\.(\d+)/.exec(b)?.[1] ?? '';
  const width = Math.max(aFraction.length, bFraction.length);
  const left = aFraction.padEnd(width, '0');
  const right = bFraction.padEnd(width, '0');
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Read a night without changing log timestamps or discarding failure history. */
export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;

  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, { row: DigestRow; errorTime: string | null }>();

  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunEvent(event)) {
      digest.badLines++;
      continue;
    }

    digest.counts[event.status]++;
    let job = jobs.get(event.job);
    if (!job) {
      job = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
          lastStatus: event.status, lastError: null, firstTime: event.at, lastTime: event.at,
        },
        errorTime: null,
      };
      jobs.set(event.job, job);
    }

    const { row } = job;
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    if (compareTime(event.at, row.firstTime) < 0) row.firstTime = event.at;
    // Equal timestamps use the later log line for a deterministic final state.
    if (compareTime(event.at, row.lastTime) >= 0) {
      row.owner = event.owner;
      row.lastStatus = event.status;
      row.lastTime = event.at;
    }
    if (event.error !== undefined && (job.errorTime === null || compareTime(event.at, job.errorTime) >= 0)) {
      row.lastError = event.error;
      job.errorTime = event.at;
    }
  }

  digest.rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
