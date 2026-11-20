import { createContext, useContext } from "react";
import type { WorkerCommand, WorkerEvent } from "./messages";

/** The parts of a Worker the page uses. The real Worker and the fake used in tests both fit. */
export interface WorkerLike {
  postMessage(command: WorkerCommand): void;
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null;
  terminate(): void;
}

/** Starts the real worker. The `new Worker(new URL(...))` form is what lets the build find and bundle the worker file. */
const startRealWorker = (): WorkerLike => new Worker(new URL("./feedWorker.ts", import.meta.url), { type: "module" });

/**
 * How the page gets its worker. The real worker is the default; tests provide a fake one, because a real worker
 * would open a real connection to the server and cannot be controlled from a test.
 */
export const FeedWorkerContext = createContext<() => WorkerLike>(startRealWorker);

export const useWorkerFactory = (): (() => WorkerLike) => useContext(FeedWorkerContext);
