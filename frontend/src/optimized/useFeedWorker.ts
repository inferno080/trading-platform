import { useEffect, useRef, useState } from "react";
import { useWorkerFactory } from "../feed/FeedWorkerContext";
import type { FeedStatus, WorkerEvent } from "../feed/messages";
import type { WorkerLike } from "../feed/FeedWorkerContext";
import { WS_URL } from "../feed/url";
import { collector } from "../hud/collector";
import type { Session } from "../protocol/messages";
import { FeedStore } from "./feedStore";

/** What the page shows about the connection. The prices themselves live in the store, not here. */
export interface FeedWorkerState {
  status: FeedStatus;
  session: Session | null;
  /** The name of the worker's global scope, once it has started; shows that the connection is not on the page's thread. */
  scope: string | null;
  /** How many instruments the reference data covers, once it has arrived. */
  referenceCount: number | null;
  /** True when the reference data did not arrive in time. */
  referenceMissing: boolean;
  /** The protocol version the server spoke, when it was not one this client understands. */
  badVersion: number | null;
  /** True once the first snapshot has arrived. */
  hasSnapshot: boolean;
  /** The instrument the server has no price history for, when the chart asked for one. */
  chartUnavailable: number | null;
}

export const initialFeedState: FeedWorkerState = {
  status: "connecting",
  session: null,
  scope: null,
  referenceCount: null,
  referenceMissing: false,
  badVersion: null,
  hasSnapshot: false,
  chartUnavailable: null,
};

/**
 * The new state after one event from the worker. Batches change nothing here, so the page does not render
 * 60 times a second: their rows go to the store and the grid draws them.
 */
export function reduceWorkerEvent(state: FeedWorkerState, event: WorkerEvent): FeedWorkerState {
  switch (event.type) {
    case "ready":
      return { ...state, scope: event.scope };
    case "status":
      return { ...state, status: event.status };
    case "session":
      return { ...state, session: event.session };
    case "badVersion":
      return { ...state, badVersion: event.version };
    case "reference":
      return { ...state, referenceCount: event.instruments.length, referenceMissing: false }; // arriving late still clears the warning
    case "referenceTimeout":
      return { ...state, referenceMissing: true };
    case "snapshot":
      return state.hasSnapshot ? state : { ...state, hasSnapshot: true };
    case "batch":
      return state;
    case "chartUnavailable":
      return { ...state, chartUnavailable: event.id };
  }
}

/** How often rows that have gone quiet are marked as stale. */
const STALE_SWEEP_MS = 1_000;

/** If the worker has not answered a request for updates in this long, ask again rather than wait for ever. */
export const PULL_TIMEOUT_MS = 2_000;

/**
 * After the page comes back to the front, wait this long before marking rows stale. While it was hidden no frames
 * were drawn, so no updates were asked for; they arrive in the first moments after it returns, and rows would
 * wrongly look stale until then.
 */
export const RESUME_GRACE_MS = 1_000;

/**
 * Runs the connection in a Web Worker for as long as the component is mounted, and feeds what it reports into a
 * store. Leaving the page terminates the worker, which also ends its connection.
 *
 * Once per animation frame the page asks the worker for what changed ("pull"), and never has more than one
 * request outstanding. The pace is therefore set by the page: if drawing is slow, frames are late, requests are
 * late, and the worker simply conflates more.
 */
export function useFeedWorker(selectedId: number | null = null): { state: FeedWorkerState; store: FeedStore } {
  const createWorker = useWorkerFactory();
  const [state, setState] = useState<FeedWorkerState>(initialFeedState);
  const [store] = useState(() => new FeedStore());
  const worker = useRef<WorkerLike | null>(null);
  const selected = useRef(selectedId); // what a worker started later should be told

  useEffect(() => {
    collector.reset(); // start clean: counters from a previously active tab must not leak in
    const connection = createWorker();
    worker.current = connection;
    let pullOutstanding = false;
    let pullSentAt = 0;
    let visibleSince = Date.now();

    connection.onmessage = (event) => {
      const message = event.data;
      if (message.type === "reference") store.setReference(message.instruments, Date.now());
      else if (message.type === "snapshot") store.setSnapshot(message.quotes, Date.now());
      else if (message.type === "batch") {
        pullOutstanding = false;
        collector.onBatch(message.stats);
        store.applyBatch(message.updates, Date.now());
        if (message.chart) store.setChart(message.chart);
      }
      setState((previous) => reduceWorkerEvent(previous, message));
    };
    connection.postMessage({ type: "connect", url: WS_URL });
    if (selected.current !== null) connection.postMessage({ type: "select", id: selected.current });

    let frame = requestAnimationFrame(function onFrame() {
      const now = Date.now();
      // One request at a time, but never wait for an answer that is not coming.
      if (!pullOutstanding || now - pullSentAt > PULL_TIMEOUT_MS) {
        pullOutstanding = true;
        pullSentAt = now;
        connection.postMessage({ type: "pull" });
      }
      frame = requestAnimationFrame(onFrame);
    });

    const onVisibility = () => {
      if (!document.hidden) visibleSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const sweep = window.setInterval(() => {
      const now = Date.now();
      // Rows only look stale when the page was in a position to hear about updates.
      if (!document.hidden && now - visibleSince > RESUME_GRACE_MS) store.sweepStale(now);
    }, STALE_SWEEP_MS);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(sweep);
      document.removeEventListener("visibilitychange", onVisibility);
      connection.onmessage = null;
      connection.terminate();
      worker.current = null;
    };
  }, [createWorker, store]);

  // Choosing another instrument (or none) starts a fresh chart: the old one is dropped and the worker is told.
  useEffect(() => {
    selected.current = selectedId;
    store.setChart(null);
    worker.current?.postMessage({ type: "select", id: selectedId });
  }, [selectedId, store]);

  return { state, store };
}
