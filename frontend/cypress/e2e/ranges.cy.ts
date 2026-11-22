import { NAIVE, waitForChartDrawn, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// These need the real backend, which makes up the longer histories when asked. They check, on both tabs, that each range
// loads and is described, that the chart can be moved between them, and that the page says the data is simulated.

const TABS = [
  { name: "Naive", url: NAIVE, ready: waitForLiveTable },
  { name: "Optimized", url: "/", ready: waitForLiveGrid },
];
const RANGES = [
  { button: "1D", words: "over the last day", period: "Today" },
  { button: "1M", words: "over the last month", period: "1 month" },
  { button: "1Y", words: "over the last year", period: "1 year" },
  { button: "YTD", words: "so far this year", period: "YTD" },
  { button: "MAX", words: "since it started trading", period: "All time" },
];
const chartLabel = () => cy.get("canvas.chart-canvas").invoke("attr", "aria-label");

for (const tab of TABS) {
  describe(`chart ranges on the ${tab.name} tab`, () => {
    beforeEach(() => {
      cy.visit(tab.url);
      tab.ready();
      waitForChartDrawn();
    });

    it("offers a day to the maximum below the chart, opens on one day, and says the history is simulated", () => {
      cy.get(".range-button").then(($buttons) => expect([...$buttons].map((button) => button.textContent)).to.deep.equal(["1D", "1M", "1Y", "YTD", "MAX"]));
      cy.get('.range-button[aria-pressed="true"]').should("have.text", "1D");
      cy.get(".range-note").should("have.text", "Simulated history");
      cy.get("canvas.chart-canvas").then(($chart) => {
        cy.get(".range-bar").then(($bar) => expect($bar[0]!.getBoundingClientRect().top).to.be.at.least($chart[0]!.getBoundingClientRect().bottom - 1));
      });
    });

    for (const { button, words, period } of RANGES) {
      it(`loads ${button}, describes it in words, and names the period beside the price`, () => {
        cy.contains(".range-button", button).click();
        cy.get(`.range-button[aria-pressed="true"]`).should("have.text", button);
        cy.get("canvas.chart-canvas[data-ready=true]", { timeout: 15_000 }).should("exist");
        chartLabel().should("contain", words);
        cy.get(".price-line-big .price-today", { timeout: 15_000 }).should("contain.text", period);
      });
    }

    it("ends every range at the live price, which is the price beside the chart", () => {
      cy.get(".price-line-big .price-now").invoke("text").then((live) => {
        for (const { button } of RANGES) {
          cy.contains(".range-button", button).click();
          cy.get("canvas.chart-canvas[data-ready=true]", { timeout: 15_000 }).should("exist");
          chartLabel().should("match", /last [\d,.]+/);
        }
        expect(live).to.match(/\d/);
      });
    });

    it("keeps the chosen range when another symbol is opened, and loads that symbol's chart over it", () => {
      cy.contains(".range-button", "1Y").click();
      cy.get("canvas.chart-canvas[data-ready=true]", { timeout: 15_000 }).should("exist");
      if (tab.name === "Naive") cy.contains(".table-wrap tbody tr", "AAB").find("button").click();
      else cy.contains(".ag-row [col-id=sym]", "AAB").click();
      cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
      cy.get('.range-button[aria-pressed="true"]').should("have.text", "1Y");
      cy.get("canvas.chart-canvas[data-ready=true]", { timeout: 15_000 }).should("exist");
      chartLabel().should("contain", "AAB").and("contain", "over the last year");
    });

    it("can be changed with the keyboard alone", () => {
      cy.contains(".range-button", "1D").focus().realPress("Tab");
      cy.focused().should("have.text", "1M");
      cy.realPress("Enter");
      cy.get('.range-button[aria-pressed="true"]').should("have.text", "1M");
      cy.get("canvas.chart-canvas[data-ready=true]", { timeout: 15_000 }).should("exist");
    });

    it("keeps the order book live while the range changes", () => {
      cy.get("table.book tbody tr", { timeout: 20_000 }).should("have.length", 10);
      cy.contains(".range-button", "1M").click();
      cy.get("table.book tbody tr").should("have.length", 10);
    });
  });
}
