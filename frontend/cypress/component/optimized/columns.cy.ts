import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { buildColumns } from "../../../src/optimized/columns";
import type { Row } from "../../../src/optimized/feedStore";
import { makeRow } from "../../support/fixtures";

const t = (id: string) => id; // headers come back as their message ids, which is enough to see which is which
const columns = (locale = "en-US", flash = true) => buildColumns(t, locale, flash);
const column = (field: string, cols = columns()): ColDef<Row> => {
  const found = cols.find((c) => c.field === field);
  if (!found) throw new Error(`No column for ${field}`);
  return found;
};
const format = (col: ColDef<Row>, row: Row): string =>
  (col.valueFormatter as (params: ValueFormatterParams<Row>) => string)({
    data: row,
    value: col.field ? row[col.field as keyof Row] : undefined,
  } as ValueFormatterParams<Row>);
const cellClass = (col: ColDef<Row>, row: Row): string[] =>
  (col.cellClass as (params: { data: Row }) => string[])({ data: row });

describe("buildColumns", () => {
  it("has the same 14 columns as the Naive table, in the same order", () => {
    expect(columns().map((c) => c.headerName)).to.deep.equal([
      "table.symbol",
      "table.name",
      "table.currency",
      "table.bid",
      "table.ask",
      "table.spread",
      "table.last",
      "table.prevClose",
      "table.change",
      "table.bidSize",
      "table.askSize",
      "table.volume",
      "table.tickSize",
      "table.decimals",
    ]);
  });

  it("pins the symbol, and filters text columns by text and number columns by number", () => {
    expect(column("sym").pinned).to.equal("left");
    expect(column("name").filter).to.equal("agTextColumnFilter");
    expect(column("bid").filter).to.equal("agNumberColumnFilter");
    expect(column("bid").type).to.equal("numericColumn"); // numbers line up on the right
  });

  describe("prices", () => {
    it("are formatted with the decimals of their own instrument", () => {
      expect(format(column("bid"), makeRow({ bid: 299.17, decimals: 2 }))).to.equal("299.17");
      expect(format(column("bid"), makeRow({ bid: 150.125, decimals: 3 }))).to.equal("150.125");
      expect(format(column("bid"), makeRow({ bid: 7, decimals: 0 }))).to.equal("7");
    });

    it("follow the locale", () => {
      expect(format(column("bid", columns("de-DE")), makeRow({ bid: 1234.5 }))).to.equal("1.234,50");
    });

    it("are led by an arrow for the way they last moved, and by nothing when they have not", () => {
      expect(format(column("last"), makeRow({ dirLast: 1 }))).to.equal("▲ 299.20");
      expect(format(column("last"), makeRow({ dirLast: -1 }))).to.equal("▼ 299.20");
      expect(format(column("last"), makeRow({ dirLast: 0 }))).to.equal("299.20");
    });

    it("show an arrow for each of bid, ask and last on its own", () => {
      const row = makeRow({ dirBid: 1, dirAsk: -1, dirLast: 0 });
      expect(format(column("bid"), row).startsWith("▲")).to.equal(true);
      expect(format(column("ask"), row).startsWith("▼")).to.equal(true);
      expect(format(column("last"), row).startsWith("▲")).to.equal(false);
    });

    it("show no arrow for the spread, the previous close or the tick size", () => {
      const row = makeRow({ dirBid: 1, dirAsk: 1, dirLast: 1 });
      expect(format(column("spread"), row)).to.equal("0.04");
      expect(format(column("prevClose"), row)).to.equal("298.00");
      expect(format(column("tickSize"), row)).to.equal("0.01");
    });

    it("format nothing when there is no row", () => {
      const formatter = column("bid").valueFormatter as (params: ValueFormatterParams<Row>) => string;
      expect(formatter({ data: undefined, value: 1 } as ValueFormatterParams<Row>)).to.equal("");
    });
  });

  describe("the change column", () => {
    it("shows a percentage, or a dash when there is no previous close", () => {
      expect(format(column("change"), makeRow({ change: 0.0123 }))).to.equal("+1.23%");
      expect(format(column("change"), makeRow({ change: null }))).to.equal("–");
    });

    it("has its text and its flash colored by its own sign: green when the day is up, red when it is down", () => {
      expect(cellClass(column("change"), makeRow({ change: 0.01 }))).to.deep.equal(["cell-up", "flash-up"]);
      expect(cellClass(column("change"), makeRow({ change: -0.01 }))).to.deep.equal(["cell-down", "flash-down"]);
    });

    it("has no color when flat or unknown", () => {
      expect(cellClass(column("change"), makeRow({ change: 0 }))).to.deep.equal([]);
      expect(cellClass(column("change"), makeRow({ change: null }))).to.deep.equal([]);
    });

    it("ignores the way the last price just moved, so it can be red beside a green price", () => {
      const row = makeRow({ change: -0.01, dirLast: 1, dirBid: 1 });
      expect(cellClass(column("change"), row)).to.deep.equal(["cell-down", "flash-down"]);
      expect(cellClass(column("bid"), row)).to.deep.equal(["cell-up", "flash-up"]);
    });
  });

  describe("a price's classes", () => {
    it("color its text and its flash by the way it last moved: green up, red down", () => {
      expect(cellClass(column("bid"), makeRow({ dirBid: 1 }))).to.deep.equal(["cell-up", "flash-up"]);
      expect(cellClass(column("ask"), makeRow({ dirAsk: -1 }))).to.deep.equal(["cell-down", "flash-down"]);
      expect(cellClass(column("last"), makeRow({ dirLast: -1 }))).to.deep.equal(["cell-down", "flash-down"]);
    });

    it("have none before the price has moved", () => {
      expect(cellClass(column("last"), makeRow({ dirLast: 0 }))).to.deep.equal([]);
    });

    it("follow each price's own movement, not the others'", () => {
      const row = makeRow({ dirBid: 1, dirAsk: -1, dirLast: 0 });
      expect(cellClass(column("bid"), row)).to.deep.equal(["cell-up", "flash-up"]);
      expect(cellClass(column("ask"), row)).to.deep.equal(["cell-down", "flash-down"]);
      expect(cellClass(column("last"), row)).to.deep.equal([]);
    });
  });

  it("formats sizes and volume as whole numbers in the locale, and the decimals column as a number", () => {
    const row = makeRow({ bidSz: 1234567, decimals: 3 });
    expect(format(column("bidSz"), row)).to.equal("1,234,567");
    expect(format(column("bidSz", columns("de-DE")), row)).to.equal("1.234.567");
    expect(format(column("askSz"), row)).to.equal("3,500");
    expect(format(column("vol"), row)).to.equal("8,600");
    expect(format(column("decimals"), row)).to.equal("3");
  });

  it("flashes changed values, unless the user asked for less motion", () => {
    const flashing = ["bid", "ask", "last", "change", "bidSz", "askSz", "vol"];
    for (const field of flashing) {
      expect(column(field).enableCellChangeFlash, `${field} flashes`).to.equal(true);
      expect(column(field, columns("en-US", false)).enableCellChangeFlash, `${field} is calm`).to.equal(false);
    }
    expect(column("spread").enableCellChangeFlash).to.equal(undefined);
  });
});
