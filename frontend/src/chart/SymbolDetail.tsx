import { useEffect, useRef, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";
import { decimalFormatter } from "../lib/format";

interface SymbolDetailProps {
  symbol: string;
  name: string;
  currency: string;
  /** Static facts about the instrument that are not worth a column in the quotes: its smallest price move, and its decimals. */
  tickSize: number;
  decimals: number;
  /** Whether the symbol is on the watchlist, and how to put it on or take it off. */
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  /**
   * Move keyboard focus into the panel when it opens, and back when it closes. True when the person opened it (so they
   * land in it); false when it was open from the start, because taking focus as the page loads would be rude.
   */
  takeFocus: boolean;
  children: ReactNode; // the chart, which is what differs between the tabs
  /** The order book and the trades tape, side by side below the chart. */
  side: ReactNode;
  /** The current price and how it moved today, large, under the heading. */
  price: ReactNode;
  /** The button that opens the ticket for asking a dealer for a quote, beside the watchlist button. */
  ticket: ReactNode;
}

/**
 * The panel that opens above the quotes when a symbol is chosen. Shared by both tabs, so they look and behave the
 * same. Focus moves to its heading when it opens (so a keyboard or screen reader user lands in it) and goes back to
 * where it was when it closes; Escape closes it.
 */
export function SymbolDetail({ symbol, name, currency, tickSize, decimals, inWatchlist, onToggleWatchlist, onClose, takeFocus, children, side, price, ticket }: SymbolDetailProps) {
  const t = useT();
  const { locale } = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!takeFocus) return;
    const before = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => before?.focus?.();
  }, [takeFocus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape also closes the grid's filter pop-ups, and that should close only the pop-up.
      if (event.key === "Escape" && !event.defaultPrevented && !(event.target as Element).closest(".ag-popup")) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section className="symbol-detail" aria-labelledby="symbol-detail-title">
      <div className="symbol-detail-header">
        <h2 id="symbol-detail-title" ref={heading} tabIndex={-1}>
          {t("chart.title", { symbol })}
        </h2>
        <span className="symbol-detail-name">
          {name} · {currency} · {t("table.tickSize")} {decimalFormatter(locale, decimals).format(tickSize)} · {t("table.decimals")} {decimals}
        </span>
        <button type="button" className="symbol-detail-watch" onClick={onToggleWatchlist}>
          <Icon name={inWatchlist ? "minus" : "plus"} />
          {inWatchlist ? t("watchlist.remove") : t("watchlist.add")}
        </button>
        {ticket}
        <button type="button" className="symbol-detail-close" onClick={onClose}>
          <Icon name="x" />
          {t("chart.close")}
        </button>
      </div>
      <div className="symbol-detail-price">{price}</div>
      <div className="symbol-detail-body">
        <div className="symbol-detail-chart">{children}</div>
        <div className="symbol-detail-side">{side}</div>
      </div>
    </section>
  );
}
