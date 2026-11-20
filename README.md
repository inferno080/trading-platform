# trading-platform

[![CI](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml)

A real-time trading dashboard built to explore streaming-data performance in the browser: a separate mock market-data server pushes tens of thousands of quote updates per second over WebSocket into a React UI.

**Status:** backend with chaos commands and per-instrument reference data is done; the frontend has the deliberately naive client and the performance HUD, and the Optimized tab (the default) now has a Web Worker, conflation and an AG Grid; reconnecting and more HUD metrics are still to come.

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
      marketSimulator.ts      in-memory random-walk market with skewed (Zipf) activity
      instruments.ts          the instrument groups (currency, decimals, tick size) and their names
    server/
      index.ts                WebSocket server, tick loop, fan-out, stats log
      ticker.ts               drift-free timer (keeps an absolute schedule)
      chaos.ts                fault-injection state and the commands that change it
  scripts/
    smoke-client.ts           headless client: checks seq gaps and latency
    chaos.ts                  command-line tool that sends a chaos command to a running server
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
| `ACTIVITY_SKEW` | `1` | How unevenly updates are spread over the symbols: `0` = all equally active, `1` = a few hot symbols produce most of the updates |

Example: `INSTRUMENTS=10000 UPDATES_PER_SEC=100000 npm start`

### Update distribution

Real markets are uneven, so by default the simulator is too. The symbol at rank *r* gets weight `1 / r^skew` (Zipf's law), and symbol 0 (`AAA`) is the most active. With the default skew of 1 and the default load, `AAA` alone gets about 11% of all updates (about 5,500 a second), the ten hottest symbols get about 32%, and the quietest half of the symbols together get about 7%. That is what makes conflation (keeping only the latest update per symbol per frame) worth measuring. With `ACTIVITY_SKEW=0` every symbol gets about 10 updates a second.

### Protocol

All frames are binary MessagePack. Prices are fixed-point integers in **each instrument's own scale**: the real price is the wire value divided by `10^decimals`, where `decimals` comes from that instrument's reference data (for example, a USD equity with 2 decimals sends 187.42 as `18742`, and a yen equity with 0 decimals sends 47,213 as `47213`). The current protocol version is **2**; version 1 used one global scale for every instrument.

- **`session`**: sent once per connection, before the first snapshot, in the style of a FIX Logon. Carries the protocol version (`v`), server time, instrument count, tick interval and target update rate.
- **`snapshot`**: sent on connect and on request. Contains every quote (`id`, `sym`, `bid`, `ask`, `bidSz`, `askSz`, `last`, `vol`, `ts`) and the `seq` it is current as of.
- **`delta`**: one per tick. `seq` increases by exactly 1 per frame. Carries only the quotes that changed, plus the server send time `ts` so clients can measure end-to-end latency.
- **`resync`** (client to server): requests a fresh snapshot.
- **`reference`** (client to server, then server to that client): `{ t: "reference" }` asks for the reference data, and the server replies with `{ t: "reference", instruments: [...] }`. It is opt-in, so a client that never asks sees exactly the stream it would have seen without this feature. See [Instruments and reference data](#instruments-and-reference-data).
- **`chaos`** (client to server): `{ t: "chaos", action, value? }` asks the server to misbehave on purpose, so a client's recovery can be tested (see [Chaos commands](#chaos-commands)). Malformed messages, unknown actions and anything that is not a known client message are ignored.

Clients detect a gap when `seq` skips, and respond by sending `resync`.

### Backpressure

Each frame is encoded once and sent to every client. If a client's socket buffer exceeds `MAX_BUFFERED_BYTES`, the server skips frames for that client instead of letting memory grow. The client sees the sequence gap and resyncs.

### Instruments and reference data

The simulator has four groups of instruments, so the feed has to deal with different currencies, decimals and tick sizes, as a real multi-asset market does. The group is decided by the last digit of the instrument id, and the most active instruments (lowest ids) are USD equities.

| Group | Share | Currency | Decimals | Tick size | Starting price |
| --- | --- | --- | --- | --- | --- |
| USD equities | 60% | USD | 2 | 0.01 | 5 to 500 |
| EUR equities | 10% | EUR | 3 | 0.005 | 5 to 500 |
| JPY equities | 20% | JPY | 0 | 1 | 500 to 50,000 |
| FX-style | 10% | USD | 4 | 0.0001 | 0.5 to 2 |

Every price sits on a multiple of its tick, and the spread between bid and ask never changes. A client asks for the static facts about every instrument with a `reference` message and gets one entry each:

| Field | Meaning |
| --- | --- |
| `id` | The instrument id used in snapshots and deltas |
| `name` | A fictional company or currency-pair name. Names are not unique; the symbol is the identifier. |
| `currency` | ISO currency code |
| `tickSize` | The smallest allowed price move, as a real price (for example `0.005`) |
| `decimals` | Decimal places of a price, which also sets the wire scale (`10^decimals`) |
| `prevClose` | The previous close as a wire integer, so CHG% is `price / prevClose - 1` |

The previous close is the starting price moved by about 1% (never more than 5%), so CHG% starts spread around zero. The reference data is about 420 KB, is encoded once, and is sent only to a client that asks.

### Chaos commands

The server can be told to misbehave on purpose, so you can watch how a client copes. Commands affect **every connected client**, not just the sender, which is what lets a second terminal disturb your browser tab. This is a local development server with no authentication, so any connected client can send them.

Send one from a second terminal while the backend runs:

```bash
cd backend
npm run chaos -- pause          # freeze the feed
npm run chaos -- latency 500    # delay every frame by 500 ms
npm run chaos -- reset          # clear every fault
```

| Action | What the server does | What a client should notice |
| --- | --- | --- |
| `pause` | Stops making updates and stops using sequence numbers | No frames at all; the feed goes stale. After `resume` the sequence continues with no gap. |
| `resume` | Ends a pause | Frames flow again |
| `gap` | Creates the next frame and counts it, but never sends it | A jump in the sequence, so the client must ask for a snapshot |
| `drop` | Abruptly closes every connection, like a network failure | The socket closes |
| `burst [seconds]` | Sends 5x the normal updates per frame (default 5 seconds, at most 60) | A flood: about 250,000 updates a second at the default load |
| `latency <ms>` | Holds every frame back by that long (at most 5,000 ms); `0` removes it | Latency figures rise by that amount. Frames still arrive in order. |
| `reset` | Clears every fault | Normal service |

While a fault is active, the server's once-a-second log line ends with `chaos=[...]`, for example `chaos=[latency=500ms]`. Each command also logs one line saying what it did. Point the tool at another server with `URL=ws://host:port npm run chaos -- pause`.

### Measured (local, one client, default settings)

Measured on a development laptop with the smoke client running on the same machine, so treat these as a baseline, not a benchmark.

| Metric | Value |
| --- | --- |
| Updates/sec delivered | 50,000 (target 50k) |
| Bandwidth | about 26 Mbit/s |
| Snapshot size | about 359 KB (5,000 quotes) |
| Latency p50 | 3-4 ms |
| Latency p99 | 5-8 ms |
| Sequence gaps | 0 |

The server uses a drift-free timer (`ticker.ts`): it keeps an absolute schedule instead of waiting a full interval after each tick, so the delivered rate matches the target. With plain `setInterval` it delivered about 47.7k a second, because every small delay added up.

## Frontend

Located in [`frontend/`](frontend/). Vite, React 19, TypeScript, [`react-intl`](https://formatjs.github.io/docs/react-intl/) for i18n, and ESLint with `jsx-a11y`.

```
frontend/src/
  protocol/      wire types (mirrored from the backend) and MessagePack codec
  iterations.ts  registry of frontend iterations, one entry per tab
  shell/         accessible tab bar, hash routing (#/optimized, #/naive) and the loading and error handling for each tab
  feed/          the Web Worker that owns the connection, and the logic inside it (FeedConnection)
  optimized/     the optimized version (the default tab): the store the worker feeds, the per-row redraw limit, and the AG Grid
  naive/         the baseline: WebSocket straight into React state, plain table of all rows
  hud/           performance HUD, metrics collector, and the run recorder
  i18n/          react-intl setup; en-US messages, and en-GB overrides (only the strings that differ)
  lib/format.ts  cached Intl.NumberFormat helpers
  styles/        design tokens (light, dark, high contrast) and base styles
```

Each version of the frontend is an **iteration**, shown as a tab in the header and linkable by URL (for example `http://localhost:4173/#/naive`). The first tab, **Optimized**, is the default. Each iteration's page is loaded with a dynamic import and wrapped in the same error handling, so a failed download shows a message with a Reload button instead of a blank page. Only the active iteration is mounted: a tab you are not looking at does not exist in the page. It holds no WebSocket connection, no timers and no table rows, and leaving the Naive tab closes its connection and frees its 5,000 rows. Its code is not even downloaded until you open it. To add an iteration, build its page and add one entry to `frontend/src/iterations.ts`.

The **Optimized** iteration moves the work off the page, in four stages:

1. **A Web Worker owns the connection.** It opens the WebSocket, checks the protocol version, asks for the reference data once, decodes every frame, keeps the full market state, and recovers from a missed frame (a sequence gap) by asking the server for a new snapshot. Leaving the tab terminates the worker and its connection.
2. **The worker conflates.** An instrument that ticked twenty times between two frames is sent once, with its latest state. The page asks for what changed **once per animation frame**, with at most one request outstanding, so a slow page just gets more conflation. If an answer never comes, it asks again after 2 seconds.
3. **A store outside React.** The answer goes into a small store that joins each quote with its reference data and turns wire integers into real prices. React does not render 60 times a second; only the grid hears about the rows that changed.
4. **AG Grid draws only what is on screen.** Changed rows reach AG Grid Community as one transaction. Only the modules the grid uses are registered, which keeps the chunk about 26% smaller than registering everything.

What you see and can change:

- **Refresh every (seconds)**, a number box that starts at **1.5**. The grid collects the changes and redraws them all together once per interval, showing the latest state of each row; **0** redraws every change as it arrives. The data still arrives and is counted at full speed. One shared redraw means everything that changed flashes in the same instant, which is more noticeable at long intervals; a short interval hides it.
- **Flashing** is per cell and coloured by direction: green when a value moved up, red when it moved down, with ▲/▼ marks as well so it never relies on colour alone. Chg % flashes by its own sign. The flash is off when the OS asks for reduced motion.
- **Sort and filter** on every column. Each heading has a filter button beside its name. With the keyboard, Tab to a heading, then **Enter** sorts and **Ctrl+Enter** opens its filter (Alt+Down also works).
- **Freeze stream** holds the numbers still while the worker keeps receiving; resuming catches up in one step.
- Rows with no update for 5 seconds are marked in the data but drawn as normal text, and nothing is marked while the tab is hidden.
- The performance panel above the grid shows the live rates; there is no separate panel of connection facts.

The first iteration built, **Naive**, is **deliberately naive**: every message goes into `useState` and the whole 5,000-row table re-renders. It exists to be measured, then beaten by the optimized pipeline.

The Naive table shows fourteen columns: symbol, name, currency, bid, ask, spread, last, previous close, change %, bid and ask size, volume, tick size and decimals. Right after the session handshake (protocol version 2) it asks the server for the instrument reference data **once per connection** (see [Instruments and reference data](#instruments-and-reference-data)), and keeps it in a lookup by instrument id, separate from the quotes that change every frame. The table shows its loading skeleton until it has both the first snapshot and the reference data, because a wire price cannot be read without its instrument's decimals. If the reference data has not arrived after 10 seconds, the page says so. Each row is priced with its own instrument's decimals, so a yen price has none and an FX-style price has four. The Optimized tab shows the same fourteen columns, so every version does the same visible work and the benchmark compares like with like.

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

All runs use 5,000 instruments at a 50,000 updates/sec target, in a production build.

**The Naive row is an early, interim result.** It was recorded against the first version of the backend (before the drift-free timer, skewed activity and later changes). The real comparison happens once, at the end of the project: Naive, Optimized and the grid version are all recorded in the same session, on the same machine, against the final backend, and this table is replaced with those numbers.

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
- **Cypress's Electron browser closes unexpectedly (`Timed out waiting for the browser to connect`):** run the same command with `--browser chrome`. Leftover headless Chrome processes from earlier runs can also get in the way of opening Chrome; quit any Chrome started by Cypress.
- **Files named like `Hud 2.tsx` appear in the project:** they are copies made by Finder or a sync service, not part of the repository. Delete them; they break `npm run lint`.
- **Node version:** CI uses Node 22. Cypress 15 and Vite 6 are used on purpose; Cypress 16 requires Vite 8, which needs a newer Node.

## Roadmap

- [x] Frontend: naive React client, to capture a baseline
- [x] Web Worker for the socket and decoding, with per-symbol conflation
- [x] Virtualized grid (AG Grid), with cell flash on change, stale-data indicators, sort, filter and freeze
- [x] Gap detection and resync in the worker
- [ ] Reconnect with a connection state machine
- [ ] Performance HUD: FPS, messages/sec, latency percentiles, long tasks, heap
- [ ] Backend: L2 depth, trades stream, per-symbol subscribe, chaos controls
- [x] Drift-corrected simulator timing
