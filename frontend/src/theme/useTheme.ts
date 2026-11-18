import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// The saved choice, or null if the user never picked one (then the OS setting decides).
const readStored = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // storage can be blocked
  }
};

// Re-run when the OS switches between light and dark.
const subscribeToSystem = (onChange: () => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** Current theme and a toggle. Follows the OS until the user picks one; then remembers the choice. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [stored, setStored] = useState<Theme | null>(readStored);
  const systemDark = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  const theme: Theme = stored ?? (systemDark ? "dark" : "light");

  // The CSS tokens react to data-theme on <html>; with no choice made, the attribute is absent and the OS decides.
  useEffect(() => {
    if (stored) document.documentElement.dataset.theme = stored;
    else delete document.documentElement.dataset.theme;
  }, [stored]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice just won't persist.
    }
  }, [theme]);

  return { theme, toggle };
}
