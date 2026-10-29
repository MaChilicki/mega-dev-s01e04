# Morning digest

The digest reads a single nightly JSONL file without modifying it. Both `GET /digest/:night` and `GET /api/digest/:night` use the same synchronous reader in `src/digest/read-night.ts`. A missing or invalid night returns 404. An empty night remains a valid report and displays `nothing ran`.

Each row represents one job. Runs count valid events, retries count `retry` events, and failures count `fail` events. The status board also counts valid events by status, rather than counting only each job's final status. Invalid nonblank lines are counted separately. Null owners remain in the report and display as an em dash.

The first and last times are selected chronologically while retaining the original timestamp text and offset. The latest event supplies the final owner and status. The latest supplied error remains visible after a later success. Equal timestamps use log order to resolve the final state. Jobs are sorted ordinally. The page highlights three or more retries and any recorded failure, including a failure followed by recovery.

The application listens on `127.0.0.1` only. The reviewer receives a self-contained static HTML copy, never access to the running service. Preview files, markers, credentials and private course exchanges stay outside Git. After review, the preview must be regenerated without `LANE_MARKER` and uploaded over the same HTTPS URL before the plan is archived.

## Verification

Run `pnpm install --frozen-lockfile`, `pnpm typecheck` and `pnpm test`. The integrated implementation passed 21 tests on 29 October 2026. The tests cover missing and empty files, malformed input, null owners, timestamp offsets, chronology, retry recovery, failure warnings, escaping and complete agreement between HTML and JSON rows. Both checked-in nightly fixtures remain unchanged.

The sample for 28 October contains five jobs, one bad line, ten `ok` events, four `retry` events and one `fail` event. The sample for 27 October contains four jobs and seven `ok` events. Both report pages, the board links and the warning styles were inspected in a browser.

The [public static preview](https://azyl-50752.ag3nts.org/) was published after an exact-content HTTPS probe. Its bytes match the locally rendered page. The static server sends `Cache-Control: public, no-store, no-transform` to preserve the HTML without proxy-injected analytics. Reviewer delivery, acceptance and marker cleanup have not happened yet.

## Work allocation

The reader was implemented by Codex with `gpt-6-astra` at high reasoning effort. Separate workers implemented the digest view, JSON route, board links and route tests with `gpt-6-luna` at low reasoning effort. Each worker used a separate Git worktree; the coordinator reviewed their changes, integrated the shared routes and performed the final checks. These model names identify the implementation workers, not a model called by the application. The digest itself is deterministic TypeScript and makes no LLM requests.

The tracker is [GitHub Issues](https://github.com/MaChilicki/mega-dev-s01e04/issues?q=label%3Aplan%3Amorning-digest). Delivery for review and cleanup remain separate open issues. The root plan stays active until those conditions hold.
