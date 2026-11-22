import { useIntl } from "react-intl";
import { BookPanel } from "../book/BookPanel";
import { priceSummary } from "../chart/price";
import { InstrumentPanel, type ChartControls } from "../chart/InstrumentPanel";
import { baselineFor, LIVE_RANGE, rangeKey } from "../chart/range";
import { useOpenChart } from "../chart/useOpenChart";
import { ChaosPanel } from "../chaos/ChaosPanel";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { FeedAlerts } from "../components/FeedAlerts";
import { PriceLine } from "../components/PriceLine";
import { MiniChartLoading, SymbolDetailSkeleton } from "../components/skeletons";
import { ToolbarEnd } from "../components/ToolbarEnd";
import { Hud } from "../hud/Hud";
import { useHud } from "../hud/useHud";
import type { InstrumentReference, Quote, SessionInfo } from "../protocol/messages";
import type { RfqPort } from "../rfq/bridge";
import { Toast } from "../watchlist/Toast";
import { useWatchlist } from "../watchlist/useWatchlist";
import { WatchlistPanel, type WatchlistItem } from "../watchlist/WatchlistPanel";
import { Workspace } from "../watchlist/Workspace";
import { NaiveChart } from "./NaiveChart";
import { NaiveMiniChart } from "./NaiveMiniChart";
import { QuotesTable } from "./QuotesTable";
import type { Book } from "./feedState";
import { useNaiveFeed } from "./useNaiveFeed";

interface SelectedChartProps extends ChartControls {
  quote: Quote | undefined;
  instrument: InstrumentReference | undefined;
  data: number[] | null;
  session: SessionInfo | undefined;
  book: Book;
  rfq: RfqPort;
}

/** The panel with the open symbol's chart: its skeleton until the page knows the symbol, then the panel itself. */
function SelectedChart({ quote, instrument, data, session, book, rfq, ...controls }: SelectedChartProps) {
  const { locale } = useIntl();
  if (!quote || !instrument) return <SymbolDetailSkeleton />;
  const { range, unavailable, ...panel } = controls;
  return (
    <InstrumentPanel
      id={quote.id}
      symbol={quote.sym}
      instrument={instrument}
      rfq={rfq}
      range={range}
      side={<BookPanel depth={book.depth} tape={book.tape} decimals={instrument.decimals} timeZone={session?.timeZone} />}
      price={<PriceLine summary={priceSummary(data ?? undefined, instrument.decimals, baselineFor(range, data, instrument.prevClose), locale)} variant="big" range={range} />}
      {...panel}
    >
      <NaiveChart symbol={quote.sym} decimals={instrument.decimals} prevClose={instrument.prevClose} data={data} range={range} session={session} unavailable={unavailable} />
    </InstrumentPanel>
  );
}

/** The naive iteration: owns its own feed, so it only holds a socket open while its tab is active. */
export function NaivePage() {
  const { selectedId, userChose, range, setRange, choose } = useOpenChart();
  const watchlist = useWatchlist();
  const { sessions, retry, chaos, reconnect, status, session, quotes, reference, referenceMissing, badVersion, charts, rangeCharts, chartUnavailable, book, rfq } = useNaiveFeed(selectedId, watchlist.ids, range);
  const hud = useHud(session, "naive");
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
        <ToolbarEnd hud={hud} watchlistOpen={watchlist.open} onToggleWatchlist={() => watchlist.setOpen(!watchlist.open)} />
      </div>
      <FeedAlerts badVersion={badVersion} referenceMissing={referenceMissing} />
      <Hud hud={hud} />
      <ChaosPanel connected={status === "live"} onSend={chaos} />
      {/* The open chart (70%) beside the watchlist (30%), and the quotes below, across the full width. */}
      <Workspace open={watchlist.open} panel={<WatchlistPanel items={items} onOpen={choose} onRemove={watchlist.remove} />}>
        {selectedId !== null && (
          <SelectedChart
            quote={selectedQuote}
            instrument={selectedInstrument}
            data={(range === LIVE_RANGE ? charts[selectedId] : rangeCharts[rangeKey(selectedId, range)]) ?? null}
            range={range}
            onRangeChange={setRange}
            session={selectedId === null ? undefined : sessions[selectedId]}
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
