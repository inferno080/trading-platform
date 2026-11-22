import { WebSocketServer, WebSocket } from "ws";
import { config } from "../config.js";
import { MarketSimulator } from "../sim/marketSimulator.js";
import { History } from "../sim/history.js";
import { decodeClientMessage, encodeMessage } from "../protocol/codec.js";
import { Chaos } from "./chaos.js";
import { startTicker } from "./ticker.js";
import { RfqDesk } from "./rfq.js";
import { Subscriptions } from "./subscriptions.js";
import {
  PROTOCOL_VERSION,
  type Delta,
  type Rejected,
  type Session,
  type Snapshot,
  type Trade,
  type QuoteUpdate,
} from "../protocol/messages.js";

const sim = new MarketSimulator(config.instruments, config.seed, config.activitySkew, config.updatesPerSecond);
const wss = new WebSocketServer({ port: config.port, perMessageDeflate: false });
// The reference data never changes, so it is encoded once and the same bytes are sent to each client that asks.
const referenceFrame = encodeMessage({ t: "reference", instruments: sim.reference() });

// Price history: made-up past points to start with, then one real point per interval.
const history = new History(sim.size, config.historyPoints);
history.preload(Date.now(), config.historyIntervalMs, (id, points) => sim.backfillSeries(id, points));
setInterval(() => history.record(Date.now(), (id) => sim.lastPrice(id)), config.historyIntervalMs);

// Which clients watch which instruments (depth ladder and trades), up to a limit per client.
const subs = new Subscriptions<WebSocket>(sim.size, config.maxSubscriptions);

// The simulated dealer, who answers requests for quotes.
const desk = new RfqDesk<WebSocket>(
  { validMs: config.rfqValidMs, maxQuantity: config.rfqMaxQuantity, thinkMs: config.rfqThinkMs, maxOpen: config.rfqMaxOpen },
  (id) => sim.screen(id),
  (ws, message) => sendReply(ws, encodeMessage(message)),
);

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
    tickMs: config.tickMs,
    updatesPerSecond: config.updatesPerSecond,
  };
  return encodeMessage(msg);
};

// Reply to a { t: "reference" } request. Only the requesting client gets it, so everyone else's stream is unchanged.
const sendReference = (ws: WebSocket): void => {
  ws.send(referenceFrame, { binary: true });
  bytesSent += referenceFrame.byteLength;
};

const sendSnapshot = (ws: WebSocket): void => {
  const frame = snapshotFrame();
  ws.send(frame, { binary: true });
  bytesSent += frame.byteLength;
};

// Answers one request from one client: the history, a refusal, the first depth ladder. A reply is sent whatever the
// state of the client's buffer, because it is sent once and nothing would ever repeat it. (Skipping it for a client
// that is behind, as the streams below do, would leave a slow client waiting for ever.)
const sendReply = (ws: WebSocket, frame: Uint8Array): void => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(frame, { binary: true });
  bytesSent += frame.byteLength;
};

// Sends one frame of an extra stream (depth, trades) unless the client is not keeping up. A slow client can simply
// miss some: the next depth ladder replaces the last one, and the chart does not need every trade.
const sendStreamFrame = (ws: WebSocket, frame: Uint8Array): void => {
  if (ws.bufferedAmount > config.maxBufferedBytes) return;
  sendReply(ws, frame);
};

const depthFrame = (id: number, now: number): Uint8Array =>
  encodeMessage({ t: "depth", id, ts: now, ...sim.depth(id, config.depthLevels) });

const rejectedFrame = (request: Rejected["request"], id: number, reason: Rejected["reason"]): Uint8Array =>
  encodeMessage({ t: "rejected", request, id, reason });

const handleSubscribe = (ws: WebSocket, id: number): void => {
  const result = subs.subscribe(ws, id);
  if (result === "limit" || result === "unknown-instrument") {
    sendReply(ws, rejectedFrame("subscribe", id, result));
    return;
  }
  sim.watch(id);
  sendReply(ws, depthFrame(id, Date.now())); // the ladder appears at once, not at the instrument's next update
};

const handleUnsubscribe = (ws: WebSocket, id: number): void => {
  if (subs.unsubscribe(ws, id) && !subs.isWatched(id)) sim.unwatch(id);
};

const handleHistory = (ws: WebSocket, id: number): void => {
  if (id < 0 || id >= sim.size) {
    sendReply(ws, rejectedFrame("history", id, "unknown-instrument"));
    return;
  }
  sendReply(ws, encodeMessage({ t: "history", id, points: history.points(id) }));
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
      case "reference":
        sendReference(ws);
        break;
      case "chaos":
        console.log(`chaos: ${chaos.handle(msg, Date.now(), dropAllConnections)}`);
        break;
      case "subscribe":
        handleSubscribe(ws, msg.id);
        break;
      case "unsubscribe":
        handleUnsubscribe(ws, msg.id);
        break;
      case "history":
        handleHistory(ws, msg.id);
        break;
      case "rfq":
        desk.request(ws, msg);
        break;
      case "rfqAccept":
        desk.accept(ws, msg);
        break;
      case "rfqReject":
        desk.reject(ws, msg);
        break;
    }
  });
  // However the connection ended, stop recording trades for instruments nobody else watches.
  ws.on("close", () => {
    desk.release(ws); // its pending requests and held quotes go with it
    for (const id of subs.release(ws)) if (!subs.isWatched(id)) sim.unwatch(id);
  });
});

// The per-instrument frames for this tick: the depth ladder of each watched instrument that updated, and the trades
// that happened in watched instruments. Trades are always taken from the simulator, even when nobody is watching,
// so its buffer is emptied every tick.
const watchedFrames = (updates: QuoteUpdate[], now: number): { id: number; frame: Uint8Array }[] => {
  const trades = sim.takeTrades();
  const frames: { id: number; frame: Uint8Array }[] = [];
  if (!subs.any) return frames;

  const updated = new Set<number>(); // an instrument can appear several times in one tick; its ladder is sent once
  for (const update of updates) if (subs.isWatched(update.id)) updated.add(update.id);
  for (const id of updated) frames.push({ id, frame: depthFrame(id, now) });

  const tradesById = new Map<number, Trade[]>();
  for (const { id, ...trade } of trades) tradesById.set(id, [...(tradesById.get(id) ?? []), trade]);
  for (const [id, list] of tradesById) frames.push({ id, frame: encodeMessage({ t: "trades", id, trades: list }) });
  return frames;
};

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
  const extra = watchedFrames(delta.updates, now);
  if (chaos.takeLostFrame()) return; // the frame existed and used a sequence number, but never reaches clients
  const frame = encodeMessage(delta);
  // The depth and trades of this tick travel with the delta: held back by latency, and lost with it by a gap.
  const deliver = (): void => {
    broadcast(frame, updateCount);
    for (const { id, frame: extraFrame } of extra) for (const ws of subs.watchers(id)) sendStreamFrame(ws, extraFrame);
  };
  const delay = chaos.deliveryDelay(now);
  if (delay > 0) setTimeout(deliver, delay);
  else deliver();
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
