/**
 * Calls `onTick` every `intervalMs` milliseconds without drifting.
 *
 * setInterval waits a full interval after each call, so every small delay adds up and the real rate ends up
 * slightly low. This keeps an absolute schedule (start + 1 interval, start + 2 intervals, ...) and sleeps
 * only until the next scheduled moment, so a late tick is made up for by a shorter wait.
 *
 * Returns a function that stops the ticker.
 */
export function startTicker(intervalMs: number, onTick: () => void): () => void {
  let nextDue = performance.now() + intervalMs; // when the next tick is scheduled
  let timer: NodeJS.Timeout;

  const run = (): void => {
    onTick();
    nextDue += intervalMs;
    const now = performance.now();
    // If we are a whole tick or more behind (the process stalled), skip ahead instead of firing a burst
    // of catch-up ticks, which would flood the clients.
    if (nextDue < now) nextDue = now + intervalMs;
    timer = setTimeout(run, nextDue - now);
  };

  timer = setTimeout(run, intervalMs);
  return () => clearTimeout(timer);
}
