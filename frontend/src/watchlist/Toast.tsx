import { useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import type { ToastMessage } from "./useWatchlist";

/** How long a message stays. Long enough to read, and it waits while the pointer or keyboard focus is on it. */
const TOAST_MS = 7000;

/**
 * A short message that appears at the bottom of the screen and goes away by itself. The region is always on the page
 * and polite, so a screen reader announces each message when it appears without taking focus. It can be dismissed
 * with its button, and it stays while the pointer or keyboard focus is on it, so there is no rush to read it.
 */
export function Toast({ toast, onDismiss, durationMs = TOAST_MS }: { toast: ToastMessage | null; onDismiss: () => void; durationMs?: number }) {
  const t = useT();
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!toast || held) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [toast, held, onDismiss, durationMs]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div
          className="toast"
          key={toast.nonce}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={onDismiss}>
            {t("watchlist.dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
