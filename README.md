# trading-platform

[![CI](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml)

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

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`. Test scripts are listed under [Testing and code quality](#testing-and-code-quality).

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

## Testing and code quality

Every frontend feature ships with tests, and CI (GitHub Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs everything on each push and pull request. The frontend is tested with **Cypress only**: component tests for the logic and components, and end-to-end tests for the real app. The backend is a development mock with no automated tests by design; CI type-checks it and audits its dependencies.

```
frontend/cypress/
  component/   component and hook tests, mirroring src/ (coverage is measured here)
  e2e/         the built app talking to the real backend, plus accessibility checks
  support/     shared helpers: a fake WebSocket, a controllable matchMedia, fixtures
```

Run them from `frontend/`:

| Command | What it does |
| --- | --- |
| `npm run test:ct` | Component tests, with Istanbul coverage collected into `frontend/coverage/` |
| `npm run test:e2e` | End-to-end tests (needs the setup below) |
| `npm run cy:open` | Cypress's interactive runner |
| `npm run lint` | ESLint, including accessibility, React hooks and SonarJS code-smell rules |

### Coverage

Coverage is collected with [Istanbul](https://istanbul.js.org/) during the component tests, over everything in `frontend/src` except the bootstrap file `main.tsx`. A test loads every source module, so a file nobody exercises counts as uncovered instead of being skipped. The HTML report is written to `frontend/coverage/`, and the `lcov.info` file in it is sent to SonarCloud in CI. Coverage is checked by SonarCloud's Sonar way quality gate, through its **Coverage on New Code** condition (80% at the time of writing; the current value is shown under Quality Gates on [sonarcloud.io](https://sonarcloud.io)). See [Code quality gate](#code-quality-gate).

### End-to-end tests

They exercise the production build against the real backend, so start both first, with a light feed so the page stays responsive:

```bash
cd backend && INSTRUMENTS=200 UPDATES_PER_SEC=500 npm start      # terminal 1
cd frontend && npm run build && npm run preview -- --port 4173    # terminal 2
cd frontend && npm run test:e2e                                   # terminal 3
```

They cover the live table, loading and error states, navigation and keyboard use, the theme and language settings (including that they persist), a full real-time benchmark recording, and an automated WCAG 2.2 AA scan with [axe](https://github.com/dequelabs/axe-core) in both themes and both languages. The end-to-end run takes about a minute because the recording test runs in real time.

An automated scan finds only part of the accessibility problems. A manual pass with a screen reader is still needed.

### Code quality gate

Code quality is judged by SonarCloud's default **Sonar way** quality gate; this project adds no custom conditions of its own (custom gates are a paid SonarCloud feature). Sonar way looks at new and changed code: ratings for reliability, security and maintainability, test coverage, duplication and reviewed security hotspots. The exact current conditions are shown under Quality Gates on [sonarcloud.io](https://sonarcloud.io).

- **In CI:** the `quality` job sends the code and the frontend coverage report to SonarCloud and waits for the gate. It runs when the `SONAR_TOKEN` repository secret exists; without it the job says it was skipped. The project key and organization are in [`sonar-project.properties`](sonar-project.properties).
- **Coverage:** SonarCloud reads the frontend coverage report only, so the backend, which has no tests, is excluded from the coverage figure.
- **Also checked before SonarCloud sees the code:** TypeScript strict mode, ESLint with [SonarJS](https://github.com/SonarSource/SonarJS) rules, a complexity limit of 12 per function, and `npm audit` on runtime dependencies.
- **One-time SonarCloud setup:** create the project, turn **Automatic Analysis** off (it conflicts with the CI scan), and add the analysis token as the `SONAR_TOKEN` repository secret.

### Troubleshooting

- **Cypress fails to start with `bad option: --no-sandbox`:** the `ELECTRON_RUN_AS_NODE` environment variable is set, which VS Code does for processes it launches. Run Cypress from a normal terminal, or prefix the command with `env -u ELECTRON_RUN_AS_NODE`.
- **Node version:** CI uses Node 22. Cypress 15 and Vite 6 are used on purpose; Cypress 16 requires Vite 8, which needs a newer Node.

## Roadmap

- [x] Frontend: naive React client, to capture a baseline
- [ ] Web Worker for the socket and decoding, with per-symbol conflation
- [ ] Virtualized grid, with cell flash on change and stale-data indicators
- [ ] Reconnect, gap detection and resync in the UI
- [ ] Performance HUD: FPS, messages/sec, latency percentiles, long tasks, heap
- [ ] Backend: L2 depth, trades stream, per-symbol subscribe, chaos controls
- [ ] Drift-corrected simulator timing
