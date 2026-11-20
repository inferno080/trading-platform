import type { InstrumentReference, Quote, QuoteUpdate } from "../protocol/messages.js";
import { INSTRUMENT_CLASSES, classIndexFor, nameFor } from "./instruments.js";
import { createRng, type Rng } from "./rng.js";

// A price can never fall below this fraction of its starting price.
const PRICE_FLOOR_FRACTION = 0.2;
// The previous close is the starting price moved by a random amount with this standard deviation (1%), at most 5% either way.
const PREV_CLOSE_SPREAD = 0.01;
const PREV_CLOSE_MAX_MOVE = 0.05;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

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
  // Per-instrument facts, indexed by instrument id. Prices are integers in the instrument's own scale
  // (10^decimals units per real price unit), and every price sits on a multiple of the tick.
  private readonly references: InstrumentReference[] = [];
  private readonly tickUnits: number[] = []; // the tick size, as a whole number of wire units (e.g. 5 for a 0.005 tick at 3 decimals)
  private readonly minBids: number[] = []; // the price floor, in wire units

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
      const spec = INSTRUMENT_CLASSES[classIndexFor(id)]!;
      const scale = 10 ** spec.decimals; // wire units per real price unit
      const tick = Math.round(spec.tickSize * scale); // tick size in wire units
      const toTick = (units: number): number => Math.max(tick, Math.round(units / tick) * tick); // nearest price on the tick grid

      const mid = toTick((spec.minPrice + this.rng.next() * (spec.maxPrice - spec.minPrice)) * scale);
      const half = tick * (1 + this.rng.int(4)); // half-spread of 1-4 ticks
      const prevClose = toTick(mid * (1 + clamp(this.rng.gauss() * PREV_CLOSE_SPREAD, -PREV_CLOSE_MAX_MOVE, PREV_CLOSE_MAX_MOVE)));

      this.tickUnits.push(tick);
      this.minBids.push(toTick(mid * PRICE_FLOOR_FRACTION));
      this.references.push({
        id,
        name: nameFor(id, classIndexFor(id)),
        currency: spec.currency,
        tickSize: spec.tickSize,
        decimals: spec.decimals,
        prevClose,
      });
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

  /** The static facts about every instrument (name, currency, tick size, decimals, previous close). */
  reference(): InstrumentReference[] {
    return this.references.map((r) => ({ ...r }));
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
      // random move in whole ticks (bell curve, ~2 ticks), clamped so the bid stays at or above the floor
      const move = Math.max(Math.round(this.rng.gauss() * 2) * this.tickUnits[q.id]!, this.minBids[q.id]! - q.bid);
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
