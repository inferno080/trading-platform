import { useState } from "react";
import { SymbolDetail } from "../chart/SymbolDetail";
import { MiniChartLoading, SymbolDetailSkeleton, TableSkeleton } from "../components/skeletons";
import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { Toast } from "../watchlist/Toast";
import { useWatchlist } from "../watchlist/useWatchlist";
import { WatchlistPanel, type WatchlistItem } from "../watchlist/WatchlistPanel";
import { WatchlistToggle } from "../watchlist/WatchlistToggle";
import { Workspace } from "../watchlist/Workspace";
import type { FeedStore } from "./feedStore";
import { FIRST_INSTRUMENT } from "../chart/series";
import { OptimizedChart } from "./OptimizedChart";
import { OptimizedMiniChart } from "./OptimizedMiniChart";
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
        aria-describedby="refresh-hint"
        onChange={(event) => type(event.target.value)}
        onBlur={() => setText(String(seconds))} // leaving the box with something invalid puts the real value back
      />
      <span id="refresh-hint" className="refresh-hint">
        {t("optimized.refresh.hint", { max: MAX_REFRESH_SECONDS })}
      </span>
    </div>
  );
}

interface Display {
  store: FeedStore;
  refreshMs: number;
  frozen: boolean;
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
}: {
  display: Display;
  id: number;
  unavailable: boolean;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  takeFocus: boolean;
}) {
  const { store, refreshMs, frozen } = display;
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
    >
      <OptimizedChart
        key={id}
        store={store}
        id={id}
        symbol={row.sym}
        decimals={instrument.decimals}
        unavailable={unavailable}
        refreshMs={refreshMs}
        frozen={frozen}
      />
    </SymbolDetail>
  );
}

/** The watchlist panel: a mini chart for each symbol on it, drawn from the store. */
function Watchlist({ display, ids, onOpen, onRemove }: { display: Display; ids: number[]; onOpen: (id: number) => void; onRemove: (id: number) => void }) {
  const { store, refreshMs, frozen } = display;
  const items: WatchlistItem[] = ids.map((id) => {
    const row = store.row(id);
    const instrument = store.instrument(id);
    return {
      id,
      symbol: row?.sym ?? `#${id}`,
      name: instrument?.name ?? "",
      chart:
        row && instrument ? (
          <OptimizedMiniChart store={store} id={id} symbol={row.sym} decimals={instrument.decimals} refreshMs={refreshMs} frozen={frozen} />
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
  const [frozen, setFrozen] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_REFRESH_SECONDS);
  // The chart of the first instrument (AAA, the most active) is open from the start; `userChose` is false until the person picks one.
  const [selectedId, setSelectedId] = useState<number | null>(FIRST_INSTRUMENT);
  const [userChose, setUserChose] = useState(false);
  const choose = (id: number | null) => {
    setUserChose(true);
    setSelectedId(id);
  };
  const watchlist = useWatchlist();
  const { state, store } = useFeedWorker(selectedId, watchlist.ids);
  const { status, session, scope, referenceCount, referenceMissing, badVersion, hasSnapshot } = state;
  const ready = hasSnapshot && referenceCount !== null;
  const display: Display = { store, refreshMs: refreshSeconds * 1000, frozen };

  return (
    // The scope name proves, to the tests, that the connection runs in a worker and not in the page.
    <section className="optimized-page" aria-label={t("optimized.region")} data-worker-scope={scope ?? undefined}>
      <div className="toolbar">
        {/* Status is text plus a dot, so it never relies on color alone. */}
        <span className="status" data-status={status} role="status">
          {t(`status.${status}`)}
        </span>
        <RefreshControl seconds={refreshSeconds} onChange={setRefreshSeconds} />
        <button type="button" className="toggle-button" aria-pressed={frozen} onClick={() => setFrozen((f) => !f)}>
          {t("optimized.freeze")}
        </button>
        <WatchlistToggle count={watchlist.ids.length} open={watchlist.open} onToggle={() => watchlist.setOpen(!watchlist.open)} />
        <span className="frozen-note" role="status">
          {frozen && t("optimized.frozen")}
        </span>
      </div>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}

      <Hud session={session} mode="optimized" refreshSeconds={refreshSeconds} />

      {selectedId !== null && !ready && <SymbolDetailSkeleton />}
      {ready && selectedId !== null && (
        <SelectedChart
          display={display}
          id={selectedId}
          unavailable={state.chartUnavailable.includes(selectedId)}
          inWatchlist={watchlist.ids.includes(selectedId)}
          onToggleWatchlist={() => watchlist.toggle(selectedId)}
          onClose={() => choose(null)}
          takeFocus={userChose}
        />
      )}

      {/* The same layout from the first moment: the quotes (or their skeleton) and the watchlist beside them. */}
      <Workspace open={watchlist.open} panel={<Watchlist display={display} ids={watchlist.ids} onOpen={choose} onRemove={watchlist.remove} />}>
        {ready ? (
          <QuotesGrid store={store} frozen={frozen} refreshMs={refreshSeconds * 1000} selectedId={selectedId} onSelect={choose} />
        ) : (
          <div role="status">
            <span className="visually-hidden">{t("table.waiting")}</span>
            <TableSkeleton />
          </div>
        )}
      </Workspace>
      <Toast toast={watchlist.toast} onDismiss={watchlist.dismissToast} />
    </section>
  );
}
