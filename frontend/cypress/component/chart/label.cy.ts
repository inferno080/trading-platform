import { chartLabel } from "../../../src/chart/label";

// A stand-in for the translate function that shows which message and values it was given.
const t = (id: string, values?: Record<string, string | number>) => `${id} ${JSON.stringify(values ?? {})}`;

describe("chartLabel", () => {
  it("is just the symbol when there is no data", () => {
    expect(chartLabel(t, "AAA", null, 2, "en-US")).to.equal("AAA");
    expect(chartLabel(t, "AAA", [], 2, "en-US")).to.equal("AAA");
  });

  it("describes the last, high and low prices over the period, in the instrument's decimals", () => {
    const label = chartLabel(t, "AAA", [0, 29800, 60_000, 30100, 120_000, 29950], 2, "en-US");
    expect(label).to.contain("chart.summary");
    const values = JSON.parse(label.slice(label.indexOf("{")));
    expect(values).to.deep.equal({ symbol: "AAA", last: "299.50", high: "301.00", low: "298.00", minutes: 2 });
  });

  it("formats prices for the locale", () => {
    const label = chartLabel(t, "EUR", [0, 123400, 60_000, 123456], 2, "de-DE");
    expect(label).to.contain("1.234,56");
  });

  it("says which range it describes: a message for each, with no minutes, since the range is not the last few minutes", () => {
    for (const range of ["1d", "1m", "1y", "ytd", "max"] as const) {
      const label = chartLabel(t, "AAA", [0, 29800, 60_000, 30100], 2, "en-US", range);
      expect(label, range).to.contain(`chart.summary.${range} `);
      expect(JSON.parse(label.slice(label.indexOf("{"))), range).to.deep.equal({ symbol: "AAA", last: "301.00", high: "301.00", low: "298.00" });
    }
  });

  it("uses the five-minute message when no range is given, or for the five-minute range", () => {
    expect(chartLabel(t, "AAA", [0, 29800, 60_000, 30100], 2, "en-US")).to.contain("chart.summary {");
    expect(chartLabel(t, "AAA", [0, 29800, 60_000, 30100], 2, "en-US", "5m")).to.contain("chart.summary {");
  });
});
