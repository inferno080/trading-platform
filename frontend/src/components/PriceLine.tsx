import { useT } from "../i18n/useT";
import type { PriceSummary } from "../chart/price";
import type { HistoryRange } from "../protocol/messages";

/**
 * The current price, large, then an arrow and the percentage it has moved, then the amount and "Today" (or the range, such as "1 month") in smaller text,
 * for example "912.76  ▲ +0.62%  (+5.65) Today". The move is green when up and red when down, and the arrow says the same
 * without color. Empty (but keeping its height, so nothing jumps) until there is data.
 */
export function PriceLine({ summary, variant, range = "5m" }: { summary: PriceSummary | null; variant: "big" | "small"; range?: HistoryRange }) {
  const t = useT();
  const arrow = summary?.direction === 1 ? "▲" : summary?.direction === -1 ? "▼" : ""; // eslint-disable-line sonarjs/no-nested-conditional
  return (
    <div className={`price-line price-line-${variant}`} data-direction={summary?.direction ?? 0}>
      {summary && (
        <>
          <span className="price-now">{summary.price}</span>
          {summary.percent !== null && (
            <>
              <span className="price-move">
                <span aria-hidden="true">{arrow}</span> {summary.percent}
              </span>
              <span className="price-today">
                <span className="price-change">({summary.change})</span> {t(range === "5m" || range === "1d" ? "price.today" : `price.period.${range}`)}
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}
