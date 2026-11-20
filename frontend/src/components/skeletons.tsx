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

const statusBars: Bar[] = [
  { x: 0, y: 3, width: 10, height: 10, rx: 5 },
  { x: 18, y: 3, width: 48, height: 10 },
];

const CHART_HEIGHT = 240;

// Five price labels down the left, a faint grid line beside each, and a few short bars where a line would run.
const chartBars: Bar[] = [
  ...Array.from({ length: 5 }, (_, i): Bar[] => [
    { x: 0, y: 11 + i * 47, width: 52, height: 10 },
    { x: 68, y: 17 + i * 47, width: "88%", height: 2, rx: 1 },
  ]).flat(),
  { x: "12%", y: 150, width: "14%", height: 4 },
  { x: "28%", y: 120, width: "14%", height: 4 },
  { x: "44%", y: 132, width: "14%", height: 4 },
  { x: "60%", y: 90, width: "14%", height: 4 },
  { x: "76%", y: 104, width: "14%", height: 4 },
];

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

/** Placeholder for a whole iteration page (status, HUD and table), shown while its code downloads. */
export function PageSkeleton() {
  const t = useT();
  return (
    // role="status" announces the hidden text once; the shapes themselves are hidden from screen readers.
    <div className="panel" role="status">
      <span className="visually-hidden">{t("app.loading")}</span>
      <SkeletonSvg height={16} bars={statusBars} />
      <div className="hud">
        <SkeletonSvg height={96} bars={hudBars} />
      </div>
      <TableSkeleton />
    </div>
  );
}
