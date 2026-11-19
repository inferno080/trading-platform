import { PRICE_SCALE, type Quote, type QuoteUpdate } from "../protocol/messages.js";
import { createRng, type Rng } from "./rng.js";

// Prices are integers in 1/PRICE_SCALE units, so one tick (0.01) is exactly 1 unit.
const MIN_BID = 1 * PRICE_SCALE; // price floor: $1.00

const symbolFor = (i: number): string => {
  // AAA, AAB, ... deterministic 3-4 letter tickers
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s.padStart(3, "A");
};

/** In-memory random-walk market. Owns the authoritative current quote per instrument. */
export class MarketSimulator {
  private readonly quotes: Quote[];
  private readonly rng: Rng;
  // Running total of each instrument's activity weight: cumulativeWeight[i] = weight(0) + ... + weight(i).
  // Picking a random point along this total and finding where it lands picks instruments in proportion to weight.
  private readonly cumulativeWeight: Float64Array;

  /** `activitySkew`: 0 makes every instrument equally active; 1 (default) makes a few very active (see config). */
  constructor(instrumentCount: number, seed: number, activitySkew = 1) {
    this.rng = createRng(seed);
    this.cumulativeWeight = new Float64Array(instrumentCount);
    let running = 0;
    for (let i = 0; i < instrumentCount; i++) {
      running += Math.pow(i + 1, -activitySkew); // weight of the instrument at rank i + 1 is 1 / rank^skew
      this.cumulativeWeight[i] = running;
    }
    const now = Date.now();
    this.quotes = Array.from({ length: instrumentCount }, (_, id) => {
      const mid = Math.round((5 + this.rng.next() * 495) * PRICE_SCALE); // $5-$500, in ticks
      const half = 1 + this.rng.int(4); // half-spread of 1-4 ticks
      return {
        id,
        sym: symbolFor(id),
        bid: mid - half,
        ask: mid + half,
        bidSz: 100 * (1 + this.rng.int(50)),
        askSz: 100 * (1 + this.rng.int(50)),
        last: mid,
        vol: 0,
        ts: now,
      };
    });
  }

  get size(): number {
    return this.quotes.length;
  }

  /** Deep copy of current state, for snapshots. */
  snapshot(): Quote[] {
    return this.quotes.map((q) => ({ ...q }));
  }

  /** Pick one instrument at random, more often the more active ones (binary search over the running total). */
  private pickInstrument(): Quote {
    const total = this.cumulativeWeight[this.cumulativeWeight.length - 1]!;
    const target = this.rng.next() * total; // a random point along the running total
    let low = 0;
    let high = this.cumulativeWeight.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.cumulativeWeight[middle]! > target) high = middle;
      else low = middle + 1;
    }
    return this.quotes[low]!; // the first instrument whose running total passes the point
  }

  /** Mutate `count` instruments (the more active ones more often) and return what changed. */
  step(count: number, now: number): QuoteUpdate[] {
    const out: QuoteUpdate[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const q = this.pickInstrument();
      // random move in whole ticks (bell curve, ~2 ticks), clamped so bid stays at or above $1
      const move = Math.max(Math.round(this.rng.gauss() * 2), MIN_BID - q.bid);
      // shift bid and ask together, so the spread stays the same
      q.bid += move;
      q.ask += move;
      q.bidSz = 100 * (1 + this.rng.int(50));
      q.askSz = 100 * (1 + this.rng.int(50));
      // 20% of steps simulate a trade at the bid or ask, adding to volume
      if (this.rng.next() < 0.2) {
        const lot = 100 * (1 + this.rng.int(10));
        q.last = this.rng.next() < 0.5 ? q.bid : q.ask;
        q.vol += lot;
      }
      q.ts = now;
      out[i] = {
        id: q.id,
        bid: q.bid,
        ask: q.ask,
        bidSz: q.bidSz,
        askSz: q.askSz,
        last: q.last,
        vol: q.vol,
        ts: q.ts,
      };
    }
    return out;
  }
}
