// A controllable window.matchMedia, so tests can switch OS-level settings such as dark mode or reduced motion.

const original = window.matchMedia;

export interface MediaController {
  /** Change a media query's result and notify anything listening to it. */
  set(query: string, matches: boolean): void;
}

/** Replace window.matchMedia; `initial` maps media queries to their starting result (default false). */
export function installMatchMedia(initial: Record<string, boolean> = {}): MediaController {
  const state = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();

  const listenersFor = (query: string): Set<() => void> => {
    let set = listeners.get(query);
    if (!set) {
      set = new Set();
      listeners.set(query, set);
    }
    return set;
  };

  window.matchMedia = ((query: string) => ({
    get matches() {
      return state.get(query) ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, callback: () => void) => listenersFor(query).add(callback),
    removeEventListener: (_type: string, callback: () => void) => listenersFor(query).delete(callback),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return {
    set(query, matches) {
      state.set(query, matches);
      listenersFor(query).forEach((callback) => callback());
    },
  };
}

/** Put the real window.matchMedia back. */
export const restoreMatchMedia = (): void => {
  window.matchMedia = original;
};
