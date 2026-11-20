import { waitForLiveGrid } from "../support/e2e";

// These tests need the real backend (see live-dashboard.cy.ts). They exercise the real Web Worker, which component
// tests cannot: a worker has its own global scope and its own connection.

const PRICE = /^(▲ |▼ )?[\d,]+\.\d{2}$/; // a 2-decimal price, perhaps led by an arrow
const lastOfFirstRow = () => cy.get('.ag-row[row-id="0"] [col-id="last"]');

const setRefresh = (seconds: string) => cy.get("#refresh-seconds").clear().type(seconds);

describe("the Optimized tab, with the real worker and server", () => {
  it("connects from inside a Web Worker, not from the page", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.get("section.optimized-page").invoke("attr", "data-worker-scope").should("match", /WorkerGlobalScope$/);
    cy.window().then((win) => {
      // The page's own thread never opened a connection: the only socket belongs to the worker.
      expect(win.performance.getEntriesByType("resource").some((entry) => entry.name.startsWith("ws:"))).to.equal(false);
    });
  });

  it("has no panel of connection facts, only the grid and the performance panel", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.get(".facts").should("not.exist");
    cy.get(".hud").should("exist");
  });

  it("draws only the rows that fit on screen, not all of the instruments", () => {
    cy.visit("/");
    waitForLiveGrid();
    // The grid says how many rows it has (plus its header rows); far fewer are actually in the page.
    cy.get('[role="treegrid"], [role="grid"]').first().invoke("attr", "aria-rowcount").then((count) => {
      const total = Number(count);
      cy.get(".ag-row[row-id]").its("length").should("be.lessThan", total - 1);
    });
  });

  it("shows the same 14 columns as the Naive tab, and each price with its own decimals", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.get(".ag-header-row-column [role=columnheader]").should("have.length", 14);
    cy.get('.ag-row[row-id="0"]').then(($row) => {
      const text = (column: string) => $row.find(`[col-id="${column}"]`).text();
      expect(text("currency")).to.equal("USD");
      expect(text("decimals")).to.equal("2");
      expect(text("tickSize")).to.equal("0.01");
      for (const column of ["bid", "ask", "last", "prevClose"]) expect(text(column)).to.match(PRICE);
    });
  });

  it("starts at a readable pace of one redraw every 1.5 seconds, and goes to every frame when set to 0", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.get("#refresh-seconds").should("have.value", "1.5");
    setRefresh("0");
    lastOfFirstRow()
      .invoke("text")
      .then((first) => {
        lastOfFirstRow().should(($cell) => expect($cell.text()).not.to.equal(first));
      });
  });

  it("keeps changing prices as the market moves, at the default pace too", () => {
    cy.visit("/");
    waitForLiveGrid();
    lastOfFirstRow()
      .invoke("text")
      .then((first) => {
        lastOfFirstRow().should(($cell) => expect($cell.text()).not.to.equal(first));
      });
  });

  it("freezes the numbers on screen while updates keep arriving, and catches up when resumed", () => {
    cy.visit("/");
    waitForLiveGrid();
    setRefresh("0");
    cy.contains("button", "Freeze stream").click().should("have.attr", "aria-pressed", "true");
    lastOfFirstRow().invoke("text").then((frozen) => {
      // The market keeps moving behind the frozen grid; the cell does not.
      cy.get(".hud-metrics").should("contain.text", "Updates per second");
      lastOfFirstRow().should("have.text", frozen);
      cy.contains("button", "Freeze stream").click().should("have.attr", "aria-pressed", "false");
      lastOfFirstRow().should(($cell) => expect($cell.text()).not.to.equal(frozen));
    });
  });

  it("sorts and filters while the market keeps moving", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.contains(".ag-header-cell", "Symbol").click();
    cy.contains(".ag-header-cell", "Symbol").should("have.attr", "aria-sort", "ascending");
    cy.contains(".ag-header-cell", "Currency").find(".ag-header-cell-filter-button").click();
    cy.get('[aria-label="Filter Value"]').type("EUR");
    // The filter applies a moment after typing, so keep checking until every row left on screen is EUR.
    cy.get('.ag-row[row-id] [col-id="currency"]').should(($cells) => {
      expect($cells.length).to.be.greaterThan(0);
      for (const cell of $cells) expect(cell.textContent).to.equal("EUR");
    });
  });

  it("stops the worker's connection when the tab is left", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.get("#tab-naive").click();
    cy.get(".optimized-page").should("not.exist");
    cy.get("tbody tr", { timeout: 20000 }).should("have.length.greaterThan", 10); // Naive has its own connection
  });
});
