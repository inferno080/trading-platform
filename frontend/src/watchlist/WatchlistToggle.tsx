import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";

/** The button that shows or hides the watchlist panel. It lives in the toolbar, so it is there when the panel is not. */
export function WatchlistToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button type="button" className="watchlist-toggle" aria-expanded={open} aria-controls="watchlist-panel" onClick={onToggle}>
      <Icon name={open ? "eye" : "eye-off"} />
      {t("watchlist.toggle")}
    </button>
  );
}
