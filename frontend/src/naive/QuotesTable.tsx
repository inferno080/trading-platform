import { useIntl } from "react-intl";
import { TableSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import { integerFormatter, percentFormatter, priceFormatter } from "../lib/format";
import type { InstrumentReference, Quote } from "../protocol/messages";
import type { ReferenceById } from "./useNaiveFeed";

interface QuotesTableProps {
  quotes: Quote[];
  /** Static facts about each instrument; null until the server has replied to the request for them. */
  reference: ReferenceById | null;
  /** The instrument whose chart is open, if any, and how to open one. */
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}

const COLUMN_COUNT = 12; // symbol, name, currency, bid, ask, spread, last, prev close, chg %, bid size, ask size, volume

interface QuoteRowProps {
  quote: Quote;
  instrument: InstrumentReference | undefined;
  locale: string;
  integer: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  noReference: string;
  selected: boolean;
  onSelect: (id: number) => void;
}

// One table row. Deliberately not memoized: it re-renders on every feed message.
function QuoteRow({ quote, instrument, locale, integer, percent, noReference, selected, onSelect }: QuoteRowProps) {
  if (!instrument) {
    // Without the instrument's decimals the prices cannot be read, so show that instead of wrong numbers.
    return (
      <tr>
        <th scope="row">{quote.sym}</th>
        <td colSpan={COLUMN_COUNT - 1}>{noReference}</td>
      </tr>
    );
  }
  const scale = 10 ** instrument.decimals; // wire units per real price unit, specific to this instrument
  const price = priceFormatter(locale, instrument.decimals);
  return (
    // Clicking anywhere on the row opens the chart; the symbol is also a real button, which is the keyboard way in.
    <tr className={selected ? "row-selected" : undefined} onClick={() => onSelect(quote.id)}>
      <th scope="row">
        <button type="button" className="symbol-button" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(quote.id); }}>
          {quote.sym}
        </button>
      </th>
      <td className="text-col">{instrument.name}</td>
      <td className="text-col">{instrument.currency}</td>
      <td>{price.format(quote.bid / scale)}</td>
      <td>{price.format(quote.ask / scale)}</td>
      <td>{price.format((quote.ask - quote.bid) / scale)}</td>
      <td>{price.format(quote.last / scale)}</td>
      <td>{price.format(instrument.prevClose / scale)}</td>
      <td>{instrument.prevClose === 0 ? "–" : percent.format(quote.last / instrument.prevClose - 1)}</td>
      <td>{integer.format(quote.bidSz)}</td>
      <td>{integer.format(quote.askSz)}</td>
      <td>{integer.format(quote.vol)}</td>
    </tr>
  );
}

/** Plain HTML table of every instrument: the naive rendering baseline (5,000 rows, no virtualization). */
const IGNORE = () => undefined;

export function QuotesTable({ quotes, reference, selectedId = null, onSelect = IGNORE }: QuotesTableProps) {
  const { locale } = useIntl();
  const t = useT();

  if (quotes.length === 0 || reference === null) {
    // Shimmering placeholder; screen readers get the text instead.
    return (
      <div role="status">
        <span className="visually-hidden">{t("table.waiting")}</span>
        <TableSkeleton />
      </div>
    );
  }

  const integer = integerFormatter(locale);
  const percent = percentFormatter(locale);
  const noReference = t("table.noReference");

  return (
    // Focusable so keyboard users can scroll the table (a scrollable region must be reachable).
    <div className="table-wrap" role="region" aria-label={t("table.region")} tabIndex={0}>
      <table>
        <caption className="visually-hidden">{t("table.caption", { count: quotes.length })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("table.symbol")}</th>
            <th scope="col" className="text-col">{t("table.name")}</th>
            <th scope="col" className="text-col">{t("table.currency")}</th>
            <th scope="col">{t("table.bid")}</th>
            <th scope="col">{t("table.ask")}</th>
            <th scope="col">{t("table.spread")}</th>
            <th scope="col">{t("table.last")}</th>
            <th scope="col">{t("table.prevClose")}</th>
            <th scope="col">{t("table.change")}</th>
            <th scope="col">{t("table.bidSize")}</th>
            <th scope="col">{t("table.askSize")}</th>
            <th scope="col">{t("table.volume")}</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <QuoteRow
              key={q.id}
              quote={q}
              instrument={reference.get(q.id)}
              locale={locale}
              integer={integer}
              percent={percent}
              noReference={noReference}
              selected={q.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
