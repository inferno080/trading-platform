import { NAIVE, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

describe("navigation and keyboard use", () => {
  it("opens on the Optimized tab by default", () => {
    cy.visit("/");
    cy.get("[role=tab]").should("have.length", 2);
    cy.get("#tab-optimized").should("have.text", "Optimized").and("have.attr", "aria-selected", "true");
    cy.get("#tab-naive").should("have.text", "Naive").and("have.attr", "aria-selected", "false");
    cy.get("[role=tabpanel]").should("have.attr", "aria-labelledby", "tab-optimized");
  });

  it("opens the Naive tab from the URL, with live data", () => {
    cy.visit(NAIVE);
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");
    waitForLiveTable();
  });

  it("falls back to the Optimized tab for an unknown address", () => {
    cy.visit("/#/does-not-exist");
    cy.get("#tab-optimized").should("have.attr", "aria-selected", "true");
  });

  it("writes the selected tab into the URL, and shows live data only on the Naive tab", () => {
    cy.visit("/");
    cy.get(".optimized-page").should("exist");
    cy.get(".table-wrap").should("not.exist");

    cy.get("#tab-naive").click();
    cy.location("hash").should("equal", "#/naive");
    waitForLiveTable();

    cy.get("#tab-optimized").click();
    cy.location("hash").should("equal", "#/optimized");
    cy.get(".optimized-page").should("exist");
    cy.get(".table-wrap").should("not.exist"); // the Naive table is gone from the page, not just hidden
  });

  it("switches tabs with the arrow keys", () => {
    cy.visit("/");
    cy.get("#tab-optimized").focus().realPress("ArrowRight");
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true").and("have.focus");
    cy.location("hash").should("equal", "#/naive");
    cy.realPress("ArrowLeft");
    cy.get("#tab-optimized").should("have.attr", "aria-selected", "true").and("have.focus");
  });

  it("downloads the Naive code only when its tab is opened", () => {
    const requested: string[] = [];
    cy.intercept("**/assets/*.js", (request) => {
      requested.push(request.url.split("/").pop() ?? "");
    });
    const was = (prefix: string) => requested.some((name) => name.startsWith(prefix));

    cy.visit("/");
    cy.get(".optimized-page").should("exist").then(() => {
      expect(was("OptimizedPage"), "the default tab's code").to.equal(true);
      expect(was("NaivePage"), "the Naive code before opening its tab").to.equal(false);
    });
    cy.get("#tab-naive").click();
    cy.get(".status").should("exist").then(() => expect(was("NaivePage"), "the Naive code after opening its tab").to.equal(true));
  });

  it("moves focus to the content from the skip link, keeping the URL", () => {
    cy.visit("/#/optimized");
    cy.get(".skip-link").focus().realPress("Enter");
    cy.focused().should("have.attr", "id", "main");
    cy.location("hash").should("equal", "#/optimized");
  });

  it("can be used with the keyboard alone, in a sensible order", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("body").realPress("Tab");
    cy.focused().should("have.class", "skip-link");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "switch");
    cy.realPress("Tab");
    cy.focused().should("match", "select");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "tab").and("have.id", "tab-naive"); // only the selected tab is in the Tab order
    cy.realPress("Tab");
    cy.focused().should("have.class", "record-button"); // the end of the toolbar: record, then the watchlist toggle
    cy.realPress("Tab");
    cy.focused().should("have.class", "watchlist-toggle");
    cy.realPress("Tab");
    cy.focused().should("match", "summary").and("contain.text", "Performance"); // the performance panel, a disclosure
    cy.realPress("Tab");
    cy.focused().should("match", "summary").and("contain.text", "Chaos controls"); // the chaos controls, another
    cy.realPress("Tab");
    cy.focused().should("have.class", "symbol-detail-watch"); // the open chart's buttons
    cy.realPress("Tab");
    cy.focused().should("have.class", "rfq-open");
    cy.realPress("Tab");
    cy.focused().should("have.class", "symbol-detail-close");
    cy.realPress("Tab");
    cy.focused().should("have.class", "table-wrap"); // the scrollable table can be reached and scrolled by keyboard
  });

  it("shows a clear focus ring on whatever has keyboard focus", () => {
    cy.visit("/");
    waitForLiveGrid(); // let the page settle before pressing keys
    cy.get("body").realPress("Tab");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "switch").and("have.css", "outline-style", "solid").and("have.css", "outline-width", "2px");
  });

  it("toggles the theme from the keyboard", () => {
    cy.visit("/");
    cy.get("[role=switch]").focus().realPress("Enter");
    cy.get("[role=switch]").should("have.attr", "aria-checked", "true");
    cy.get("html").should("have.attr", "data-theme", "dark");
  });
});
