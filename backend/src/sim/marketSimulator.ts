import type { DepthLevel, InstrumentReference, Quote, QuoteUpdate, Trade } from "../protocol/messages.js";
import { buildDepth } from "./depth.js";
import { INSTRUMENT_CLASSES, classIndexFor, nameFor } from "./instruments.js";
import { createRng, type Rng } from "./rng.js";

// A price can never fall below this fraction of its starting price.
const PRICE_FLOOR_FRACTION = 0.2;
// The previous close is the starting price moved by a random amount with this standard deviation (1%), at most 5% either way.
const PREV_CLOSE_SPREAD = 0.01;
const PREV_CLOSE_MAX_MOVE = 0.05;

// Real spreads widen and tighten. A share of updates changes the spread by one tick, widening or narrowing it, but never
// below the narrowest or above the widest (in ticks).
const SPREAD_CHANGE_CHANCE = 0.15;
const MIN_SPREAD_TICKS = 2;
const MAX_SPREAD_TICKS = 12;

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

/** A trade, and which instrument it was in. */
export interface TradeEvent extends Trade {
  id: number;
}

/** In-memory random-walk market. Owns the authoritative current quote per instrument. */
export class MarketSimulator {
  private readonly quotes: Quote[];
  private readonly rng: Rng;
  // Used only to make up past prices for the price history. It is separate from `rng` so that asking for history
  // never changes the sequence of live prices (the same seed still gives the same market).
  private readonly historyRng: Rng;
  private readonly watched = new Set<number>(); // instruments someone subscribed to: only their trades are recorded
  private trades: TradeEvent[] = []; // trades of watched instruments since the last takeTrades()
  // Running total of each instrument's activity weight: cumulativeWeight[i] = weight(0) + ... + weight(i).
  // Picking a random point along this total and finding where it lands picks instruments in proportion to weight.
  private readonly cumulativeWeight: Float64Array;
  // Per-instrument facts, indexed by instrument id. Prices are integers in the instrument's own scale
  // (10^decimals units per real price unit), and every price sits on a multiple of the tick.
  private readonly references: InstrumentReference[] = [];
  private readonly tickUnits: number[] = []; // the tick size, as a whole number of wire units (e.g. 5 for a 0.005 tick at 3 decimals)
  private readonly minBids: number[] = []; // the price floor, in wire units
  // How many updates per second each instrument gets (its share of the total, by activity weight). Used to make the
  // made-up price history as lively as the live prices: the more updates, the further the price wanders.
  private readonly updatesPerSecond: Float64Array;

  /**
   * `activitySkew`: 0 makes every instrument equally active; 1 (default) makes a few very active (see config).
   * `totalUpdatesPerSecond` is the rate across all instruments, which sets how volatile each one's made-up history is.
   */
  constructor(instrumentCount: number, seed: number, activitySkew = 1, totalUpdatesPerSecond = 0) {
    this.rng = createRng(seed);
    this.historyRng = createRng(seed ^ 0x5bd1e995);
    this.cumulativeWeight = new Float64Array(instrumentCount);
    let running = 0;
    for (let i = 0; i < instrumentCount; i++) {
      running += Math.pow(i + 1, -activitySkew); // weight of the instrument at rank i + 1 is 1 / rank^skew
      this.cumulativeWeight[i] = running;
    }
    this.updatesPerSecond = new Float64Array(instrumentCount);
    for (let i = 0; i < instrumentCount; i++) {
      const weight = this.cumulativeWeight[i]! - (i > 0 ? this.cumulativeWeight[i - 1]! : 0);
      this.updatesPerSecond[i] = (totalUpdatesPerSecond * weight) / running;
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

  /** Start recording the trades of this instrument. */
  watch(id: number): void {
    this.watched.add(id);
  }

  /** Stop recording the trades of this instrument. */
  unwatch(id: number): void {
    this.watched.delete(id);
  }

  /** The trades of watched instruments since the last call, oldest first. */
  takeTrades(): TradeEvent[] {
    const out = this.trades;
    this.trades = [];
    return out;
  }

  /** The order book of one instrument (see buildDepth). */
  depth(id: number, levels: number): { bids: DepthLevel[]; asks: DepthLevel[] } {
    return buildDepth(this.quotes[id]!, this.tickUnits[id]!, levels);
  }

  /** The last traded price of one instrument, as a wire integer. */
  lastPrice(id: number): number {
    return this.quotes[id]!.last;
  }

  /**
   * Made-up past last prices of one instrument, one per second, oldest first, ending at its current price: a random
   * walk run backwards. Each live update moves the price by about 2 ticks, and the instrument gets so many updates a
   * second, so over a second the price wanders about 2 * sqrt(updates per second) ticks. Using that here makes the
   * past as lively as the present: a busy instrument swings widely, a quiet one hardly moves.
   */
  backfillSeries(id: number, points: number): number[] {
    const series = new Array<number>(points);
    const ticksPerSecond = 2 * Math.sqrt(this.updatesPerSecond[id]!);
    let price = this.quotes[id]!.last;
    for (let i = points - 1; i >= 0; i--) {
      series[i] = price;
      const move = Math.round(this.historyRng.gauss() * ticksPerSecond) * this.tickUnits[id]!; // whole ticks, so prices stay on the grid
      price = Math.max(this.minBids[id]!, price - move);
    }
    return series;
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

  /** Sometimes widen or narrow the spread by one tick, moving the bid or the ask (chosen at random) and keeping the limits. */
  private changeSpread(q: Quote): void {
    const roll = this.rng.next();
    if (roll >= SPREAD_CHANGE_CHANCE) return;
    const tick = this.tickUnits[q.id]!;
    const spreadTicks = Math.round((q.ask - q.bid) / tick);
    const widen = roll < SPREAD_CHANGE_CHANCE / 2;
    if (widen ? spreadTicks >= MAX_SPREAD_TICKS : spreadTicks <= MIN_SPREAD_TICKS) return;
    const onBidSide = this.rng.next() < 0.5;
    if (onBidSide) {
      const bid = q.bid + (widen ? -tick : tick); // widening lowers the bid, narrowing raises it
      if (bid >= this.minBids[q.id]!) q.bid = bid; // the bid may not fall below its floor
    } else {
      q.ask += widen ? tick : -tick;
    }
  }

  /** Mutate `count` instruments (the more active ones more often) and return what changed. */
  step(count: number, now: number): QuoteUpdate[] {
    const out: QuoteUpdate[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const q = this.pickInstrument();
      // random move in whole ticks (bell curve, ~2 ticks), clamped so the bid stays at or above the floor
      const move = Math.max(Math.round(this.rng.gauss() * 2) * this.tickUnits[q.id]!, this.minBids[q.id]! - q.bid);
      // shift bid and ask together, then sometimes widen or narrow the spread by a tick
      q.bid += move;
      q.ask += move;
      this.changeSpread(q);
      q.bidSz = 100 * (1 + this.rng.int(50));
      q.askSz = 100 * (1 + this.rng.int(50));
      // 20% of steps simulate a trade at the bid or ask, adding to volume
      if (this.rng.next() < 0.2) {
        const lot = 100 * (1 + this.rng.int(10));
        q.last = this.rng.next() < 0.5 ? q.bid : q.ask;
        q.vol += lot;
        if (this.watched.has(q.id)) {
          this.trades.push({ id: q.id, ts: now, price: q.last, size: lot, side: q.last === q.ask ? "buy" : "sell" });
        }
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
