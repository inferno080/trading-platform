/** Feed counters for one sampling window, taken (and reset) by the HUD once a second. */
export interface FeedWindow {
  messages: number; // delta frames applied
  updates: number; // quote updates inside those frames
  latencies: number[]; // ms from server send time to arrival in the browser
  gaps: number; // sequence gaps detected
}

/** Value at quantile q (0 to 1) of an ascending-sorted array; 0 when empty. */
export const percentile = (sorted: number[], q: number): number => sorted[Math.floor(sorted.length * q)] ?? 0;

/** Accumulates feed counters between HUD samples. A plain object, so counting costs almost nothing. */
class Collector {
  private messages = 0;
  private updates = 0;
  private latencies: number[] = [];
  private gaps = 0;
  totalGaps = 0;

  // Called for every delta frame the client applies.
  onDelta(updateCount: number, latencyMs: number): void {
    this.messages++;
    this.updates += updateCount;
    this.latencies.push(latencyMs);
  }

  // Called with the counters of a worker's batch (a worker counts for itself, because the page never sees the raw frames).
  onBatch(stats: { messages: number; updatesIn: number; gaps: number; latencies: number[] }): void {
    this.messages += stats.messages;
    this.updates += stats.updatesIn;
    for (const latency of stats.latencies) this.latencies.push(latency);
    this.gaps += stats.gaps;
    this.totalGaps += stats.gaps;
  }

  // Called when a sequence gap is detected.
  onGap(): void {
    this.gaps++;
    this.totalGaps++;
  }

  // Forget everything, so a newly mounted iteration starts from zero instead of inheriting the previous tab's counts.
  reset(): void {
    this.messages = 0;
    this.updates = 0;
    this.latencies = [];
    this.gaps = 0;
    this.totalGaps = 0;
  }

  // Return the counters accumulated since the last call, and start a fresh window.
  drain(): FeedWindow {
    const window: FeedWindow = {
      messages: this.messages,
      updates: this.updates,
      latencies: this.latencies,
      gaps: this.gaps,
    };
    this.messages = 0;
    this.updates = 0;
    this.latencies = [];
    this.gaps = 0;
    return window;
  }
}

/** One shared instance: the feed writes to it and the HUD reads from it. */
export const collector = new Collector();
