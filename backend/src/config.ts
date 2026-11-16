const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num("PORT", 8080),
  /** Number of simulated instruments. */
  instruments: num("INSTRUMENTS", 5000),
  /** Target quote updates per second across all instruments. */
  updatesPerSecond: num("UPDATES_PER_SEC", 50_000),
  /** Simulator tick interval. Updates are batched per tick (one delta frame per tick). */
  tickMs: num("TICK_MS", 20),
  /** If a client's socket buffer exceeds this, we drop deltas for it and it must resync. */
  maxBufferedBytes: num("MAX_BUFFERED_BYTES", 4 * 1024 * 1024),
  seed: num("SEED", 42),
} as const;
