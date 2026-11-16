# trading-platform

A real-time trading dashboard built to explore streaming-data performance in the browser: a separate mock market-data server pushes tens of thousands of quote updates per second over WebSocket into a React UI.

**Status:** backend done; frontend not started.

## Architecture

```
┌────────────────────┐   WebSocket (MessagePack)   ┌──────────────────────┐
│  backend (Node/TS) │ ───────────────────────────▶ │  frontend (planned)  │
│  market simulator  │   snapshot, then deltas      │  React + TypeScript  │
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
      messages.ts             wire types: Snapshot, Delta, Quote, resync request
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

All frames are binary MessagePack.

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
| Bandwidth | about 31-32 Mbit/s |
| Snapshot size | about 448 KB (5,000 quotes) |
| Latency p50 | 3-5 ms |
| Latency p99 | 6-44 ms |
| Sequence gaps | 0 |

The shortfall against the 50k target comes from `setInterval` drift; drift-corrected scheduling is a planned fix.

## Roadmap

- [ ] Frontend: naive React client, to capture a baseline
- [ ] Web Worker for the socket and decoding, with per-symbol conflation
- [ ] Virtualized grid, with cell flash on change and stale-data indicators
- [ ] Reconnect, gap detection and resync in the UI
- [ ] Performance HUD: FPS, messages/sec, latency percentiles, long tasks, heap
- [ ] Backend: L2 depth, trades stream, per-symbol subscribe, chaos controls
- [ ] Drift-corrected simulator timing
