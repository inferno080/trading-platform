/** The wait before the first retry; each failed attempt doubles it. */
export const RECONNECT_BASE_MS = 1_000;

/** The longest wait between attempts. */
export const RECONNECT_MAX_MS = 15_000;

/**
 * How long to wait before attempt number `attempt` (1 for the first retry): doubling from 1 s up to 15 s, with "equal
 * jitter" (half the wait is fixed, half is random). The doubling stops a server that is struggling from being hammered;
 * the jitter stops every client that was cut off at the same moment from coming back at the same moment.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (attempt - 1));
  return Math.round(ceiling * (0.5 + random() / 2));
}

/** What the page shows while it waits: which attempt is next, and when it will be made (a time in ms, like Date.now()). */
export interface ReconnectInfo {
  attempt: number;
  retryAt: number;
}

/**
 * Decides when to try again after a connection is lost. It knows nothing about sockets: it is told when the connection was
 * lost and when it worked, and calls `reconnect` when it is time. Both tabs use it, so they behave the same.
 *
 *   lost() -> waits (backoff) -> reconnect() -> if that connection works: succeeded(), and the count starts again
 *                                            -> if it fails too: lost() again, with a longer wait
 */
export class Reconnector {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly reconnect: () => void,
    private readonly onWaiting: (info: ReconnectInfo) => void,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}

  /** Is a retry scheduled? */
  get waiting(): boolean {
    return this.timer !== undefined;
  }

  /** The connection was lost, or an attempt failed: schedule the next attempt, and say when it will be. */
  lost(): void {
    clearTimeout(this.timer);
    this.attempt++;
    const delay = backoffDelay(this.attempt, this.random);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.reconnect();
    }, delay);
    this.onWaiting({ attempt: this.attempt, retryAt: this.now() + delay });
  }

  /** The connection is working: the next loss starts again from the shortest wait. */
  succeeded(): void {
    this.attempt = 0;
  }

  /** Do not wait any longer: try now. Does nothing when no retry is scheduled. */
  retryNow(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.reconnect();
  }

  /** Stop retrying (the connection was closed on purpose, or the page is going away). */
  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.attempt = 0;
  }
}
