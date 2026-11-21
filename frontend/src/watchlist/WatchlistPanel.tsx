import { useRef, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";
import { WATCHLIST_LIMIT } from "./useWatchlist";

export interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  chart: ReactNode; // the mini chart, which is what differs between the tabs
}

interface WatchlistPanelProps {
  items: WatchlistItem[];
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
}

/** What an entry is called: the name with the symbol in brackets after it, or just the symbol while the name is not known. */
const label = (item: WatchlistItem): string => (item.name ? `${item.name} (${item.symbol})` : item.symbol);

/** The watchlist: each symbol with a mini chart, a button to open its chart, and a button to remove it. */
export function WatchlistPanel({ items, onOpen, onRemove }: WatchlistPanelProps) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);

  return (
    <section id="watchlist-panel" className="watchlist" aria-labelledby="watchlist-title">
      <h2 id="watchlist-title" ref={heading} tabIndex={-1}>
        {t("watchlist.title")} <span className="watchlist-count">{t("watchlist.size", { count: items.length, limit: WATCHLIST_LIMIT })}</span>
      </h2>
      {items.length === 0 ? (
        <p className="watchlist-empty">{t("watchlist.empty")}</p>
      ) : (
        <ul className="watchlist-items">
          {items.map((item) => (
            <li className="watch-item" key={item.id}>
              <div className="watch-item-header">
                {/* One button opens the chart, and it covers the whole tile (see .watch-open::after), so the tile is the click target. */}
                <button type="button" className="watch-open" onClick={() => onOpen(item.id)} aria-label={t("watchlist.open", { label: label(item) })}>
                  {label(item)}
                </button>
                <button
                  type="button"
                  className="watch-remove"
                  aria-label={t("watchlist.removeItem", { symbol: item.symbol })}
                  onClick={() => {
                    onRemove(item.id);
                    heading.current?.focus(); // the item is gone, so keyboard focus goes to the list's heading, not nowhere
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
              {item.chart}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
