import {
  PROTOCOL_VERSION,
  type Delta,
  type InstrumentReference,
  type Quote,
  type QuoteUpdate,
  type ReferenceData,
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
  tickMs: 20,
  updatesPerSecond: 50_000,
  ...overrides,
});

/** A quote for a 2-decimal instrument priced at 299.17 / 299.21, last 299.20 (wire integers, scale 100). */
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

const NAMES = ["Apex Systems Inc.", "Beacon Energy Inc.", "Cobalt Capital Inc.", "Delta Foods Inc."];

/** Reference data for a USD equity with 2 decimals and a previous close of 298.00 (wire integer 29800). */
export const makeReference = (id: number, overrides: Partial<InstrumentReference> = {}): InstrumentReference => ({
  id,
  name: NAMES[id] ?? `Instrument ${id}`,
  currency: "USD",
  tickSize: 0.01,
  decimals: 2,
  prevClose: 29800,
  ...overrides,
});

/** The reference data reply, by default for the same three instruments as makeSnapshot. */
export const makeReferenceData = (
  instruments: InstrumentReference[] = [makeReference(0), makeReference(1), makeReference(2)],
): ReferenceData => ({ t: "reference", instruments });
