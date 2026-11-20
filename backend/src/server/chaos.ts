import type { ChaosCommand } from "../protocol/messages.js";

const BURST_FACTOR = 5; // during a burst the server sends this many times its normal number of updates per frame
const DEFAULT_BURST_SECONDS = 5;
const MAX_BURST_SECONDS = 60;
const MAX_LATENCY_MS = 5000;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * The server's current fault-injection state. Client commands change it (see `handle`), and the tick loop
 * asks it what to do before sending each frame.
 */
export class Chaos {
  /** While true the feed is frozen: no updates are made and no sequence numbers are used. */
  paused = false;
  /** Every frame is held back this long before it is sent (0 = send at once). */
  latencyMs = 0;
  private burstUntil = 0; // time (ms since epoch) at which the current burst ends
  private lostFrames = 0; // how many of the next frames to create but never send
  private lastDeliveryDue = 0; // when the most recent frame is due, so frames are never delivered out of order

  /** How many updates this frame should carry: the normal number, multiplied during a burst. */
  updatesPerFrame(normal: number, now: number): number {
    return now < this.burstUntil ? normal * BURST_FACTOR : normal;
  }

  /** True for each frame that must be lost: it exists and uses a sequence number, but is never sent. */
  takeLostFrame(): boolean {
    if (this.lostFrames === 0) return false;
    this.lostFrames--;
    return true;
  }

  /**
   * How long to hold this frame before sending it (0 = send now). A frame never overtakes an earlier one:
   * if latency was just lowered while delayed frames are still waiting, the new frame waits behind them,
   * because a real connection delivers in order.
   */
  deliveryDelay(now: number): number {
    const due = Math.max(now + this.latencyMs, this.lastDeliveryDue);
    this.lastDeliveryDue = due;
    return due - now;
  }

  /** A short description of the active faults for the stats line; empty when there are none. */
  describe(now: number): string {
    const active: string[] = [];
    if (this.paused) active.push("paused");
    if (this.latencyMs > 0) active.push(`latency=${this.latencyMs}ms`);
    if (now < this.burstUntil) active.push(`burst x${BURST_FACTOR}`);
    if (this.lostFrames > 0) active.push(`losing ${this.lostFrames} frame(s)`);
    return active.join(" ");
  }

  /**
   * Apply a command. `dropAllConnections` closes every client connection and returns how many there were.
   * Returns a sentence describing what happened, for the server log.
   */
  handle(command: ChaosCommand, now: number, dropAllConnections: () => number): string {
    switch (command.action) {
      case "pause":
        this.paused = true;
        return "feed paused";
      case "resume":
        this.paused = false;
        return "feed resumed";
      case "gap":
        this.lostFrames++;
        return "the next frame will be lost";
      case "drop":
        return `dropped ${dropAllConnections()} connection(s)`;
      case "burst": {
        const seconds = clamp(command.value ?? DEFAULT_BURST_SECONDS, 1, MAX_BURST_SECONDS);
        this.burstUntil = now + seconds * 1000;
        return `burst x${BURST_FACTOR} for ${seconds}s`;
      }
      case "latency":
        this.latencyMs = clamp(command.value ?? 0, 0, MAX_LATENCY_MS);
        return this.latencyMs > 0 ? `every frame delayed by ${this.latencyMs} ms` : "latency removed";
      case "reset":
        this.paused = false;
        this.latencyMs = 0;
        this.burstUntil = 0;
        this.lostFrames = 0;
        return "all faults cleared";
    }
  }
}
