import { useIntl } from "react-intl";
import { TableSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import { integerFormatter, priceFormatter } from "../lib/format";
import type { Quote } from "../protocol/messages";

interface QuotesTableProps {
  quotes: Quote[];
  pxScale: number;
}

// One table row. Deliberately not memoized: it re-renders on every feed message.
function QuoteRow({ quote, pxScale, price, int }: { quote: Quote; pxScale: number; price: Intl.NumberFormat; int: Intl.NumberFormat }) {
  return (
    <tr>
      <th scope="row">{quote.sym}</th>
      <td>{price.format(quote.bid / pxScale)}</td>
      <td>{price.format(quote.ask / pxScale)}</td>
      <td>{price.format((quote.ask - quote.bid) / pxScale)}</td>
      <td>{price.format(quote.last / pxScale)}</td>
      <td>{int.format(quote.bidSz)}</td>
      <td>{int.format(quote.askSz)}</td>
      <td>{int.format(quote.vol)}</td>
    </tr>
  );
}

/** Plain HTML table of every instrument: the naive rendering baseline (5,000 rows, no virtualization). */
export function QuotesTable({ quotes, pxScale }: QuotesTableProps) {
  const { locale } = useIntl();
  const t = useT();
  const price = priceFormatter(locale, pxScale);
  const int = integerFormatter(locale);

  if (quotes.length === 0) {
    // Shimmering placeholder; screen readers get the text instead.
    return (
      <div role="status">
        <span className="visually-hidden">{t("table.waiting")}</span>
        <TableSkeleton />
      </div>
    );
  }

  return (
    // Focusable so keyboard users can scroll the table (a scrollable region must be reachable).
    <div className="table-wrap" role="region" aria-label={t("table.region")} tabIndex={0}>
      <table>
        <caption className="visually-hidden">{t("table.caption", { count: quotes.length })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("table.symbol")}</th>
            <th scope="col">{t("table.bid")}</th>
            <th scope="col">{t("table.ask")}</th>
            <th scope="col">{t("table.spread")}</th>
            <th scope="col">{t("table.last")}</th>
            <th scope="col">{t("table.bidSize")}</th>
            <th scope="col">{t("table.askSize")}</th>
            <th scope="col">{t("table.volume")}</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <QuoteRow key={q.id} quote={q} pxScale={pxScale} price={price} int={int} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
