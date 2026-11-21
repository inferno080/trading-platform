import { useIntl } from "react-intl";
import { BookSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import { decimalFormatter, integerFormatter, timeFormatter } from "../lib/format";
import type { Depth, DepthLevel, Trade } from "../protocol/messages";

/** Levels shown on each side of the order book. The server sends more; this is what fits comfortably. */
export const LADDER_LEVELS = 10;
/** Trades shown on the tape. */
export const TAPE_ROWS = 10;

/** The order book: bids on the left and asks on the right, best prices at the top, each size with a bar behind it. */
function OrderBook({ bids, asks, decimals }: { bids: DepthLevel[]; asks: DepthLevel[]; decimals: number }) {
  const t = useT();
  const { locale } = useIntl();
  const price = decimalFormatter(locale, decimals);
  const integer = integerFormatter(locale);
  const scale = 10 ** decimals;
  const rows = Array.from({ length: LADDER_LEVELS }, (_, level) => ({ bid: bids[level], ask: asks[level] }));
  const largest = Math.max(1, ...rows.flatMap(({ bid, ask }) => [bid?.[1] ?? 0, ask?.[1] ?? 0])); // the longest bar is the biggest size

  // A size, with a bar behind it that is as long as the size is large compared with the others on screen.
  const size = (level: DepthLevel | undefined, side: "bid" | "ask") => (
    <td className={`book-size book-${side}`} style={{ "--bar": `${level ? (level[1] / largest) * 100 : 0}%` } as React.CSSProperties}>
      {level ? integer.format(level[1]) : ""}
    </td>
  );

  return (
    <table className="book">
      <caption className="visually-hidden">{t("book.caption")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("book.bidSize")}</th>
          <th scope="col">{t("book.bid")}</th>
          <th scope="col">{t("book.ask")}</th>
          <th scope="col">{t("book.askSize")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ bid, ask }, level) => (
          <tr key={level} className={level === 0 ? "book-best" : undefined}>
            {size(bid, "bid")}
            <td>{bid ? price.format(bid[0] / scale) : ""}</td>
            <td>{ask ? price.format(ask[0] / scale) : ""}</td>
            {size(ask, "ask")}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The most recent trades, newest first. The side is written out (Buy, Sell) as well as colored. */
function TradeTape({ trades, decimals }: { trades: Trade[]; decimals: number }) {
  const t = useT();
  const { locale } = useIntl();
  const price = decimalFormatter(locale, decimals);
  const integer = integerFormatter(locale);
  const time = timeFormatter(locale);
  const scale = 10 ** decimals;

  if (trades.length === 0) return <p className="book-empty">{t("tape.empty")}</p>;
  return (
    <table className="tape">
      <caption className="visually-hidden">{t("tape.caption")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("tape.time")}</th>
          <th scope="col">{t("tape.price")}</th>
          <th scope="col">{t("tape.size")}</th>
          <th scope="col">{t("tape.side")}</th>
        </tr>
      </thead>
      <tbody>
        {/* Keyed by position: two trades in the same tick can match in time, price, size and side, and rows that share a
            key are not replaced properly. The tape is only ever "the latest ten", so each row simply takes the next trade. */}
        {trades.slice(0, TAPE_ROWS).map((trade, row) => (
          <tr key={row} className={`tape-${trade.side}`}>
            <td>{time.format(trade.ts)}</td>
            <td>{price.format(trade.price / scale)}</td>
            <td>{integer.format(trade.size)}</td>
            <td>{trade.side === "buy" ? `▲ ${t("tape.buy")}` : `▼ ${t("tape.sell")}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface BookPanelProps {
  depth: Pick<Depth, "bids" | "asks"> | null;
  tape: Trade[];
  decimals: number;
}

/** The order book and the trades tape of the open symbol, side by side (one above the other on a narrow screen). */
export function BookPanel({ depth, tape, decimals }: BookPanelProps) {
  const t = useT();
  if (!depth) return <BookSkeleton />; // until the first order book arrives
  return (
    <div className="book-panel">
      <section aria-labelledby="book-title">
        <h3 id="book-title">{t("book.title")}</h3>
        <OrderBook bids={depth.bids} asks={depth.asks} decimals={decimals} />
      </section>
      <section aria-labelledby="tape-title">
        <h3 id="tape-title">{t("tape.title")}</h3>
        <TradeTape trades={tape} decimals={decimals} />
      </section>
    </div>
  );
}
