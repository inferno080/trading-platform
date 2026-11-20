import type { DepthLevel, Quote } from "../protocol/messages.js";

/** A number from 0 up to (not including) 1 that depends only on its three inputs, so the same inputs always give the same value. */
const hash01 = (a: number, b: number, c: number): number => {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** A quantity like the quote's own sizes: a whole number of 100-lots, from 100 to 5,000. */
const sizeAt = (id: number, level: number, side: number, ts: number): number =>
  100 * (1 + Math.floor(hash01(id, level * 2 + side, ts) * 50));

/**
 * The order book around a quote: `levels` rungs on each side, one tick apart, best price first. The top rung is the
 * quote itself. The others are made up, but from nothing except the instrument, the rung and the quote's time, so
 * the ladder keeps its shape until the instrument next updates, and the same quote always gives the same ladder.
 * It does not use the simulator's random generator, so asking for depth never changes the prices.
 */
export function buildDepth(quote: Quote, tickUnits: number, levels: number): { bids: DepthLevel[]; asks: DepthLevel[] } {
  const bids: DepthLevel[] = [[quote.bid, quote.bidSz]];
  const asks: DepthLevel[] = [[quote.ask, quote.askSz]];
  for (let level = 1; level < levels; level++) {
    const bidPrice = quote.bid - level * tickUnits;
    if (bidPrice > 0) bids.push([bidPrice, sizeAt(quote.id, level, 0, quote.ts)]); // a price cannot reach zero
    asks.push([quote.ask + level * tickUnits, sizeAt(quote.id, level, 1, quote.ts)]);
  }
  return { bids, asks };
}
