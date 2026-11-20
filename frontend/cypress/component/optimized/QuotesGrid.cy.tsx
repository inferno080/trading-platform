import { useState } from "react";
import { FeedStore } from "../../../src/optimized/feedStore";
import { QuotesGrid } from "../../../src/optimized/QuotesGrid";
import { makeQuote, makeReference, makeReferenceData, makeSnapshot } from "../../support/fixtures";
import { withI18n } from "../../support/render";

// A store that already has rows, which is what the page hands the grid.
const readyStore = () => {
  const store = new FeedStore();
  store.setReference(makeReferenceData().instruments, Date.now());
  store.setSnapshot(makeSnapshot(1).quotes, Date.now());
  return store;
};
const mountGrid = (store = readyStore()) => {
  cy.mount(withI18n(<QuotesGrid store={store} frozen={false} refreshMs={0} />));
  cy.get(".ag-row[row-id]").should("have.length", store.rows.length); // the grid is ready and listening
  return store;
};
const openFilter = (header: string) => cy.contains(".ag-header-cell", header).find(".ag-header-cell-filter-button").click();
const cell = (rowId: number, column: string) => cy.get(`[row-id="${rowId}"] [col-id="${column}"]`);

describe("QuotesGrid", () => {
  // The grid reports a missing module (or a bad option) as a console error or warning that names it. None may appear.
  beforeEach(() => {
    cy.window().then((win) => {
      cy.spy(win.console, "error").as("consoleError");
      cy.spy(win.console, "warn").as("consoleWarn");
    });
  });
  afterEach(() => {
    cy.get("@consoleError").should("not.be.called");
    cy.get("@consoleWarn").should("not.be.called");
  });

  it("is a labelled region with a column for each of the 14 fields", () => {
    mountGrid();
    cy.get("[role=region]").should("have.attr", "aria-label", "Live quotes grid");
    cy.get(".ag-header-row-column [role=columnheader]").should("have.length", 14);
    cy.get(".ag-header-row-column").first().should("contain.text", "Symbol").and("contain.text", "Decimals");
  });

  it("shows a row for each instrument, with prices formatted to the instrument's decimals", () => {
    mountGrid();
    cy.get(".ag-row[row-id]").should("have.length", 3);
    cell(0, "name").should("have.text", "Apex Systems Inc.");
    cell(0, "bid").should("have.text", "299.17");
    cell(0, "ask").should("have.text", "299.21");
    cell(0, "spread").should("have.text", "0.04");
    cell(0, "change").should("have.text", "+0.40%");
    cell(0, "bidSz").should("have.text", "2,700");
    cell(0, "tickSize").should("have.text", "0.01");
    cell(0, "decimals").should("have.text", "2");
  });

  it("shows an instrument with three decimals to three decimals", () => {
    const store = new FeedStore();
    store.setReference([makeReference(0, { decimals: 3, prevClose: 150_000, tickSize: 0.005 })], 0);
    store.setSnapshot([makeQuote(0, { bid: 150_120, ask: 150_130, last: 150_125 })], 0);
    mountGrid(store);
    cell(0, "last").should("have.text", "150.125");
    cell(0, "tickSize").should("have.text", "0.005");
  });

  describe("live changes", () => {
    it("updates only the changed row, as one transaction", () => {
      const store = mountGrid();
      cy.then(() => store.applyBatch([makeQuote(1, { last: 30000 })], Date.now()));
      cell(1, "last").should("contain.text", "300.00");
      cell(0, "last").should("have.text", "299.20");
    });

    it("shows which way a price moved with an arrow and a color, not color alone", () => {
      const store = mountGrid();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 29990, bid: 29900 })], Date.now()));
      cell(0, "last").should("have.text", "▲ 299.90").and("have.class", "cell-up");
      cell(0, "bid").should("have.text", "▼ 299.00").and("have.class", "cell-down");
    });

    it("colors the flash of a changed value green when it moved up and red when it moved down", () => {
      const store = mountGrid();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 29990, bid: 29900 })], Date.now()));
      cell(0, "last").should("have.class", "flash-up").and("have.css", "--ag-value-change-value-highlight-background-color");
      cell(0, "bid").should("have.class", "flash-down");
      cell(0, "last").then(($cell) => {
        const up = getComputedStyle($cell[0]!).getPropertyValue("--ag-value-change-value-highlight-background-color");
        const down = getComputedStyle(Cypress.$('[row-id="0"] [col-id="bid"]')[0]!).getPropertyValue("--ag-value-change-value-highlight-background-color");
        expect(up).not.to.equal(down);
        const root = getComputedStyle(document.documentElement);
        expect(up).to.contain(root.getPropertyValue("--color-up").trim()); // green, from the design token
        expect(down).to.contain(root.getPropertyValue("--color-down").trim()); // red, from the design token
      });
    });

    it("replaces every row when a new snapshot arrives", () => {
      const store = mountGrid();
      cy.then(() => store.setSnapshot([makeQuote(0, { last: 31000 }), makeQuote(1), makeQuote(2)], Date.now()));
      cell(0, "last").should("contain.text", "310.00");
    });

    it("marks a row that has gone quiet without changing how it looks, and clears the mark on its next update", () => {
      const store = mountGrid();
      cy.then(() => store.sweepStale(Date.now() + 60_000));
      cy.get('[row-id="0"]').should("have.class", "row-stale");
      cell(0, "name").should("have.css", "font-style", "normal"); // ordinary text, not slanted
      cell(0, "name").then(($cell) => {
        const amber = document.createElement("span");
        amber.style.color = "var(--color-stale)";
        document.body.append(amber);
        expect(getComputedStyle($cell[0]!).color).not.to.equal(getComputedStyle(amber).color); // not the old amber
        amber.remove();
      });
      cy.then(() => store.applyBatch([makeQuote(0)], Date.now()));
      cy.get('[row-id="0"]').should("not.have.class", "row-stale");
    });
  });

  describe("sorting and filtering", () => {
    // The grid positions rows with CSS rather than by their order in the page, so read the order from each row's index.
    const rowIds = () =>
      cy.get(".ag-row[row-id]").then(($rows) =>
        [...$rows]
          .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")))
          .map((r) => r.getAttribute("row-id")),
      );

    it("sorts by a column when its header is clicked, and the other way on the second click", () => {
      const store = new FeedStore();
      store.setReference(makeReferenceData().instruments, 0);
      store.setSnapshot([makeQuote(0, { last: 29920 }), makeQuote(1, { last: 29900 }), makeQuote(2, { last: 29950 })], 0);
      mountGrid(store);
      cy.contains(".ag-header-cell", "Last").click();
      cy.contains(".ag-header-cell", "Last").should("have.attr", "aria-sort", "ascending");
      rowIds().should("deep.equal", ["1", "0", "2"]);
      cy.contains(".ag-header-cell", "Last").click();
      cy.contains(".ag-header-cell", "Last").should("have.attr", "aria-sort", "descending");
      rowIds().should("deep.equal", ["2", "0", "1"]);
    });

    it("has no row of filter boxes, only a filter button beside each column name", () => {
      mountGrid();
      cy.get(".ag-floating-filter").should("not.exist");
      cy.get(".ag-header-cell").first().find(".ag-header-cell-filter-button").should("exist");
    });

    it("puts the filter button to the right of the column name in every column, text and numeric alike", () => {
      mountGrid();
      cy.get(".ag-header-cell").should("have.length", 14);
      cy.get(".ag-header-cell").each(($header) => {
        const text = $header.find(".ag-header-cell-text")[0]!.getBoundingClientRect();
        const button = $header.find(".ag-header-cell-filter-button")[0]!.getBoundingClientRect();
        expect(button.left, `${$header.text().trim()}: filter button is right of the name`).to.be.at.least(text.right - 1);
      });
    });

    it("filters by text typed in a column's filter, opened from its button", () => {
      mountGrid();
      openFilter("Symbol");
      cy.get('[aria-label="Filter Value"]').type("AAB");
      cy.get(".ag-row[row-id]").should("have.length", 1);
      cell(1, "sym").should("contain.text", "AAB");
    });

    it("keeps a sort and a filter while updates keep arriving", () => {
      const store = mountGrid();
      openFilter("Symbol");
      cy.get('[aria-label="Filter Value"]').type("AAB");
      cy.then(() => store.applyBatch([makeQuote(0), makeQuote(1, { last: 30500 })], Date.now()));
      cell(1, "last").should("contain.text", "305.00");
      cy.get(".ag-row[row-id]").should("have.length", 1);
    });
  });

  describe("keyboard use of the headings", () => {
    it("reaches the column headings with the Tab key, one after another", () => {
      mountGrid();
      cy.get("body").realPress("Tab");
      cy.focused().should("have.attr", "role", "columnheader").and("have.attr", "col-id", "sym");
      cy.realPress("Tab");
      cy.focused().should("have.attr", "col-id", "name");
    });

    it("sorts a column with Enter, and the sort shows on the heading", () => {
      mountGrid();
      cy.contains(".ag-header-cell", "Last").focus();
      cy.realPress("Enter");
      cy.contains(".ag-header-cell", "Last").should("have.attr", "aria-sort", "ascending");
      cy.realPress("Enter");
      cy.contains(".ag-header-cell", "Last").should("have.attr", "aria-sort", "descending");
    });

    it("opens a column's filter with Alt+Down, puts the cursor in it, and Escape closes it", () => {
      mountGrid();
      cy.contains(".ag-header-cell", "Symbol").focus();
      cy.realPress(["Alt", "ArrowDown"]);
      cy.get('[aria-label="Filter Value"]').should("be.visible").and("have.focus");
      cy.realType("AAB");
      cy.get(".ag-row[row-id]").should("have.length", 1);
      cy.realPress("Escape");
      cy.get('[aria-label="Filter Value"]').should("not.exist");
    });

    it("ignores Alt+Down anywhere but on a column heading", () => {
      mountGrid();
      cell(0, "sym").click();
      cy.realPress(["Alt", "ArrowDown"]);
      cy.get('[aria-label="Filter Value"]').should("not.exist");
    });

    it("opens a column's filter with Ctrl+Enter, puts the cursor in it, and Escape closes it", () => {
      mountGrid();
      cy.contains(".ag-header-cell", "Symbol").focus();
      cy.realPress(["Control", "Enter"]);
      cy.get('[aria-label="Filter Value"]').should("be.visible").and("have.focus");
      cy.realType("AAB");
      cy.get(".ag-row[row-id]").should("have.length", 1);
      cy.realPress("Escape");
      cy.get('[aria-label="Filter Value"]').should("not.exist");
    });
  });

  it("can be moved around with the keyboard", () => {
    mountGrid();
    cell(0, "sym").click();
    cy.focused().should("have.attr", "col-id", "sym");
    cy.realPress("ArrowDown");
    cy.focused().closest("[row-id]").should("have.attr", "row-id", "1");
    cy.realPress("ArrowRight");
    cy.focused().should("have.attr", "col-id", "name");
  });

  it("is drawn from the design tokens, so the theme switch restyles it", () => {
    mountGrid();
    cy.document().then((doc) => doc.documentElement.setAttribute("data-theme", "dark"));
    cy.get(".ag-root-wrapper").should("have.css", "background-color", "rgb(11, 15, 20)");
  });

  it("starts from the store's current rows, even when it changed before the grid was ready", () => {
    const store = readyStore();
    cy.mount(withI18n(<QuotesGrid store={store} frozen={false} refreshMs={0} />));
    store.applyBatch([makeQuote(0, { last: 31000 })], Date.now()); // announced before the grid can listen
    cell(0, "last").should("contain.text", "310.00");
  });

  describe("redrawing at an interval", () => {
    const INTERVAL = 400;
    const mountSlow = () => {
      const store = readyStore();
      cy.mount(withI18n(<QuotesGrid store={store} frozen={false} refreshMs={INTERVAL} />));
      cy.get(".ag-row[row-id]").should("have.length", 3);
      return store;
    };

    it("holds changes back until the interval has passed, then draws them", () => {
      const store = mountSlow();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 31000 })], Date.now()));
      cell(0, "last").should("have.text", "299.20"); // not yet
      cell(0, "last").should("contain.text", "310.00"); // after the interval
    });

    it("draws only the latest of several changes to a row, and all the rows that changed", () => {
      const store = mountSlow();
      cy.then(() => {
        store.applyBatch([makeQuote(0, { last: 30100 }), makeQuote(1, { last: 30200 })], Date.now());
        store.applyBatch([makeQuote(0, { last: 30300 })], Date.now());
      });
      cell(0, "last").should("contain.text", "303.00");
      cell(1, "last").should("contain.text", "302.00");
    });

    it("draws everything that changed in the same moment, not row by row", () => {
      const store = mountSlow();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 30100 })], Date.now()));
      cy.then(() => store.applyBatch([makeQuote(1, { last: 30200 })], Date.now()));
      cell(0, "last").should("contain.text", "301.00");
      cell(1, "last").should("contain.text", "302.00", { timeout: 0 }); // already there: both came in one redraw
    });

    it("draws a new snapshot at once, and drops the changes that were waiting", () => {
      const store = mountSlow();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 30100 })], Date.now()));
      cy.then(() => store.setSnapshot([makeQuote(0, { last: 32000 }), makeQuote(1), makeQuote(2)], Date.now()));
      cell(0, "last").should("contain.text", "320.00"); // immediately, without waiting for the interval
    });

    it("draws every change as it arrives when the interval is 0", () => {
      const store = mountGrid();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 31000 })], Date.now()));
      cell(0, "last").should("contain.text", "310.00");
    });
  });

  describe("when frozen", () => {
    // The page toggles freezing on a grid that is already showing, so the tests do the same.
    function Harness({ store }: { store: FeedStore }) {
      const [frozen, setFrozen] = useState(false);
      return (
        <>
          <button onClick={() => setFrozen((f) => !f)}>toggle freeze</button>
          <QuotesGrid store={store} frozen={frozen} refreshMs={0} />
        </>
      );
    }
    const mountHarness = () => {
      const store = readyStore();
      cy.mount(withI18n(<Harness store={store} />));
      cy.get(".ag-row[row-id]").should("have.length", 3);
      return store;
    };

    it("holds the numbers still while the store keeps receiving, and catches up when resumed", () => {
      const store = mountHarness();
      cy.contains("button", "toggle freeze").click();
      cy.then(() => store.applyBatch([makeQuote(0, { last: 31000 })], Date.now()));
      cy.then(() => expect(store.rows[0]?.last).to.be.closeTo(310, 1e-9)); // the store has it
      cell(0, "last").should("have.text", "299.20"); // the grid does not
      cy.contains("button", "toggle freeze").click();
      cell(0, "last").should("contain.text", "310.00");
    });

    it("draws live changes again after being resumed", () => {
      const store = mountHarness();
      cy.contains("button", "toggle freeze").click();
      cy.contains("button", "toggle freeze").click();
      cy.then(() => store.applyBatch([makeQuote(1, { last: 30500 })], Date.now()));
      cell(1, "last").should("contain.text", "305.00");
    });
  });

  it("uses the Japanese words for the grid's own text in the Japanese locale", () => {
    localStorage.setItem("locale", "ja-JP");
    mountGrid();
    cy.get(".ag-header-row-column").first().should("contain.text", "銘柄");
  });
});
