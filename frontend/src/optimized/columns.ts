import type { CellClassParams, ColDef, ValueFormatterParams } from "ag-grid-community";
import { integerFormatter, percentFormatter, priceFormatter } from "../lib/format";
import type { Direction, Row } from "./feedStore";

type Translate = (id: string) => string;

/** Marks that say which way a price last moved. Together with the color, so the direction never relies on color alone. */
const ARROW: Record<Direction, string> = { 1: "▲ ", [-1]: "▼ ", 0: "" };

/** The text color class for a move (a direction, or the sign of a change), or none. */
function moveClass(move: number | null | undefined): string | undefined {
  if (!move) return undefined;
  return move > 0 ? "cell-up" : "cell-down";
}

/** The class that colors the flash of a changed value by the way it moved: green for up, red for down. */
function flashClass(direction: Direction | undefined): string | undefined {
  if (!direction) return undefined;
  return direction > 0 ? "flash-up" : "flash-down";
}

/** Which side of zero a number is on; 0 for zero or no number. */
function signOf(value: number | null | undefined): Direction {
  if (!value) return 0;
  return value > 0 ? 1 : -1;
}

/** Text color by `move`, and flash color by `direction`. */
const cellClasses = (move: number | null | undefined, direction: Direction | undefined): string[] =>
  [moveClass(move), flashClass(direction)].filter((name): name is string => name !== undefined);

/** The same 14 columns as the Naive table, so the two can be compared fairly. */
export function buildColumns(t: Translate, locale: string, flash: boolean): ColDef<Row>[] {
  const integer = integerFormatter(locale);
  const percent = percentFormatter(locale);

  // A price, formatted with its own instrument's decimals; optionally led by an arrow for its last move.
  const price =
    (field: "bid" | "ask" | "spread" | "last" | "prevClose" | "tickSize", direction?: keyof Row) =>
    (params: ValueFormatterParams<Row>): string => {
      const row = params.data;
      if (!row) return "";
      const arrow = direction ? ARROW[row[direction] as Direction] : "";
      return arrow + priceFormatter(locale, row.decimals).format(row[field]);
    };

  const text = (field: "sym" | "name" | "currency", headerId: string): ColDef<Row> => ({
    field,
    headerName: t(headerId),
    filter: "agTextColumnFilter",
  });

  // Number columns line up on the right and filter by number; `flash` briefly highlights a changed value.
  const number = (field: keyof Row, headerId: string, formatter: ColDef<Row>["valueFormatter"], extra: ColDef<Row> = {}): ColDef<Row> => ({
    field,
    headerName: t(headerId),
    type: "numericColumn",
    filter: "agNumberColumnFilter",
    valueFormatter: formatter,
    ...extra,
  });

  const moving = (direction: keyof Row) => ({
    cellClass: (params: CellClassParams<Row>) => {
      const moved = params.data?.[direction] as Direction | undefined;
      return cellClasses(moved, moved);
    },
    enableCellChangeFlash: flash,
  });

  return [
    { ...text("sym", "table.symbol"), pinned: "left", width: 110 },
    { ...text("name", "table.name"), width: 190 },
    { ...text("currency", "table.currency"), width: 110 },
    number("bid", "table.bid", price("bid", "dirBid"), moving("dirBid")),
    number("ask", "table.ask", price("ask", "dirAsk"), moving("dirAsk")),
    number("spread", "table.spread", price("spread")),
    number("last", "table.last", price("last", "dirLast"), moving("dirLast")),
    number("prevClose", "table.prevClose", price("prevClose")),
    number(
      "change",
      "table.change",
      (params) => (params.value === null || params.value === undefined ? "–" : percent.format(params.value as number)),
      {
        // Its own color, by whether the day is up or down, for its text and for its flash: it can be red while the
        // price beside it just ticked up and is green.
        cellClass: (params: CellClassParams<Row>) => {
          const change = params.data?.change;
          return cellClasses(change, signOf(change));
        },
        enableCellChangeFlash: flash,
      },
    ),
    number("bidSz", "table.bidSize", (params) => integer.format(params.value as number), { enableCellChangeFlash: flash }),
    number("askSz", "table.askSize", (params) => integer.format(params.value as number), { enableCellChangeFlash: flash }),
    number("vol", "table.volume", (params) => integer.format(params.value as number), { enableCellChangeFlash: flash }),
    number("tickSize", "table.tickSize", price("tickSize")),
    number("decimals", "table.decimals", (params) => integer.format(params.value as number)),
  ];
}
