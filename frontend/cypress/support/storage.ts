// Simulates a browser where localStorage is unavailable (private windows, blocked site data), which makes
// every access throw.

const original = Object.getOwnPropertyDescriptor(window, "localStorage");

/** Make any access to window.localStorage throw. */
export function blockLocalStorage(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("localStorage is blocked");
    },
  });
}

/** Put the real localStorage back. */
export function restoreLocalStorage(): void {
  if (original) Object.defineProperty(window, "localStorage", original);
}
