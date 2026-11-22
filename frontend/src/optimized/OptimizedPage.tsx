import { useState } from "react";
import { DEFAULT_RANGE, type HistoryRange } from "../chart/range";
import { SymbolDetail } from "../chart/SymbolDetail";
import { MiniChartLoading, SymbolDetailSkeleton, TableSkeleton } from "../components/skeletons";
import { Hud, RecordButton } from "../hud/Hud";
import { useHud } from "../hud/useHud";
import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { Toast } from "../watchlist/Toast";
import { useWatchlist } from "../watchlist/useWatchlist";
import { WatchlistPanel, type WatchlistItem } from "../watchlist/WatchlistPanel";
import { WatchlistToggle } from "../watchlist/WatchlistToggle";
import { Workspace } from "../watchlist/Workspace";
import type { FeedStore } from "./feedStore";
import { FIRST_INSTRUMENT } from "../chart/series";
import { ChaosPanel } from "../chaos/ChaosPanel";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { RfqModal } from "../rfq/RfqModal";
import type { RfqPort } from "../rfq/bridge";
import { OptimizedBook } from "./OptimizedBook";
import { OptimizedChart } from "./OptimizedChart";
import { OptimizedMiniChart } from "./OptimizedMiniChart";
import { OptimizedPriceLine } from "./OptimizedPriceLine";
import { QuotesGrid } from "./QuotesGrid";
import { DEFAULT_REFRESH_SECONDS, MAX_REFRESH_SECONDS, parseRefreshSeconds } from "./refresh";
import { useFeedWorker } from "./useFeedWorker";

/** The number box for how often the grid redraws. It keeps what is typed, and only passes on a valid number. */
function RefreshControl({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const t = useT();
  const [text, setText] = useState(String(seconds));

  const type = (value: string) => {
    setText(value);
    const parsed = parseRefreshSeconds(value);
    if (parsed !== null) onChange(parsed);
  };

  return (
    <div className="refresh-control">
      <label htmlFor="refresh-seconds">{t("optimized.refresh")}</label>
      <input
        id="refresh-seconds"
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_REFRESH_SECONDS}
        step={0.5}
        value={text}
        onChange={(event) => type(event.target.value)}
        onBlur={() => setText(String(seconds))} // leaving the box with something invalid puts the real value back
      />
    </div>
  );
}

interface Display {
  store: FeedStore;
  rfq: RfqPort;
  refreshMs: number;
}

/** The panel with the price chart of one instrument, once the page knows its symbol and reference data. */
function SelectedChart({
  display,
  id,
  unavailable,
  inWatchlist,
  onToggleWatchlist,
  onClose,
  takeFocus,
  range,
  onRangeChange,
}: {
  display: Display;
  id: number;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  unavailable: boolean;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  takeFocus: boolean;
}) {
  const { store, refreshMs } = display;
  const row = store.row(id);
  const instrument = store.instrument(id);
  if (!row || !instrument) return null;
  return (
    <SymbolDetail
      symbol={row.sym}
      name={instrument.name}
      currency={instrument.currency}
      tickSize={instrument.tickSize}
      decimals={instrument.decimals}
      inWatchlist={inWatchlist}
      onToggleWatchlist={onToggleWatchlist}
      onClose={onClose}
      takeFocus={takeFocus}
      range={range}
      onRangeChange={onRangeChange}
      side={<OptimizedBook store={store} decimals={instrument.decimals} refreshMs={refreshMs} />}
      ticket={<RfqModal key={id} port={display.rfq} instrumentId={id} symbol={row.sym} decimals={instrument.decimals} />}
      price={
        <OptimizedPriceLine store={store} id={id} decimals={instrument.decimals} prevClose={instrument.prevClose} variant="big" range={range} refreshMs={refreshMs} />
      }
    >
      <OptimizedChart
        key={id}
        store={store}
        id={id}
        symbol={row.sym}
        decimals={instrument.decimals}
        prevClose={instrument.prevClose}
        unavailable={unavailable}
        range={range}
        refreshMs={refreshMs}
      />
    </SymbolDetail>
  );
}

/** The watchlist panel: a mini chart for each symbol on it, drawn from the store. */
function Watchlist({ display, ids, onOpen, onRemove }: { display: Display; ids: number[]; onOpen: (id: number) => void; onRemove: (id: number) => void }) {
  const { store, refreshMs } = display;
  const items: WatchlistItem[] = ids.map((id) => {
    const row = store.row(id);
    const instrument = store.instrument(id);
    return {
      id,
      symbol: row?.sym ?? `#${id}`,
      name: instrument?.name ?? "",
      chart:
        row && instrument ? (
          <OptimizedMiniChart store={store} id={id} symbol={row.sym} decimals={instrument.decimals} prevClose={instrument.prevClose} refreshMs={refreshMs} />
        ) : (
          <MiniChartLoading />
        ),
    };
  });
  return <WatchlistPanel items={items} onOpen={onOpen} onRemove={onRemove} />;
}

/**
 * The optimized iteration: a Web Worker owns the connection and conflates updates, the page pulls them once per
 * animation frame into a store, and AG Grid draws only the rows on screen, at a rate a person can read.
 */
export function OptimizedPage() {
  const t = useT();
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_REFRESH_SECONDS);
  // The chart of the first instrument (AAA, the most active) is open from the start; `userChose` is false until the person picks one.
  const [selectedId, setSelectedId] = useState<number | null>(FIRST_INSTRUMENT);
  const [userChose, setUserChose] = useState(false);
  const choose = (id: number | null) => {
    setUserChose(true);
    setSelectedId(id);
  };
  const watchlist = useWatchlist();
  const [range, setRange] = useState<HistoryRange>(DEFAULT_RANGE);
  const { state, store, rfq, retry, chaos } = useFeedWorker(selectedId, watchlist.ids, range);
  const { status, reconnect, session, scope, referenceCount, referenceMissing, badVersion, hasSnapshot } = state;
  const ready = hasSnapshot && referenceCount !== null;
  const hud = useHud(session, "optimized", refreshSeconds);
  const display: Display = { store, rfq, refreshMs: refreshSeconds * 1000 };

  return (
    // The scope name proves, to the tests, that the connection runs in a worker and not in the page.
    <section className="optimized-page" aria-label={t("optimized.region")} data-worker-scope={scope ?? undefined}>
      <div className="toolbar">
        {/* Status is text plus a dot, so it never relies on color alone. */}
        <ConnectionStatus status={status} reconnect={reconnect} onRetry={retry} />
        <RefreshControl seconds={refreshSeconds} onChange={setRefreshSeconds} />
        <div className="toolbar-end">
          <RecordButton hud={hud} />
          <WatchlistToggle open={watchlist.open} onToggle={() => watchlist.setOpen(!watchlist.open)} />
        </div>
      </div>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}

      <Hud hud={hud} refreshSeconds={refreshSeconds} />
      <ChaosPanel connected={status === "live"} onSend={chaos} />

      {/* The open chart (70%) beside the watchlist (30%) from the first moment, and the quotes below, across the full width. */}
      <Workspace open={watchlist.open} panel={<Watchlist display={display} ids={watchlist.ids} onOpen={choose} onRemove={watchlist.remove} />}>
        {selectedId !== null &&
          (ready ? (
            <SelectedChart
              display={display}
              id={selectedId}
              unavailable={state.chartUnavailable.includes(selectedId)}
              inWatchlist={watchlist.ids.includes(selectedId)}
              onToggleWatchlist={() => watchlist.toggle(selectedId)}
              onClose={() => choose(null)}
              takeFocus={userChose}
              range={range}
              onRangeChange={setRange}
            />
          ) : (
            <SymbolDetailSkeleton />
          ))}
      </Workspace>
      {ready ? (
        <QuotesGrid store={store} refreshMs={refreshSeconds * 1000} selectedId={selectedId} onSelect={choose} />
      ) : (
        <div role="status">
          <span className="visually-hidden">{t("table.waiting")}</span>
          <TableSkeleton />
        </div>
      )}
      <Toast toast={watchlist.toast} onDismiss={watchlist.dismissToast} />
    </section>
  );
}
