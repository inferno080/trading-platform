/** The largest refresh interval the box accepts, in seconds. */
export const MAX_REFRESH_SECONDS = 60;

/** How often the grid redraws a row to begin with: slowly enough to read the numbers. */
export const DEFAULT_REFRESH_SECONDS = 1.5;

/** The seconds a person typed, or null when the box holds nothing usable (empty, not a number, negative, too large). */
export function parseRefreshSeconds(text: string): number | null {
  if (text.trim() === "") return null;
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_REFRESH_SECONDS ? seconds : null;
}
