export type RunStatus = 'ok' | 'retry' | 'fail';

/** Times retain the original log text and offset; rows are ordered by job. */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  failures: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

/** Counts refer to valid log events, rather than the final status of each job. */
export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: Record<RunStatus, number>;
};

/** readNight(runsDir, night) returns null for a missing or invalid night. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
