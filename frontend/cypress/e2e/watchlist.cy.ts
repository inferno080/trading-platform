import { NAIVE, waitForChartDrawn, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// These need the real backend. They check the watchlist end to end on both tabs: adding subscribes on the server,
// the mini charts fill from real history, the panel collapses, and the list survives a reload.

const TABS = [
  {
    name: "Naive",
    url: NAIVE,
    ready: waitForLiveTable,
    pick: (symbol: string) => cy.contains("tbody tr", symbol).find("button").click(),
    quotesWidth: () => cy.get(".table-wrap"),
  },
  {
    name: "Optimized",
    url: "/",
    ready: waitForLiveGrid,
    pick: (symbol: string) => cy.contains(".ag-row [col-id=sym]", symbol).click(),
    quotesWidth: () => cy.get(".grid-wrap"),
  },
];
const items = () => cy.get(".watchlist .watch-item");
const addToWatchlist = (tab: (typeof TABS)[number], symbol: string) => {
  tab.pick(symbol);
  cy.get("#symbol-detail-title").should("have.text", `${symbol} price chart`);
  cy.contains("button", "Add to watchlist").click();
};

for (const tab of TABS) {
  describe(`the watchlist on the ${tab.name} tab`, () => {
    beforeEach(() => {
      cy.visit(tab.url);
      tab.ready();
    });

    it("starts empty, open, beside the quotes", () => {
      cy.get(".watchlist-toggle").should("have.text", "Watchlist (0)").and("have.attr", "aria-expanded", "true");
      cy.get(".watchlist-empty").should("exist");
      cy.get(".workspace").should("have.attr", "data-watchlist", "open");
    });

    it("puts the quotes and the watchlist side by side, 70% and 30%", () => {
      cy.get(".workspace-main").then(($main) => {
        cy.get(".workspace-side").then(($side) => {
          const main = $main[0]!.getBoundingClientRect().width;
          const side = $side[0]!.getBoundingClientRect().width;
          expect(main / (main + side)).to.be.within(0.69, 0.71);
        });
      });
    });

    it("adds a symbol from its chart, shows a mini chart filled from real history, and keeps it live", () => {
      addToWatchlist(tab, "AAA");
      cy.get(".watchlist-toggle").should("have.text", "Watchlist (1)");
      items().should("have.length", 1).first().should("contain.text", "AAA");
      items().first().find('canvas.mini-canvas[data-ready="true"]', { timeout: 30000 }).should("exist");
      items().first().find(".mini-caption").invoke("text").should("match", /^[\d,]+\.\d\d {2}[▲▼]? ?[+−-]?\d+\.\d\d%$/);
      cy.contains("button", "Remove from watchlist").should("exist");
    });

    it("holds up to four symbols and shows a toast for a fifth", () => {
      for (const symbol of ["AAA", "AAB", "AAC", "AAD"]) addToWatchlist(tab, symbol);
      items().should("have.length", 4);
      addToWatchlist(tab, "AAE");
      cy.get(".toast").should("contain.text", "The watchlist is full (4 symbols). Remove one to add another.");
      items().should("have.length", 4);
      cy.get(".toast button").click();
      cy.get(".toast").should("not.exist");
    });

    it("removes a symbol, which unsubscribes it on the server, and frees its place", () => {
      for (const symbol of ["AAA", "AAB", "AAC", "AAD"]) addToWatchlist(tab, symbol);
      cy.get('button[aria-label="Remove AAB from the watchlist"]').click();
      items().should("have.length", 3);
      cy.get("#watchlist-title").should("have.focus");
      addToWatchlist(tab, "AAE");
      items().should("have.length", 4).and("contain.text", "AAE");
      cy.get(".toast").should("not.exist");
    });

    it("opens a symbol's chart from its watchlist entry", () => {
      addToWatchlist(tab, "AAC");
      cy.contains("button", "Close chart").click();
      cy.get('button[aria-label="Open the AAC chart"]').click();
      cy.get("#symbol-detail-title").should("have.text", "AAC price chart");
      waitForChartDrawn();
    });

    it("collapses, giving the quotes the whole width, and expands again", () => {
      tab.quotesWidth().then(($quotes) => {
        const open = $quotes[0]!.getBoundingClientRect().width;
        cy.get(".watchlist-toggle").click();
        cy.get(".watchlist").should("not.exist");
        tab.quotesWidth().should(($q) => expect($q[0]!.getBoundingClientRect().width).to.be.greaterThan(open * 1.3));
        cy.get(".watchlist-toggle").click();
        cy.get(".watchlist").should("exist");
      });
    });

    it("keeps its symbols, and whether it is collapsed, across a reload", () => {
      addToWatchlist(tab, "AAA");
      addToWatchlist(tab, "AAB");
      cy.get(".watchlist-toggle").click(); // collapse
      cy.reload();
      tab.ready();
      cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
      cy.get(".watchlist-toggle").should("have.text", "Watchlist (2)").click();
      items().should("have.length", 2);
      items().first().find('canvas.mini-canvas[data-ready="true"]', { timeout: 30000 }).should("exist");
    });

    it("can be used with the keyboard alone", () => {
      cy.contains("button", "Add to watchlist").focus().realPress("Enter");
      items().should("have.length", 1);
      cy.get(".watchlist-toggle").focus().realPress("Space");
      cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
      cy.get(".watchlist-toggle").realPress("Enter");
      cy.get('button[aria-label="Remove AAA from the watchlist"]').focus().realPress("Enter");
      items().should("have.length", 0);
    });
  });
}

describe("the watchlist is shared between the tabs", () => {
  it("shows on the other tab what was added on this one", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.contains("button", "Add to watchlist").click();
    cy.get("#tab-optimized").click();
    waitForLiveGrid();
    cy.get(".watchlist .watch-item").should("have.length", 1).and("contain.text", "AAA");
  });
});
