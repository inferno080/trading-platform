import type { WorkerLike } from "../../src/feed/FeedWorkerContext";
import type { WorkerCommand, WorkerEvent } from "../../src/feed/messages";

/**
 * A stand-in for the Web Worker that tests drive by hand. A real worker would open a real connection to the
 * server on its own thread, where a test cannot see or control it.
 */
export class FakeWorker implements WorkerLike {
  static readonly instances: FakeWorker[] = [];

  /** The most recently started worker, which is the one the page is using. */
  static get latest(): FakeWorker {
    const worker = FakeWorker.instances.at(-1);
    if (!worker) throw new Error("No FakeWorker has been started yet");
    return worker;
  }

  posted: WorkerCommand[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(command: WorkerCommand): void {
    this.posted.push(command);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Test helper: the worker reports an event to the page. */
  emit(event: WorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>);
  }
}

/** The factory the page uses in tests. Its identity never changes, so the page does not restart its worker. */
export const createFakeWorker = (): WorkerLike => new FakeWorker();
