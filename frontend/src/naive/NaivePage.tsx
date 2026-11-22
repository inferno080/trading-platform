import { useState } from "react";
import { useIntl } from "react-intl";
import { BookPanel } from "../book/BookPanel";
import { priceSummary } from "../chart/price";
import { SymbolDetail } from "../chart/SymbolDetail";
import { PriceLine } from "../components/PriceLine";
import { MiniChartLoading, SymbolDetailSkeleton } from "../components/skeletons";
import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
import { ChaosPanel } from "../chaos/ChaosPanel";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { RfqModal } from "../rfq/RfqModal";
import type { RfqPort } from "../rfq/bridge";
import { PROTOCOL_VERSION, type InstrumentReference, type Quote } from "../protocol/messages";
import { Toast } from "../watchlist/Toast";
import { useWatchlist } from "../watchlist/useWatchlist";
import { WatchlistPanel, type WatchlistItem } from "../watchlist/WatchlistPanel";
import { WatchlistToggle } from "../watchlist/WatchlistToggle";
import { Workspace } from "../watchlist/Workspace";
import { NaiveChart } from "./NaiveChart";
import { FIRST_INSTRUMENT } from "../chart/series";
import { NaiveMiniChart } from "./NaiveMiniChart";
import { QuotesTable } from "./QuotesTable";
import { useNaiveFeed, type Book } from "./useNaiveFeed";

interface SelectedChartProps {
  quote: Quote | undefined;
  instrument: InstrumentReference | undefined;
  data: number[] | null;
  book: Book;
  rfq: RfqPort;
  unavailable: boolean;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  takeFocus: boolean;
}

/** The panel with the open symbol's chart: its skeleton until the page knows the symbol, then the panel itself. */
function SelectedChart({ quote, instrument, data, book, rfq, unavailable, inWatchlist, onToggleWatchlist, onClose, takeFocus }: SelectedChartProps) {
  const { locale } = useIntl();
  if (!quote || !instrument) return <SymbolDetailSkeleton />;
  return (
    <SymbolDetail
      symbol={quote.sym}
      name={instrument.name}
      currency={instrument.currency}
      tickSize={instrument.tickSize}
      decimals={instrument.decimals}
      inWatchlist={inWatchlist}
      onToggleWatchlist={onToggleWatchlist}
      onClose={onClose}
      takeFocus={takeFocus}
      side={<BookPanel depth={book.depth} tape={book.tape} decimals={instrument.decimals} />}
      ticket={<RfqModal key={quote.id} port={rfq} instrumentId={quote.id} symbol={quote.sym} decimals={instrument.decimals} />}
      price={<PriceLine summary={priceSummary(data ?? undefined, instrument.decimals, instrument.prevClose, locale)} variant="big" />}
    >
      <NaiveChart symbol={quote.sym} decimals={instrument.decimals} prevClose={instrument.prevClose} data={data} unavailable={unavailable} />
    </SymbolDetail>
  );
}

/** The naive iteration: owns its own feed, so it only holds a socket open while its tab is active. */
export function NaivePage() {
  const t = useT();
  // The chart of the first instrument (AAA, the most active) is open from the start; `userChose` is false until the person picks one.
  const [selectedId, setSelectedId] = useState<number | null>(FIRST_INSTRUMENT);
  const [userChose, setUserChose] = useState(false);
  const choose = (id: number | null) => {
    setUserChose(true);
    setSelectedId(id);
  };
  const watchlist = useWatchlist();
  const { retry, chaos, reconnect, status, session, quotes, reference, referenceMissing, badVersion, charts, chartUnavailable, book, rfq } = useNaiveFeed(selectedId, watchlist.ids);
  const selectedQuote = selectedId === null ? undefined : quotes[selectedId];
  const selectedInstrument = selectedId === null ? undefined : reference?.get(selectedId);

  // What the watchlist panel shows for each symbol on it: a mini chart, once the symbol is known.
  const items: WatchlistItem[] = watchlist.ids.map((id) => {
    const quote = quotes[id];
    const instrument = reference?.get(id);
    return {
      id,
      symbol: quote?.sym ?? `#${id}`,
      name: instrument?.name ?? "",
      chart: instrument && quote ? <NaiveMiniChart symbol={quote.sym} decimals={instrument.decimals} prevClose={instrument.prevClose} data={charts[id]} /> : <MiniChartLoading />,
    };
  });

  return (
    <>
      <div className="toolbar">
        {/* Status is text plus a dot, so it never relies on color alone. */}
        <ConnectionStatus status={status} reconnect={reconnect} onRetry={retry} />
        <WatchlistToggle open={watchlist.open} onToggle={() => watchlist.setOpen(!watchlist.open)} />
      </div>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}
      <Hud session={session} mode="naive" />
      <ChaosPanel connected={status === "live"} onSend={chaos} />
      {/* The open chart (70%) beside the watchlist (30%), and the quotes below, across the full width. */}
      <Workspace open={watchlist.open} panel={<WatchlistPanel items={items} onOpen={choose} onRemove={watchlist.remove} />}>
        {selectedId !== null && (
          <SelectedChart
            quote={selectedQuote}
            instrument={selectedInstrument}
            data={charts[selectedId] ?? null}
            book={book}
            rfq={rfq}
            unavailable={chartUnavailable.includes(selectedId)}
            inWatchlist={watchlist.ids.includes(selectedId)}
            onToggleWatchlist={() => watchlist.toggle(selectedId)}
            onClose={() => choose(null)}
            takeFocus={userChose}
          />
        )}
      </Workspace>
      <QuotesTable quotes={quotes} reference={reference} selectedId={selectedId} onSelect={choose} />
      <Toast toast={watchlist.toast} onDismiss={watchlist.dismissToast} />
    </>
  );
}
