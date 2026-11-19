import { WebSocketServer, WebSocket } from "ws";
import { config } from "../config.js";
import { MarketSimulator } from "../sim/marketSimulator.js";
import { decodeClientMessage, encodeMessage } from "../protocol/codec.js";
import { Chaos } from "./chaos.js";
import { startTicker } from "./ticker.js";
import {
  PRICE_SCALE,
  PROTOCOL_VERSION,
  type Delta,
  type Session,
  type Snapshot,
} from "../protocol/messages.js";

const sim = new MarketSimulator(config.instruments, config.seed, config.activitySkew);
const wss = new WebSocketServer({ port: config.port, perMessageDeflate: false });

const chaos = new Chaos();
let seq = 0;
let framesSent = 0;
let updatesSent = 0;
let bytesSent = 0;
let framesDropped = 0;

const snapshotFrame = (): Uint8Array => {
  const msg: Snapshot = { t: "snapshot", seq, ts: Date.now(), quotes: sim.snapshot() };
  return encodeMessage(msg);
};

// Handshake message: protocol version, price scale and feed settings.
const sessionFrame = (): Uint8Array => {
  const msg: Session = {
    t: "session",
    v: PROTOCOL_VERSION,
    serverTime: Date.now(),
    instruments: sim.size,
    pxScale: PRICE_SCALE,
    tickMs: config.tickMs,
    updatesPerSecond: config.updatesPerSecond,
  };
  return encodeMessage(msg);
};

const sendSnapshot = (ws: WebSocket): void => {
  const frame = snapshotFrame();
  ws.send(frame, { binary: true });
  bytesSent += frame.byteLength;
};

// Abruptly ends every client connection, like a network failure. Returns how many there were.
const dropAllConnections = (): number => {
  let count = 0;
  for (const client of wss.clients) {
    client.terminate();
    count++;
  }
  return count;
};

wss.on("connection", (ws) => {
  ws.binaryType = "nodebuffer";
  ws.send(sessionFrame(), { binary: true }); // once per connection, always before the snapshot
  sendSnapshot(ws);
  ws.on("message", (data: Buffer) => {
    const msg = decodeClientMessage(data);
    if (!msg) return; // not something the server understands: ignore it
    switch (msg.t) {
      case "resync":
        sendSnapshot(ws);
        break;
      case "chaos":
        console.log(`chaos: ${chaos.handle(msg, Date.now(), dropAllConnections)}`);
        break;
    }
  });
});

// Sends one encoded frame to every client that is connected and keeping up.
const broadcast = (frame: Uint8Array, updateCount: number): void => {
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount > config.maxBufferedBytes) {
      // Slow consumer: skip the frame. Client detects the seq gap and requests a resync.
      framesDropped++;
      continue;
    }
    ws.send(frame, { binary: true });
    framesSent++;
    updatesSent += updateCount;
    bytesSent += frame.byteLength;
  }
};

// Simulation loop: one delta frame per tick, encoded once and fanned out to all clients.
const perTick = Math.max(1, Math.round((config.updatesPerSecond * config.tickMs) / 1000));
startTicker(config.tickMs, () => {
  if (wss.clients.size === 0) return; // nobody listening: don't burn CPU or advance seq
  if (chaos.paused) return; // feed frozen: nothing advances, so no gap appears when it resumes
  const now = Date.now();
  const updateCount = chaos.updatesPerFrame(perTick, now);
  const delta: Delta = { t: "delta", seq: ++seq, ts: now, updates: sim.step(updateCount, now) };
  if (chaos.takeLostFrame()) return; // the frame existed and used a sequence number, but never reaches clients
  const frame = encodeMessage(delta);
  const delay = chaos.deliveryDelay(now);
  if (delay > 0) setTimeout(() => broadcast(frame, updateCount), delay);
  else broadcast(frame, updateCount);
});

// Once-a-second server stats.
setInterval(() => {
  if (wss.clients.size === 0) return;
  const mbps = ((bytesSent * 8) / 1e6).toFixed(1);
  const faults = chaos.describe(Date.now());
  console.log(
    `clients=${wss.clients.size} seq=${seq} frames/s=${framesSent} updates/s=${updatesSent} ` +
      `Mbit/s=${mbps} dropped/s=${framesDropped}` +
      (faults ? `  chaos=[${faults}]` : ""),
  );
  framesSent = updatesSent = bytesSent = framesDropped = 0;
}, 1000);

console.log(
  `ws://localhost:${config.port}  instruments=${config.instruments} ` +
    `target=${config.updatesPerSecond} upd/s (${perTick} per ${config.tickMs}ms tick) skew=${config.activitySkew}`,
);
