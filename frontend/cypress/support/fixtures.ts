import {
  PROTOCOL_VERSION,
  type Delta,
  type Quote,
  type QuoteUpdate,
  type Session,
  type Snapshot,
} from "../../src/protocol/messages";

const SYMBOLS = ["AAA", "AAB", "AAC", "AAD"];

/** A session handshake with sensible defaults. */
export const makeSession = (overrides: Partial<Session> = {}): Session => ({
  t: "session",
  v: PROTOCOL_VERSION,
  serverTime: 0,
  instruments: 3,
  pxScale: 100,
  tickMs: 20,
  updatesPerSecond: 50_000,
  ...overrides,
});

/** A quote priced at 299.17 / 299.21, last 299.20 (prices are fixed-point with a scale of 100). */
export const makeQuote = (id: number, overrides: Partial<Quote> = {}): Quote => ({
  id,
  sym: SYMBOLS[id] ?? `S${id}`,
  bid: 29917,
  ask: 29921,
  bidSz: 2700,
  askSz: 3500,
  last: 29920,
  vol: 8600,
  ts: 0,
  ...overrides,
});

export const makeSnapshot = (seq: number, quotes: Quote[] = [makeQuote(0), makeQuote(1), makeQuote(2)]): Snapshot => ({
  t: "snapshot",
  seq,
  ts: 0,
  quotes,
});

export const makeUpdate = (id: number, overrides: Partial<QuoteUpdate> = {}): QuoteUpdate => ({
  id,
  bid: 29917,
  ask: 29921,
  bidSz: 2700,
  askSz: 3500,
  last: 29920,
  vol: 8600,
  ts: 0,
  ...overrides,
});

export const makeDelta = (seq: number, updates: QuoteUpdate[]): Delta => ({
  t: "delta",
  seq,
  ts: Date.now(),
  updates,
});
