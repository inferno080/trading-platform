# trading-platform

[![CI](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/inferno080/trading-platform/actions/workflows/ci.yml)

A real-time trading dashboard built to explore streaming-data performance in the browser. A separate mock market-data server pushes **50,000 quote updates per second for 5,000 instruments** over WebSocket. Two versions of the React frontend show the same market side by side: a **deliberately naive** one (every message goes into React state) and an **optimized** one (Web Worker, conflation, a store outside React, a virtualized grid). A built-in recorder measures both.

## Results

| | Naive | Optimized |
| --- | --- | --- |
| Frame rate (average) | 11.7 FPS | **60 FPS** |
| Worst frame | 416.6 ms | **17.7 ms** |
| Latency p50 / p99 | 3,510 ms / 4,830 ms | **4 ms / 5 ms** |
| Updates handled per second | 2,199 of 50,000 | **49,967 of 50,000** |
| Sequence gaps (resyncs) | 9 | **0** |

One 30-second run each, recorded back to back from a production build (commit `e8eb247`) at 5,000 instruments and 50,000 updates/s. Chrome 157, 8 logical cores, 1470 x 798 viewport, backend and browser on the same machine. The Optimized run used a refresh interval of 0, the hardest setting (every change is redrawn). Raw files: [`benchmarks/results/`](benchmarks/results/).

- **Optimized keeps up with the whole feed.** Decoding runs in a worker, so the main thread only draws: no frame over 17.7 ms and a median latency of 4 ms.
- **Naive falls behind.** Re-rendering 5,000 rows per message keeps the main thread busy, so frames queue in the browser (that queue is the latency). The server drops frames for a client that is not reading, so Naive received 2.2 of the 50 frames each second, none at all in 21 of the 30 seconds, and had to resync 9 times.
- **Caveats.** A single run each, so the numbers show the size of the gap, not a precise ratio. They depend on the machine, and 60 FPS is the display's refresh rate.

### Record a run

1. Start the backend (`cd backend && npm start`) and the production build (`cd frontend && npm run serve:prod`), and open http://localhost:4173 in a normal browser window. Keep the tab visible and close other heavy tabs and apps.
2. For the **Optimized** tab set **Refresh every (seconds)** to **0**. The default (1.5 s) redraws only now and then, which makes FPS and worst frame look much better than they are; the panel warns while it is above 0.
3. Wait for **Live**, then press **Record 30-second run** in the toolbar. After about 33 seconds the browser downloads a file such as `2026-11-22T19-26_naive_50k.json`; move it into `benchmarks/results/`.

Use `serve:prod` only: the development build is much slower, and the file records which build made it. Each file holds the mode (`naive` or `optimized`), build, git commit, load, environment, the refresh setting (`null` for Naive, which has none), whether the tab was hidden during the run, a summary (FPS, worst frame, message and update rates, latency p50 and p99, gaps) and the per-second samples behind it. Latency is measured from the server's send time to arrival in the browser, so it assumes both share a clock (true on one machine).

### Recorded runs

| File | Mode | Refresh | FPS avg | Latency p50 | Notes |
| --- | --- | --- | --- | --- | --- |
| [`2026-11-22T19-26_optimized_50k.json`](benchmarks/results/2026-11-22T19-26_optimized_50k.json) | optimized | 0 s | 60.0 | 4 ms | Commit `e8eb247`, the run in the table above |
| [`2026-11-22T19-26_naive_50k.json`](benchmarks/results/2026-11-22T19-26_naive_50k.json) | naive | none | 11.7 | 3,510 ms | Commit `e8eb247`, the run in the table above |

## Architecture

```
┌─────────────────────────┐   WebSocket, MessagePack    ┌────────────────────────────────────────────┐
│ backend (Node, TS)      │ ──────────────────────────▶ │ frontend (React, TS)                       │
│  market simulator       │   session, snapshot, deltas │                                            │
│  depth, trades, history │                             │  Optimized: Web Worker ─▶ store ─▶ AG Grid │
│  RFQ dealer, chaos      │ ◀────────────────────────── │  Naive:     socket ─▶ React state ─▶ table │
└─────────────────────────┘   subscribe, history, rfq   └────────────────────────────────────────────┘
```

The backend is its own process, so the client deals with a real network feed. There is no database. The server sends a snapshot on connect, then one delta every 20 ms with only the quotes that changed and a sequence number; a client that sees a gap asks for a new snapshot.

In the Optimized tab one update takes this path:

1. A **Web Worker** owns the socket, decodes the frame and marks the instrument "changed". Twenty ticks of one instrument between two frames are sent once (**conflation**).
2. The page asks the worker for what changed **once per animation frame**, with one request outstanding, so a slow page just gets more conflation.
3. The answer goes into a **store outside React**, which joins quotes with their reference data and turns wire integers into prices.
4. **AG Grid** gets the changed rows as one transaction and draws only what is on screen.

## Design decisions

| Decision | Why |
| --- | --- |
| Separate backend process, no database | A real feed with real latency and backpressure |
| Binary MessagePack, fixed-point integer prices per instrument | Smaller and faster than JSON; exact prices across instruments with different decimals |
| Snapshot + sequence-numbered deltas + resync | Small frames; gaps are detectable and recoverable |
| Opt-in messages (reference data, subscribe, history, RFQ) | Adding a feature never changes the stream the baseline sees |
| Server drops stream frames for slow clients, never replies | The server stays healthy; one-off answers are not lost |
| Zipf-skewed activity, drift-free timer, seeded generator | Realistic uneven load, an exact 50,000/s, and repeatable runs |
| One worker; the page pulls once per frame | The consumer sets the pace, so a slow page degrades gracefully |
| Store outside React | A batch costs one pass over the changed rows, not a render |
| AG Grid Community with only the modules used | Virtualization, sort, filter and keyboard support, about 26% smaller |
| Hand-drawn canvas charts, one shared renderer | Full control and no charting library for a line and a crosshair |
| One global refresh interval (1.5 s default, 0 to benchmark) | Numbers a person can read; the fastest setting for measuring |
| Naive tab kept, with the same columns and chart | A fair comparison is the point of the project |
| Chart ranges and 1D sessions made up on the server, on request | Deterministic, nothing stored, always ends at the live price |
| RFQ as a pure state machine, exactly-once on the server | Impossible states cannot happen; retries are safe |
| Reconnecting with exponential backoff and jitter | A struggling server is not hammered by returning clients |
| Cypress only, no backend tests | One tool for components and the real app; the backend is a mock, type-checked and audited in CI |

## Features

- **Quotes grid:** all 5,000 instruments, per-cell flash (green up, red down, with arrows), sort and filter on every column, stale-row marking.
- **Price chart:** 1D, 1M, 1Y, YTD and MAX on a canvas. 1D is a trading session (New York, Frankfurt, Tokyo or round the clock) that starts at the previous close; times are on the market's own clock.
- **Order book and trades tape**, a **watchlist** with mini charts, and a **request-for-quote ticket** with a countdown.
- **Resilience:** automatic reconnecting, and **chaos controls** (pause, drop a frame, drop the connection, burst, latency) that make the server misbehave on purpose.
- **Performance HUD** with a recorder that saves a run as JSON.

## Accessibility

Built to **WCAG 2.2 AA**.

- **Keyboard:** everything works without a mouse, including the grid (Enter sorts, Ctrl+Enter opens a filter), the watchlist and the RFQ ticket.
- **Focus:** managed on open and close; in the ticket it moves to the status, never onto Accept, and Escape turns a quote down before it closes the dialog.
- **Screen readers:** polite live regions announce a quote once and a warning at 3 seconds; charts carry a text summary; accessible names contain the visible text.
- **Not colour alone:** arrows, words and text accompany every red and green; light, dark and high-contrast themes; reduced motion turns the flash off.
- **Checked** with `jsx-a11y` and axe scans of both tabs in every theme and language. A manual screen-reader pass is still to do.

## Internationalization

- **en-US, en-GB and ja-JP**, remembered across visits; UK English is a short list of overrides.
- **Whole-sentence messages**, never joined fragments, so each language orders words and punctuates its own way.
- **Numbers, prices, dates and times** go through `Intl`; times are written on the market's own clock and zone.
- Tests check that translations match the English messages and placeholders.

## Run it

```bash
cd backend  && npm install && npm start            # ws://localhost:8080
cd frontend && npm install && npm run serve:prod   # http://localhost:4173 (use this for benchmarks)
```

The **Optimized** tab is the default; **Naive** is the baseline. `npm run dev` is for development (its numbers are not representative). Set `VITE_WS_URL` to point at a backend on another address.

## Backend

Node 22, TypeScript, [`ws`](https://github.com/websockets/ws) and [`@msgpack/msgpack`](https://github.com/msgpack/msgpack-javascript), in [`backend/`](backend/).

| Setting (environment variable) | Default | Meaning |
| --- | --- | --- |
| `INSTRUMENTS` | `5000` | Number of simulated instruments |
| `UPDATES_PER_SEC` | `50000` | Target quote updates per second |
| `ACTIVITY_SKEW` | `1` | `0` = every symbol equally active, `1` = a few hot symbols (Zipf) |
| `MAX_SUBSCRIPTIONS` | `5` | Instruments one client may follow in detail |
| `MAX_BUFFERED_BYTES` | `4194304` | Per-client buffer limit before stream frames are dropped |

**Protocol** (binary MessagePack, prices are integers scaled by each instrument's `decimals`):

- `session`, `snapshot`, `delta`: the handshake, the full state, and one delta per 20 ms tick with a `seq` that rises by one. `resync` asks for a new snapshot.
- `reference`: names, currency, decimals, tick size and previous close of every instrument, on request.
- `subscribe` / `unsubscribe`: depth (order book) and trades for one instrument, up to 5 per client.
- `history`: a price series for one instrument over `5m`, `1d`, `1m`, `1y`, `ytd` or `max` (all but `5m` are made up on request, deterministically, ending at the live price).
- `rfq`, `rfqAccept`, `rfqReject` / `rfqQuote`, `rfqResult`: a simulated dealer that quotes a price (one tick worse per 5,000 shares), holds it for 10 seconds, and fills it exactly once.
- `chaos`: makes the server misbehave for every client, from the UI or `npm run chaos -- <action>`.

| Chaos action | Effect |
| --- | --- |
| `pause` / `resume` | Stop and restart the feed |
| `gap` | Lose the next frame, so the client must resync |
| `drop` | Close every connection, like a network failure |
| `burst [s]` | 5x the normal updates for a few seconds |
| `latency <ms>` | Delay every frame |
| `reset` | Clear every fault |

## Frontend

React 19, TypeScript, Vite, AG Grid Community, `react-intl`, in [`frontend/`](frontend/).

```
frontend/src/
  feed/        the Web Worker, the connection logic inside it, and the reconnect policy
  optimized/   the Optimized tab: the store the worker feeds, and the grid
  naive/       the Naive tab: WebSocket straight into React state
  chart/       canvas charts, ranges and sessions, the shared instrument panel
  rfq/         the request-for-quote ticket and its state machine
  hud/         the performance HUD and the run recorder
  i18n/        messages: en-US, en-GB overrides, ja-JP
```

## Testing and quality

The frontend has **925 component tests** and **191 end-to-end tests** (Cypress, run from `frontend/` with `npm run test:ct` and `npm run test:e2e`), with about 99.6% statement coverage. The end-to-end tests need a light feed: `INSTRUMENTS=200 UPDATES_PER_SEC=500 npm start` in `backend/`, then `npm run build && npm run preview` in `frontend/`. CI runs type checks, lint (complexity limit 12), a production build, a dependency audit and all tests, then SonarCloud's default Sonar way gate. The backend is a mock, so it is type-checked and audited but has no tests.

## Roadmap

- [x] Backend simulator, protocol, chaos commands, depth, trades, history, sessions and RFQ dealer
- [x] Naive and Optimized frontends, with a benchmark recorder and the comparison above
- [x] Grid, charts with ranges, order book, watchlist, RFQ ticket, reconnecting and chaos controls
- [x] WCAG 2.2 AA accessibility and three languages
- [ ] `/health` endpoint, smoke-client exit codes, demo video
- [ ] Arabic (right to left) and German
- [ ] Optional real market hours; a trades tape that keeps its last trades
