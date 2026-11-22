import { useState } from "react";
import { InstrumentPanel, type ChartControls } from "../chart/InstrumentPanel";
import { useOpenChart } from "../chart/useOpenChart";
import { ChaosPanel } from "../chaos/ChaosPanel";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { FeedAlerts } from "../components/FeedAlerts";
import { MiniChartLoading, SymbolDetailSkeleton, TableSkeleton } from "../components/skeletons";
import { ToolbarEnd } from "../components/ToolbarEnd";
import { Hud } from "../hud/Hud";
import { useHud } from "../hud/useHud";
import { useT } from "../i18n/useT";
import type { RfqPort } from "../rfq/bridge";
import { Toast } from "../watchlist/Toast";
import { useWatchlist } from "../watchlist/useWatchlist";
import { WatchlistPanel, type WatchlistItem } from "../watchlist/WatchlistPanel";
import { Workspace } from "../watchlist/Workspace";
import type { FeedStore } from "./feedStore";
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
function SelectedChart({ display, id, ...controls }: ChartControls & { display: Display; id: number }) {
  const { store, refreshMs } = display;
  const row = store.row(id);
  const instrument = store.instrument(id);
  if (!row || !instrument) return null;
  const { range, unavailable, ...panel } = controls;
  return (
    <InstrumentPanel
      id={id}
      symbol={row.sym}
      instrument={instrument}
      rfq={display.rfq}
      range={range}
      side={<OptimizedBook store={store} id={id} decimals={instrument.decimals} refreshMs={refreshMs} />}
      price={<OptimizedPriceLine store={store} id={id} decimals={instrument.decimals} prevClose={instrument.prevClose} variant="big" range={range} refreshMs={refreshMs} />}
      {...panel}
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
    </InstrumentPanel>
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
  const { selectedId, userChose, range, setRange, choose } = useOpenChart();
  const watchlist = useWatchlist();
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
        <ToolbarEnd hud={hud} watchlistOpen={watchlist.open} onToggleWatchlist={() => watchlist.setOpen(!watchlist.open)} />
      </div>
      <FeedAlerts badVersion={badVersion} referenceMissing={referenceMissing} />

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
