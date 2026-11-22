/**
 * The Web Worker that owns the connection to the server. It runs on its own thread, so receiving and decoding
 * messages never competes with drawing the page.
 *
 * This file only connects the real WebSocket and the worker's messaging to FeedConnection, where the logic is.
 * It cannot be unit tested (a worker has its own global scope) and reports no coverage; the end-to-end tests
 * cover it in a real browser.
 */
import { FeedConnection } from "./FeedConnection";
import type { WorkerCommand, WorkerEvent } from "./messages";

// The DOM typings describe a window, so the worker's own messaging API is described here instead.
interface WorkerScope {
  postMessage(message: WorkerEvent): void;
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
  constructor: { name: string };
}
const scope = self as unknown as WorkerScope;

const connection = new FeedConnection(
  (url) => new WebSocket(url),
  (event) => scope.postMessage(event),
);

scope.onmessage = (event) => {
  const command = event.data;
  if (command.type === "connect") connection.connect(command.url);
  else if (command.type === "select") connection.select(command.id);
  else if (command.type === "watch") connection.watch(command.ids);
  else if (command.type === "rfq") connection.requestQuote(command.request);
  else if (command.type === "rfqAccept" || command.type === "rfqReject") connection.answerQuote(command.type, command.ref);
  else connection.pull();
};

// Tell the page the worker is up, and what kind of scope it runs in (a window would say "Window").
scope.postMessage({ type: "ready", scope: scope.constructor.name });
