import { useT } from "../i18n/useT";
import { SkeletonSvg, type Bar } from "./SkeletonSvg";

const ROW_HEIGHT = 28; // matches --row-height in the real table
const TABLE_ROWS = 12;
const COLUMN_X = ["2%", "14%", "27%", "40%", "53%", "66%", "79%", "91%"]; // eight columns, like the real table

// Header bar plus rows of short bars, one per column.
const tableBars: Bar[] = [
  ...COLUMN_X.map((x): Bar => ({ x, y: 10, width: "7%", height: 12 })),
  ...Array.from({ length: TABLE_ROWS }, (_, row) =>
    COLUMN_X.map((x, col): Bar => ({ x, y: ROW_HEIGHT + 8 + row * ROW_HEIGHT, width: col === 0 ? "5%" : "7%", height: 12 })),
  ).flat(),
];

// Title, mode label and button on top, then seven label-and-value pairs, like the real HUD.
const hudBars: Bar[] = [
  { x: 0, y: 6, width: 110, height: 16 },
  { x: "62%", y: 4, width: 110, height: 20 },
  { x: "82%", y: 0, width: "18%", height: 32, rx: 6 },
  ...Array.from({ length: 7 }, (_, i): Bar[] => [
    { x: `${i * 14.3}%`, y: 52, width: "10%", height: 10 },
    { x: `${i * 14.3}%`, y: 70, width: "8%", height: 18 },
  ]).flat(),
];

// The toolbar: the status dot and its label, then two buttons (refresh/freeze and the watchlist toggle).
const toolbarBars: Bar[] = [
  { x: 0, y: 10, width: 10, height: 10, rx: 5 },
  { x: 18, y: 10, width: 48, height: 10 },
  { x: 90, y: 1, width: 130, height: 28, rx: 6 },
  { x: 232, y: 1, width: 130, height: 28, rx: 6 },
];

const CHART_HEIGHT = 240;

// Five price labels down the left, a faint grid line beside each, and a few short bars where a line would run.
const chartBars: Bar[] = [
  ...Array.from({ length: 5 }, (_, i): Bar[] => [
    { x: 0, y: 11 + i * 47, width: 52, height: 10 },
    { x: 68, y: 16 + i * 47, width: "88%", height: 3, rx: 1.5 },
  ]).flat(),
  { x: "12%", y: 148, width: "14%", height: 7 },
  { x: "28%", y: 118, width: "14%", height: 7 },
  { x: "44%", y: 130, width: "14%", height: 7 },
  { x: "60%", y: 88, width: "14%", height: 7 },
  { x: "76%", y: 102, width: "14%", height: 7 },
];

/** Placeholder for a watchlist mini chart while its history is on its way. */
export function MiniChartSkeleton() {
  return (
    <SkeletonSvg
      height={56}
      bars={[
        { x: "4%", y: 32, width: "20%", height: 7 },
        { x: "28%", y: 20, width: "20%", height: 7 },
        { x: "52%", y: 26, width: "20%", height: 7 },
        { x: "76%", y: 8, width: "20%", height: 7 },
      ]}
    />
  );
}

// The order book and the trades, as placeholders side by side: a heading and a few rows each.
function BookShape() {
  const rows = (count: number, columns: number): Bar[] => [
    ...Array.from({ length: columns }, (_, c): Bar => ({ x: `${c * (100 / columns) + 2}%`, y: 6, width: `${100 / columns - 8}%`, height: 10 })),
    ...Array.from({ length: count }, (_, r) =>
      Array.from({ length: columns }, (_, c): Bar => ({ x: `${c * (100 / columns) + 2}%`, y: 30 + r * 24, width: `${100 / columns - 8}%`, height: 9 })),
    ).flat(),
  ];
  return (
    <div className="book-panel">
      <div>
        <SkeletonSvg height={28} bars={[{ x: 0, y: 4, width: 110, height: 14 }]} />
        <SkeletonSvg height={30 + 10 * 24} bars={rows(10, 4)} />
      </div>
      <div>
        <SkeletonSvg height={28} bars={[{ x: 0, y: 4, width: 120, height: 14 }]} />
        <SkeletonSvg height={30 + 10 * 24} bars={rows(10, 4)} />
      </div>
    </div>
  );
}

/** Placeholder for the order book and trades while the first order book is on its way. */
export function BookSkeleton() {
  const t = useT();
  return (
    <div role="status">
      <span className="visually-hidden">{t("book.loading")}</span>
      <BookShape />
    </div>
  );
}

// The inside of the chart panel: its heading line, the chart across the full width, and the order book and trades below it.
function DetailShape() {
  return (
    <>
      <div className="symbol-detail-header">
        <SkeletonSvg
          height={22}
          bars={[
            { x: 0, y: 3, width: 130, height: 16 },
            { x: 146, y: 5, width: 220, height: 12 },
          ]}
        />
      </div>
      <div className="symbol-detail-body">
        <div className="symbol-detail-chart">
          <ChartSkeleton />
        </div>
        <div className="symbol-detail-side">
          <BookShape />
        </div>
      </div>
    </>
  );
}

/** The whole detail panel (heading and chart) before the page has the symbol's quote and reference data. */
export function SymbolDetailSkeleton() {
  const t = useT();
  return (
    <section className="symbol-detail" role="status">
      <span className="visually-hidden">{t("chart.loading")}</span>
      <DetailShape />
    </section>
  );
}

// The watchlist column: its heading, and two cards (symbol row, then a mini chart), as a typical list looks.
function WatchlistShape() {
  return (
    <section className="watchlist">
      <div className="symbol-detail-header">
        <SkeletonSvg
          height={22}
          bars={[
            { x: 0, y: 3, width: 100, height: 16 },
            { x: 116, y: 6, width: 44, height: 10 },
          ]}
        />
      </div>
      <div className="watchlist-items">
        {[0, 1].map((card) => (
          <div className="watch-item" key={card}>
            <div className="watch-item-header">
              <SkeletonSvg
                height={28}
                bars={[
                  { x: 0, y: 4, width: 56, height: 20, rx: 5 },
                  { x: 68, y: 9, width: "45%", height: 10 },
                ]}
              />
            </div>
            <MiniChartSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A watchlist entry's chart slot before its symbol is even known (the reference data has not arrived yet). */
export function MiniChartLoading() {
  const t = useT();
  return (
    <div className="mini-chart" role="status">
      <span className="visually-hidden">{t("chart.loading")}</span>
      <MiniChartSkeleton />
    </div>
  );
}

/** Placeholder for a price chart while its history is on its way. */
export function ChartSkeleton() {
  return <SkeletonSvg height={CHART_HEIGHT} bars={chartBars} />;
}

/** Placeholder for the quotes table while the first snapshot is on its way. */
export function TableSkeleton() {
  return (
    <div className="skeleton-frame">
      <SkeletonSvg height={ROW_HEIGHT + TABLE_ROWS * ROW_HEIGHT} bars={tableBars} />
    </div>
  );
}

/**
 * Placeholder for a whole iteration page while its code downloads. It has the shape of the real page: the toolbar, the
 * performance panel, the chart panel (70% of the width) beside the watchlist (30%), and the quotes below, so nothing
 * jumps when the page replaces it.
 */
export function PageSkeleton() {
  const t = useT();
  return (
    // role="status" announces the hidden text once; the shapes themselves are hidden from screen readers.
    <div className="panel" role="status">
      <span className="visually-hidden">{t("app.loading")}</span>
      <SkeletonSvg height={30} bars={toolbarBars} />
      <div className="hud">
        <SkeletonSvg height={96} bars={hudBars} />
      </div>
      <div className="workspace" data-watchlist="open" data-main="chart">
        <div className="workspace-main">
          <section className="symbol-detail">
            <DetailShape />
          </section>
        </div>
        <aside className="workspace-side">
          <WatchlistShape />
        </aside>
      </div>
      <TableSkeleton />
    </div>
  );
}
