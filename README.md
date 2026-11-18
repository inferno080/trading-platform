# trading-platform

A real-time trading dashboard built to explore streaming-data performance in the browser: a separate mock market-data server pushes tens of thousands of quote updates per second over WebSocket into a React UI.

**Status:** backend baseline done; frontend has the deliberately naive client and the performance HUD. The optimized pipeline is next.

## Architecture

```
┌────────────────────┐   WebSocket (MessagePack)   ┌──────────────────────┐
│  backend (Node/TS) │ ───────────────────────────▶ │  frontend (React/TS) │
│  market simulator  │   session, snapshot, deltas  │  naive client + HUD  │
└────────────────────┘                              └──────────────────────┘
```

The backend runs as its own process, so the client has to deal with a real network feed rather than an in-page timer. There is no database: the market lives in memory.

## Backend

Located in [`backend/`](backend/). Node 22, TypeScript, [`ws`](https://github.com/websockets/ws) and [`@msgpack/msgpack`](https://github.com/msgpack/msgpack-javascript).

```
backend/
  src/
    config.ts                 env-driven settings
    protocol/
      messages.ts             wire types: Session, Snapshot, Delta, Quote, resync request
      codec.ts                MessagePack encode/decode
    sim/
      rng.ts                  seeded PRNG for reproducible runs
      marketSimulator.ts      in-memory random-walk market
    server/
      index.ts                WebSocket server, tick loop, fan-out, stats log
  scripts/
    smoke-client.ts           headless client: checks seq gaps and latency
```

### Run it

```bash
cd backend
npm install
npm start          # ws://localhost:8080
```

In a second terminal, from `backend/`:

```bash
npm run smoke      # prints updates/s, sequence gaps, p50/p99 latency (Ctrl+C to stop)
```

Other scripts: `npm run dev` (restart on change), `npm run typecheck`.

### Configuration

Set through environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | WebSocket port |
| `INSTRUMENTS` | `5000` | Number of simulated instruments |
| `UPDATES_PER_SEC` | `50000` | Target quote updates per second, across all instruments |
| `TICK_MS` | `20` | Simulator tick interval; one delta frame is sent per tick |
| `MAX_BUFFERED_BYTES` | `4194304` | Per-client socket buffer limit before frames are dropped |
| `SEED` | `42` | PRNG seed |

Example: `INSTRUMENTS=10000 UPDATES_PER_SEC=100000 npm start`

### Protocol

All frames are binary MessagePack. Prices are fixed-point integers: the real price is the wire value divided by `pxScale` (for example, 187.42 is sent as `18742` when `pxScale` is 100).

- **`session`**: sent once per connection, before the first snapshot, in the style of a FIX Logon. Carries the protocol version (`v`), server time, instrument count, `pxScale`, tick interval and target update rate.
- **`snapshot`**: sent on connect and on request. Contains every quote (`id`, `sym`, `bid`, `ask`, `bidSz`, `askSz`, `last`, `vol`, `ts`) and the `seq` it is current as of.
- **`delta`**: one per tick. `seq` increases by exactly 1 per frame. Carries only the quotes that changed, plus the server send time `ts` so clients can measure end-to-end latency.
- **`resync`** (client to server): requests a fresh snapshot.

Clients detect a gap when `seq` skips, and respond by sending `resync`.

### Backpressure

Each frame is encoded once and sent to every client. If a client's socket buffer exceeds `MAX_BUFFERED_BYTES`, the server skips frames for that client instead of letting memory grow. The client sees the sequence gap and resyncs.

### Measured (local, one client, default settings)

Measured on a development laptop with the smoke client running on the same machine, so treat these as a baseline, not a benchmark.

| Metric | Value |
| --- | --- |
| Updates/sec delivered | about 46-48k (target 50k) |
| Bandwidth | about 25 Mbit/s |
| Snapshot size | about 359 KB (5,000 quotes) |
| Latency p50 | 3-4 ms |
| Latency p99 | 5-8 ms |
| Sequence gaps | 0 |

The shortfall against the 50k target comes from `setInterval` drift; drift-corrected scheduling is a planned fix.

## Frontend

Located in [`frontend/`](frontend/). Vite, React 19, TypeScript, [`react-intl`](https://formatjs.github.io/docs/react-intl/) for i18n, and ESLint with `jsx-a11y`.

```
frontend/src/
  protocol/      wire types (mirrored from the backend) and MessagePack codec
  iterations.ts  registry of frontend iterations, one entry per tab
  shell/         accessible tab bar and hash routing (#/naive)
  naive/         the baseline: WebSocket straight into React state, plain table of all rows
  hud/           performance HUD, metrics collector, and the run recorder
  i18n/          react-intl setup; en-US messages, and en-GB overrides (only the strings that differ)
  lib/format.ts  cached Intl.NumberFormat helpers
  styles/        design tokens (light, dark, high contrast) and base styles
```

Each version of the frontend is an **iteration**, shown as a tab in the header and linkable by URL (for example `http://localhost:4173/#/naive`). Only the active iteration is mounted, so an inactive one never holds a socket open or competes for CPU during a measurement. Each iteration's page is loaded with a dynamic import, so its code (and any heavy library it uses, such as a grid) is only downloaded when its tab is opened and never inflates another iteration. To add an iteration, build its page and add one entry to `frontend/src/iterations.ts`.

The first iteration, **Naive**, is **deliberately naive**: every message goes into `useState` and the whole 5,000-row table re-renders. It exists to be measured, then beaten by the optimized pipeline.

### Run it

With the backend running (`cd backend && npm start`):

```bash
cd frontend
npm install
npm run dev          # development server with hot reload (numbers are NOT representative)
npm run serve:prod   # production build on http://localhost:4173 (use this for benchmarks)
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`.

Set `VITE_WS_URL` to point at a backend on another address (default `ws://localhost:8080`).

## Benchmarks

The HUD shows live frame rate, worst frame, message and update rates, latency percentiles and sequence gaps. Its **Record run** button measures 30 seconds (after a 3 second warm-up) and downloads a JSON file, which is saved in [`benchmarks/results/`](benchmarks/results/). See [`benchmarks/README.md`](benchmarks/README.md) for how to record a run.

Latency is measured from the server's send timestamp to the moment the browser receives the frame, so it assumes the clocks match (true when everything runs on one machine). When the main thread is busy, frames queue up in the browser, and that queueing shows up in the latency number.

| Pipeline | FPS avg | FPS min | Worst frame | Latency p50 | Latency p99 | Gaps | Result file |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Naive | 5.8 | 3.0 | 500 ms | 5,012 ms | 9,584 ms | 4 | [2026-11-18T21-00_naive_50k.json](benchmarks/results/2026-11-18T21-00_naive_50k.json) |
| Optimized | not built yet | | | | | | |

All runs use 5,000 instruments at 50,000 updates/sec, in a production build.

**Environment for the Naive run:** Chrome 157 on macOS, 8 logical cores, 1837 x 997 viewport, tab visible for the whole run, built from commit `4f0ddbf` with no uncommitted changes. Naive latency is not a start-up effect: it is the client falling behind a feed it cannot keep up with, which is the point of this baseline.

## Roadmap

- [x] Frontend: naive React client, to capture a baseline
- [ ] Web Worker for the socket and decoding, with per-symbol conflation
- [ ] Virtualized grid, with cell flash on change and stale-data indicators
- [ ] Reconnect, gap detection and resync in the UI
- [ ] Performance HUD: FPS, messages/sec, latency percentiles, long tasks, heap
- [ ] Backend: L2 depth, trades stream, per-symbol subscribe, chaos controls
- [ ] Drift-corrected simulator timing
