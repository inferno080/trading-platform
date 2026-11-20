import { useState } from "react";
import { SymbolDetail } from "../chart/SymbolDetail";
import { MiniChartLoading, SymbolDetailSkeleton } from "../components/skeletons";
import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
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
import { useNaiveFeed } from "./useNaiveFeed";

interface SelectedChartProps {
  quote: Quote | undefined;
  instrument: InstrumentReference | undefined;
  data: number[] | null;
  unavailable: boolean;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  takeFocus: boolean;
}

/** The panel with the open symbol's chart: its skeleton until the page knows the symbol, then the panel itself. */
function SelectedChart({ quote, instrument, data, unavailable, inWatchlist, onToggleWatchlist, onClose, takeFocus }: SelectedChartProps) {
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
    >
      <NaiveChart symbol={quote.sym} decimals={instrument.decimals} data={data} unavailable={unavailable} />
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
  const { status, session, quotes, reference, referenceMissing, badVersion, charts, chartUnavailable } = useNaiveFeed(selectedId, watchlist.ids);
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
      chart: instrument && quote ? <NaiveMiniChart symbol={quote.sym} decimals={instrument.decimals} data={charts[id]} /> : <MiniChartLoading />,
    };
  });

  return (
    <>
      <div className="toolbar">
        {/* Status is text plus a dot, so it never relies on color alone. */}
        <span className="status" data-status={status} role="status">
          {t(`status.${status}`)}
        </span>
        <WatchlistToggle count={watchlist.ids.length} open={watchlist.open} onToggle={() => watchlist.setOpen(!watchlist.open)} />
      </div>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}
      <Hud session={session} mode="naive" />
      {selectedId !== null && (
        <SelectedChart
          quote={selectedQuote}
          instrument={selectedInstrument}
          data={charts[selectedId] ?? null}
          unavailable={chartUnavailable.includes(selectedId)}
          inWatchlist={watchlist.ids.includes(selectedId)}
          onToggleWatchlist={() => watchlist.toggle(selectedId)}
          onClose={() => choose(null)}
          takeFocus={userChose}
        />
      )}
      <Workspace open={watchlist.open} panel={<WatchlistPanel items={items} onOpen={choose} onRemove={watchlist.remove} />}>
        <QuotesTable quotes={quotes} reference={reference} selectedId={selectedId} onSelect={choose} />
      </Workspace>
      <Toast toast={watchlist.toast} onDismiss={watchlist.dismissToast} />
    </>
  );
}
