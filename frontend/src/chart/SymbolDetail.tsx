import { useEffect, useRef, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { useT } from "../i18n/useT";
import { decimalFormatter } from "../lib/format";

interface SymbolDetailProps {
  symbol: string;
  name: string;
  currency: string;
  /** Static facts about the instrument that are not worth a column in the quotes: its smallest price move, and its decimals. */
  tickSize: number;
  decimals: number;
  onClose: () => void;
  children: ReactNode; // the chart, which is what differs between the tabs
}

/**
 * The panel that opens above the quotes when a symbol is chosen. Shared by both tabs, so they look and behave the
 * same. Focus moves to its heading when it opens (so a keyboard or screen reader user lands in it) and goes back to
 * where it was when it closes; Escape closes it.
 */
export function SymbolDetail({ symbol, name, currency, tickSize, decimals, onClose, children }: SymbolDetailProps) {
  const t = useT();
  const { locale } = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => before?.focus?.();
  }, []);

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
        <button type="button" className="symbol-detail-close" onClick={onClose}>
          {t("chart.close")}
        </button>
      </div>
      {children}
    </section>
  );
}
