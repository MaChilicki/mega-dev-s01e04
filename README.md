# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

The morning digest is available at `/digest/2026-10-28`, with the same data at
`/api/digest/2026-10-28`. The status board links every night on disk. See
[digest behavior and verification](docs/morning-digest.md) for the counting rules and review status.
