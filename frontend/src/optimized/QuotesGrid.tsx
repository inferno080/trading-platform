import { AG_GRID_LOCALE_JP } from "@ag-grid-community/locale";
import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  HighlightChangesModule,
  LocaleModule,
  ModuleRegistry,
  NumberFilterModule,
  RowApiModule,
  RowStyleModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useT } from "../i18n/useT";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { buildColumns } from "./columns";
import type { FeedStore } from "./feedStore";
import type { Row } from "./feedStore";

// Only the parts of AG Grid this grid uses, so the rest is not downloaded. The validation module reports a missing
// module by name, which is what the development build and the tests rely on to catch one; it is left out of production.
ModuleRegistry.registerModules([
  ClientSideRowModelModule, // the rows, and sorting
  ClientSideRowModelApiModule, // applying a transaction of changed rows
  TextFilterModule,
  NumberFilterModule,
  CellStyleModule, // colour classes on cells
  RowApiModule, // redrawing rows, so the selected row's highlight updates
  RowStyleModule, // the stale-row and selected-row classes
  HighlightChangesModule, // the flash when a value changes
  LocaleModule, // translated grid text
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

// The grid takes its look from the app's design tokens, so it follows the theme switch with no extra code.
const GRID_THEME = themeQuartz.withParams({
  backgroundColor: "var(--color-bg)",
  foregroundColor: "var(--color-text)",
  borderColor: "var(--color-border)",
  headerBackgroundColor: "var(--color-surface)",
  headerTextColor: "var(--color-text)",
  oddRowBackgroundColor: "var(--color-surface)",
  accentColor: "var(--color-accent)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  rowHeight: 28,
  headerHeight: 32,
  browserColorScheme: "inherit",
  // The flash of a value with no direction (and of any value before it has moved) is grey, not green or red.
  valueChangeValueHighlightBackgroundColor: "color-mix(in srgb, var(--color-text-muted) 30%, transparent)",
});

// ag-grid has built-in text in several languages; English is its default.
const LOCALE_TEXT: Record<string, Record<string, string>> = { "ja-JP": AG_GRID_LOCALE_JP };

const getRowId = (params: GetRowIdParams<Row>): string => String(params.data.id);
// Rules, unlike a fixed class, are checked again every time a row changes, so a row leaves the stale look when it ticks.
const STALE_RULE = (params: { data?: Row }) => params.data?.stale === true;

/**
 * The quotes in an AG Grid. Only the rows on screen exist in the page, and changes are handed to the grid as one
 * transaction, so a burst of updates costs one pass over the changed rows.
 *
 * `refreshMs` is how often the grid redraws: 0 draws every change as it arrives, and anything else collects the changes
 * (keeping the latest state of each row) and draws them all together once per interval, so the numbers stay readable.
 * The store keeps receiving at full speed either way.
 *
 * While `frozen`, the grid draws nothing so the numbers hold still; unfreezing redraws from the store in one step.
 */
interface QuotesGridProps {
  store: FeedStore;
  frozen: boolean;
  refreshMs: number;
  /** The instrument whose chart is open, if any, and how to open one (a click on its row, or Enter on a cell in it). */
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}

export function QuotesGrid({ store, frozen, refreshMs, selectedId = null, onSelect }: QuotesGridProps) {
  const t = useT();
  const { locale } = useIntl();
  const reducedMotion = usePrefersReducedMotion();
  const api = useRef<GridApi<Row> | null>(null);
  const region = useRef<HTMLDivElement>(null);
  const selected = useRef(selectedId); // read by the row rules, which the grid evaluates itself
  const rowClassRules = useMemo(
    () => ({ "row-stale": STALE_RULE, "row-selected": (params: { data?: Row }) => params.data?.id === selected.current }),
    [],
  );
  useEffect(() => {
    selected.current = selectedId;
    api.current?.redrawRows(); // the rules are checked again for every row on screen
  }, [selectedId]);
  const [initialRows] = useState(() => store.rows); // fixed: later changes arrive through the subscription, not through this prop

  const columnDefs = useMemo(() => buildColumns(t, locale, !reducedMotion), [t, locale, reducedMotion]);
  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true, minWidth: 90, width: 120 }), // each column's filter opens from the button beside its name
    [],
  );

  useEffect(() => {
    if (frozen) return; // nothing is drawn while frozen
    api.current?.setGridOption("rowData", store.rows); // catch up on whatever was missed while frozen or before a new interval
    const pending = new Map<number, Row>(); // changed rows waiting for the next redraw, the latest of each

    const flush = () => {
      if (pending.size === 0) return;
      const rows = [...pending.values()];
      pending.clear();
      api.current?.applyTransaction({ update: rows });
    };

    const unsubscribe = store.subscribe((change) => {
      const grid = api.current;
      if (!grid) return;
      if (change.kind === "reset") {
        pending.clear(); // a snapshot replaces everything, including what was waiting
        grid.setGridOption("rowData", change.rows);
      } else if (refreshMs <= 0) {
        grid.applyTransaction({ update: change.rows });
      } else {
        for (const row of change.rows) pending.set(row.id, row);
      }
    });

    const timer = refreshMs > 0 ? window.setInterval(flush, refreshMs) : undefined;
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [store, frozen, refreshMs]);

  // Alt+Down on a focused column heading opens that column's filter, the usual key for opening a menu. (Ctrl+Enter, the
  // grid's own key, still works.) It presses the heading's filter button, so it does exactly what a click does.
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const openFilter = (event: KeyboardEvent) => {
      if (!event.altKey || event.key !== "ArrowDown") return;
      const heading = (event.target as Element).closest(".ag-header-cell");
      const button = heading?.querySelector<HTMLElement>(".ag-header-cell-filter-button");
      if (!button) return;
      event.preventDefault();
      button.click();
    };
    element.addEventListener("keydown", openFilter);
    return () => element.removeEventListener("keydown", openFilter);
  }, []);

  const onGridReady = (event: GridReadyEvent<Row>) => {
    api.current = event.api;
    // Changes announced before the grid was ready were not drawn, so start from the store's current rows.
    event.api.setGridOption("rowData", store.rows);
  };

  return (
    <>
      <div ref={region} className="grid-wrap" role="region" aria-label={t("grid.region")}>
      <AgGridReact<Row>
        theme={GRID_THEME}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowData={initialRows}
        getRowId={getRowId}
        rowClassRules={rowClassRules}
        onRowClicked={(event) => event.data && onSelect?.(event.data.id)}
        onCellKeyDown={(event) => {
          if ((event.event as KeyboardEvent | null)?.key === "Enter" && event.data) onSelect?.(event.data.id);
        }}
        localeText={LOCALE_TEXT[locale]}
        onGridReady={onGridReady}
        suppressMenuHide // keep each column's filter button visible, not only on hover
        suppressColumnVirtualisation // only 14 columns: keeping them all in the page lets assistive technology see every one
        cellFlashDuration={400}
        cellFadeDuration={600}
      />
      </div>
    </>
  );
}
