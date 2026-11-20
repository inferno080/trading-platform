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
  /**
   * How unevenly updates are spread over the instruments (Zipf exponent). Instrument 0 is the most active,
   * and the instrument at rank r gets weight 1 / r^skew. 0 = every instrument equally active; 1 = a few hot
   * instruments produce most of the updates, like a real market.
   */
  activitySkew: num("ACTIVITY_SKEW", 1),
} as const;
