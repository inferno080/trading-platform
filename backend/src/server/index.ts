import { WebSocketServer, WebSocket } from "ws";
import { config } from "../config.js";
import { MarketSimulator } from "../sim/marketSimulator.js";
import { decodeClientMessage, encodeMessage } from "../protocol/codec.js";
import {
  PRICE_SCALE,
  PROTOCOL_VERSION,
  type Delta,
  type Session,
  type Snapshot,
} from "../protocol/messages.js";

const sim = new MarketSimulator(config.instruments, config.seed);
const wss = new WebSocketServer({ port: config.port, perMessageDeflate: false });

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

wss.on("connection", (ws) => {
  ws.binaryType = "nodebuffer";
  ws.send(sessionFrame(), { binary: true }); // once per connection, always before the snapshot
  sendSnapshot(ws);
  ws.on("message", (data: Buffer) => {
    const msg = decodeClientMessage(data);
    if (msg?.t === "resync") sendSnapshot(ws);
  });
});

// Simulation loop: one delta frame per tick, encoded once and fanned out to all clients.
const perTick = Math.max(1, Math.round((config.updatesPerSecond * config.tickMs) / 1000));
setInterval(() => {
  if (wss.clients.size === 0) return; // nobody listening: don't burn CPU or advance seq
  const now = Date.now();
  const delta: Delta = { t: "delta", seq: ++seq, ts: now, updates: sim.step(perTick, now) };
  const frame = encodeMessage(delta);
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount > config.maxBufferedBytes) {
      // Slow consumer: skip the frame. Client detects the seq gap and requests a resync.
      framesDropped++;
      continue;
    }
    ws.send(frame, { binary: true });
    framesSent++;
    updatesSent += perTick;
    bytesSent += frame.byteLength;
  }
}, config.tickMs);

// Once-a-second server stats.
setInterval(() => {
  if (wss.clients.size === 0) return;
  const mbps = ((bytesSent * 8) / 1e6).toFixed(1);
  console.log(
    `clients=${wss.clients.size} seq=${seq} frames/s=${framesSent} updates/s=${updatesSent} ` +
      `Mbit/s=${mbps} dropped/s=${framesDropped}`,
  );
  framesSent = updatesSent = bytesSent = framesDropped = 0;
}, 1000);

console.log(
  `ws://localhost:${config.port}  instruments=${config.instruments} ` +
    `target=${config.updatesPerSecond} upd/s (${perTick} per ${config.tickMs}ms tick)`,
);
