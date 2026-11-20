import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";

/** The most symbols the watchlist holds. Each one is also a subscription on the server, which allows 5 per client. */
export const WATCHLIST_LIMIT = 4;

const IDS_KEY = "watchlist";
const OPEN_KEY = "watchlist.open";

// Storage can be blocked, so every access is allowed to fail.
function readIds(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(IDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(Number.isInteger).slice(0, WATCHLIST_LIMIT) : [];
  } catch {
    return [];
  }
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false"; // open unless the user collapsed it
  } catch {
    return true;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not saved: the watchlist still works for this visit
  }
}

export interface ToastMessage {
  text: string;
  nonce: number; // changes with every message, so the same message shown again is shown (and announced) again
}

/**
 * The watchlist: which symbols are on it (kept between visits, and shared by both tabs), whether its panel is open, and
 * the message to show when someone tries to add one too many.
 */
export function useWatchlist() {
  const t = useT();
  const [ids, setIds] = useState<number[]>(readIds);
  const [open, setOpen] = useState<boolean>(readOpen);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => save(IDS_KEY, JSON.stringify(ids)), [ids]);
  useEffect(() => save(OPEN_KEY, String(open)), [open]);

  /** Add the symbol, or take it off if it is already there. A full list says so in a toast instead. */
  const toggle = useCallback(
    (id: number) => {
      if (ids.includes(id)) {
        setIds(ids.filter((existing) => existing !== id));
      } else if (ids.length >= WATCHLIST_LIMIT) {
        setToast({ text: t("watchlist.full", { limit: WATCHLIST_LIMIT }), nonce: Date.now() });
      } else {
        setIds([...ids, id]);
        setOpen(true); // so the new one can be seen
      }
    },
    [ids, t],
  );

  const remove = useCallback((id: number) => setIds((previous) => previous.filter((existing) => existing !== id)), []);
  const dismissToast = useCallback(() => setToast(null), []);

  return { ids, open, setOpen, toggle, remove, toast, dismissToast };
}
