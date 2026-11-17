import type { Quote, QuoteUpdate } from "../protocol/messages.js";
import { createRng, type Rng } from "./rng.js";

const TICK_SIZE = 0.01;
const round = (px: number): number => Math.round(px / TICK_SIZE) * TICK_SIZE;
const fix = (px: number): number => Number(px.toFixed(2));

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

  constructor(instrumentCount: number, seed: number) {
    this.rng = createRng(seed);
    const now = Date.now();
    this.quotes = Array.from({ length: instrumentCount }, (_, id) => {
      const mid = 5 + this.rng.next() * 495;
      const half = TICK_SIZE * (1 + this.rng.int(4));
      return {
        id,
        sym: symbolFor(id),
        bid: fix(round(mid - half)),
        ask: fix(round(mid + half)),
        bidSz: 100 * (1 + this.rng.int(50)),
        askSz: 100 * (1 + this.rng.int(50)),
        last: fix(round(mid)),
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

  /** Mutate `count` random instruments and return what changed. */
  step(count: number, now: number): QuoteUpdate[] {
    const out: QuoteUpdate[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const q = this.quotes[this.rng.int(this.quotes.length)]!;
      const mid = (q.bid + q.ask) / 2;
      // drift: small random price move (bell curve, ~2 ticks); price is floored at $1
      const drift = this.rng.gauss() * TICK_SIZE * 2;
      const newMid = Math.max(1, mid + drift);
      // rebuild bid/ask around the new mid, keeping the spread (at least 1 tick)
      const half = Math.max(TICK_SIZE, (q.ask - q.bid) / 2);
      q.bid = fix(round(newMid - half));
      q.ask = fix(round(newMid + half));
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
