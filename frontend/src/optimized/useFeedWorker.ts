import { useEffect, useState } from "react";
import { useWorkerFactory } from "../feed/FeedWorkerContext";
import type { FeedStatus, WorkerEvent } from "../feed/messages";
import { WS_URL } from "../feed/url";
import type { Session } from "../protocol/messages";

/** What the page knows about the connection, as reported by the worker. */
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
}

export const initialFeedState: FeedWorkerState = {
  status: "connecting",
  session: null,
  scope: null,
  referenceCount: null,
  referenceMissing: false,
  badVersion: null,
};

/** The new state after one event from the worker. */
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
      return { ...state, referenceCount: event.count, referenceMissing: false }; // arriving late still clears the warning
    case "referenceTimeout":
      return { ...state, referenceMissing: true };
  }
}

/**
 * Runs the connection in a Web Worker for as long as the component is mounted. Leaving the page terminates the
 * worker, which also ends its connection, so an inactive tab holds no thread and no socket.
 */
export function useFeedWorker(): FeedWorkerState {
  const createWorker = useWorkerFactory();
  const [state, setState] = useState<FeedWorkerState>(initialFeedState);

  useEffect(() => {
    const worker = createWorker();
    worker.onmessage = (event) => setState((previous) => reduceWorkerEvent(previous, event.data));
    worker.postMessage({ type: "connect", url: WS_URL });
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [createWorker]);

  return state;
}
