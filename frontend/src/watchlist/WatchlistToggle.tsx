import { useT } from "../i18n/useT";

/** The button that shows or hides the watchlist panel. It lives in the toolbar, so it is there when the panel is not. */
export function WatchlistToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button type="button" className="watchlist-toggle" aria-expanded={open} aria-controls="watchlist-panel" onClick={onToggle}>
      {t("watchlist.toggle", { count })}
    </button>
  );
}
