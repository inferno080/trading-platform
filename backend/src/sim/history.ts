/**
 * Recent last-price history of every instrument: a fixed number of points taken at a regular interval, where the
 * newest point replaces the oldest once the buffer is full (a ring buffer). All instruments are sampled at the same
 * moments, so they share one list of times.
 */
export class History {
  private readonly times: Float64Array; // when each slot was recorded
  private readonly prices: Float64Array[]; // prices[id][slot]
  private head = 0; // the slot the next point goes into (when full, this is also the oldest point)
  private count = 0; // how many slots hold a point

  constructor(
    instrumentCount: number,
    readonly capacity: number,
  ) {
    this.times = new Float64Array(capacity);
    this.prices = Array.from({ length: instrumentCount }, () => new Float64Array(capacity));
  }

  /** Fill the whole buffer with made-up past points, ending at `now`, `intervalMs` apart. `series` gives one instrument's prices, oldest first. */
  preload(now: number, intervalMs: number, series: (id: number, points: number) => number[]): void {
    for (let slot = 0; slot < this.capacity; slot++) this.times[slot] = now - (this.capacity - 1 - slot) * intervalMs;
    for (let id = 0; id < this.prices.length; id++) this.prices[id]!.set(series(id, this.capacity));
    this.head = 0; // the buffer is full, so the next point replaces the oldest, which is in slot 0
    this.count = this.capacity;
  }

  /** Record one point for every instrument, taking each price from `priceOf`. */
  record(now: number, priceOf: (id: number) => number): void {
    this.times[this.head] = now;
    for (let id = 0; id < this.prices.length; id++) this.prices[id]![this.head] = priceOf(id);
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** One instrument's points, oldest first, as [time, price]. */
  points(id: number): [number, number][] {
    const prices = this.prices[id];
    if (!prices) return [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    const out: [number, number][] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const slot = (start + i) % this.capacity;
      out[i] = [this.times[slot]!, prices[slot]!];
    }
    return out;
  }
}
