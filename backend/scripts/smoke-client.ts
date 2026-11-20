/** Minimal headless client: verifies snapshot + contiguous deltas, prints rate and latency. */
import WebSocket from "ws";
import { decodeServerMessage, encodeClientMessage } from "../src/protocol/codec.js";

const url = process.env.URL ?? "ws://localhost:8080";
// SUBSCRIBE=<id> (or several, comma separated) also asks for those instruments' depth ladder and trades;
// HISTORY=<id> asks for that instrument's price history once.
const subscribeIds = (process.env.SUBSCRIBE ?? "").split(",").filter(Boolean).map(Number);
const historyId = process.env.HISTORY === undefined ? null : Number(process.env.HISTORY);
const ws = new WebSocket(url);
ws.binaryType = "nodebuffer";

/**
 * Snapshot: full state sent on connect. Delta: only what changed; its seq should rise by exactly 1.
 * lastSeq: last seq seen (-1 = no snapshot yet). gaps: skipped seqs (lost messages).
 * updates: quote updates this second (throughput). latencies: ms from server timestamp to receipt,
 * reported as p50 (median) and p99 (slow tail).
 */

let lastSeq = -1;
let gaps = 0;
let updates = 0;
let depths = 0;
let trades = 0;
const latencies: number[] = [];

ws.on("open", () => {
  for (const id of subscribeIds) ws.send(encodeClientMessage({ t: "subscribe", id }));
  if (historyId !== null) ws.send(encodeClientMessage({ t: "history", id: historyId }));
});

// Handle each server frame: reset the sequence on snapshots, otherwise count sequence gaps, updates and latency.
ws.on("message", (data: Buffer) => {
  const msg = decodeServerMessage(data);
  switch (msg.t) {
    case "session":
      // Session handshake arrives first: log the protocol version, then wait for the snapshot.
      console.log(`session: v${msg.v}, ${msg.instruments} instruments`);
      break;
    case "snapshot":
      console.log(`snapshot: ${msg.quotes.length} quotes, seq=${msg.seq}, ${data.byteLength} bytes`);
      lastSeq = msg.seq;
      break;
    case "delta":
      if (lastSeq >= 0 && msg.seq !== lastSeq + 1) gaps++;
      lastSeq = msg.seq;
      updates += msg.updates.length;
      latencies.push(Date.now() - msg.ts);
      break;
    case "reference":
      break; // only sent to clients that ask for it; this one never does
    case "depth":
      depths++;
      break;
    case "trades":
      trades += msg.trades.length;
      break;
    case "history":
      console.log(`history: instrument ${msg.id}, ${msg.points.length} points, last price ${msg.points.at(-1)?.[1]}`);
      break;
    case "rejected":
      console.log(`rejected: ${msg.request} of instrument ${msg.id} (${msg.reason})`);
      break;
  }
});

/**
 * Once per second, print throughput, gap count and latency percentiles, then reset the counters.
 * p(q) returns the q-th percentile latency (0 if there are no samples).
 */
setInterval(() => {
  latencies.sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.floor(latencies.length * q)] ?? 0;
  const watching = subscribeIds.length > 0 ? ` depth/s=${depths} trades/s=${trades}` : "";
  console.log(`updates/s=${updates} gaps=${gaps} latency p50=${p(0.5)}ms p99=${p(0.99)}ms${watching}`);
  updates = 0;
  depths = 0;
  trades = 0;
  latencies.length = 0;
}, 1000);
