/**
 * Sends one chaos command to a running server. The server then misbehaves on purpose for every connected
 * client, so you can watch how a client (the browser app, for example) copes.
 *
 *   npm run chaos -- pause
 *   npm run chaos -- latency 500
 */
import WebSocket from "ws";
import { encodeClientMessage } from "../src/protocol/codec.js";
import { CHAOS_ACTIONS, type ChaosAction, type ChaosCommand } from "../src/protocol/messages.js";

const url = process.env.URL ?? "ws://localhost:8080";

const usage = `Usage: npm run chaos -- <action> [value]

Actions:
  pause              freeze the feed: clients see no updates
  resume             start the feed again
  gap                lose the next frame, so clients see a sequence gap
  drop               close every client connection
  burst [seconds]    send 5x the normal rate for a while (default 5 seconds)
  latency <ms>       delay every frame by this long (0 removes the delay)
  reset              clear every fault

Server address: ${url} (override it with URL=ws://host:port)`;

const fail = (message: string): never => {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
};

// ---- read and check the arguments before touching the network ----
const [actionArg, valueArg] = process.argv.slice(2);
if (actionArg === undefined || actionArg === "--help" || actionArg === "-h") {
  console.log(usage);
  process.exit(actionArg === undefined ? 1 : 0);
}
if (!CHAOS_ACTIONS.includes(actionArg as ChaosAction)) fail(`Unknown action "${actionArg}".`);
const action = actionArg as ChaosAction;

let value: number | undefined;
if (valueArg !== undefined) {
  value = Number(valueArg);
  if (!Number.isFinite(value)) fail(`"${valueArg}" is not a number.`);
}
if (action === "latency" && value === undefined) fail("latency needs a number of milliseconds, for example: latency 500");

const command: ChaosCommand = value === undefined ? { t: "chaos", action } : { t: "chaos", action, value };

// ---- send it ----
const ws = new WebSocket(url);
let sent = false;

ws.on("open", () => {
  ws.send(encodeClientMessage(command), { binary: true }, (error) => {
    if (error) {
      console.error(`Could not send the command: ${error.message}`);
      process.exit(2);
    }
    sent = true;
    console.log(`sent: ${action}${value === undefined ? "" : ` ${value}`}  ->  ${url}`);
    ws.close();
  });
});

// The server ends this connection too when the action is "drop", so a close after sending is success.
ws.on("close", () => process.exit(sent ? 0 : 2));

ws.on("error", (error) => {
  if (sent) return; // the server closed on us after receiving the command, which is fine
  // Connection failures often have an empty message, but always have a code such as ECONNREFUSED.
  const reason = (error as NodeJS.ErrnoException).code || error.message || "unknown error";
  console.error(`Could not reach the server at ${url} (${reason}). Is the backend running?`);
  process.exit(2);
});

// Safety net so the tool can never hang.
setTimeout(() => {
  console.error("Timed out waiting for the server.");
  process.exit(2);
}, 5000).unref();
