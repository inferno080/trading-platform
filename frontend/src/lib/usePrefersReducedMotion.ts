import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// Re-run whenever the user changes the OS "reduce motion" setting.
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** True when the user has asked the OS to reduce motion; used to turn off decorative animation (WCAG 2.3.3). */
export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
