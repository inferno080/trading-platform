import { NAIVE, waitForChartDrawn, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// These need the real backend (see live-dashboard.cy.ts). They check the price chart end to end, on both tabs: the
// history is fetched from the server, live prices are folded in, and the panel behaves like the page around it.

const TABS = [
  { name: "Naive", url: NAIVE, ready: waitForLiveTable, pick: (symbol: string) => cy.contains(".table-wrap tbody tr", symbol).find("button").click() },
  { name: "Optimized", url: "/", ready: waitForLiveGrid, pick: (symbol: string) => cy.contains(".ag-row [col-id=sym]", symbol).click() },
];

for (const tab of TABS) {
  describe(`the price chart on the ${tab.name} tab`, () => {
    beforeEach(() => {
      cy.visit(tab.url);
      tab.ready();
    });

    it("opens AAA's chart as the page loads, with its history from the server", () => {
      cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("match", /^AAA price over the last [45] minutes: last [\d,.]+, high [\d,.]+, low [\d,.]+\.$/);
    });

    it("shows the instrument's name, currency, tick size and decimals, which are not columns in the quotes", () => {
      cy.get(".symbol-detail-name").should("contain.text", "USD").and("contain.text", "Tick size 0.01").and("contain.text", "Decimals 2");
    });

    it("keeps the chart's last price in step with the live price in the quotes", () => {
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").invoke("attr", "aria-label").should("match", /last [\d,]+\.\d\d/);
    });

    it("shows a crosshair with a time and price when the pointer is over the chart", () => {
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").then(($canvas) => {
        const element = $canvas[0] as HTMLCanvasElement;
        const context = element.getContext("2d", { willReadFrequently: true })!;
        const ink = () => context.getImageData(0, 0, element.width, element.height).data.filter((_, i) => i % 4 === 3 && _ > 0).length;
        const before = ink();
        cy.get("canvas.chart-canvas").realHover({ position: { x: 400, y: 100 } });
        cy.get("canvas.chart-canvas").should(() => expect(ink()).to.be.greaterThan(before));
      });
    });

    it("opens another symbol's chart, with its own history", () => {
      tab.pick("AAB");
      cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("contain", "AAB price over the last");
    });

    it("draws an instrument with its own decimals: a yen price has none", () => {
      tab.pick("AAH");
      cy.get("#symbol-detail-title").should("have.text", "AAH price chart");
      cy.get(".symbol-detail-name").should("contain.text", "JPY").and("contain.text", "Decimals 0");
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("match", /last [\d,]+, high [\d,]+, low [\d,]+\./);
    });

    it("closes with Escape and the Close chart button, and opens again", () => {
      cy.get("#symbol-detail-title").should("exist");
      cy.realPress("Escape"); // a real key press: Cypress's type() would first click the middle of the page, which picks a row
      cy.get("section.symbol-detail").should("not.exist");
      tab.pick("AAA");
      cy.get("#symbol-detail-title").should("exist");
      cy.contains("button", "Close chart").click();
      cy.get("section.symbol-detail").should("not.exist");
    });

    it("does not move keyboard focus into the chart that opened by itself", () => {
      cy.get("#symbol-detail-title").should("exist");
      cy.get("#symbol-detail-title").should("not.have.focus");
    });

    it("shows the price, its move since the previous close, and \"Today\" above the chart", () => {
      cy.get(".symbol-detail .price-now").invoke("text").should("match", /^[\d,]+\.\d\d$/);
      cy.get(".symbol-detail .price-move").invoke("text").should("match", /^[▲▼] ?[+−-]?\d+\.\d\d%$/);
      cy.get(".symbol-detail .price-today").invoke("text").should("match", /^\([+−-]?[\d,]+\.\d\d\) Today$/);
    });

    it("shows a live order book of ten levels a side, best prices first, and the latest trades beside it", () => {
      cy.get("table.book tbody tr", { timeout: 20000 }).should("have.length", 10);
      cy.get("table.book tbody tr").first().find("td").then(($cells) => {
        const [, bid, ask] = [...$cells].map((cell) => Number((cell.textContent ?? "").replace(/,/g, "")));
        expect(ask, "the best ask is above the best bid").to.be.greaterThan(bid!);
      });
      cy.get("table.tape tbody tr", { timeout: 30000 }).should("have.length.greaterThan", 0).and("have.length.at.most", 10);
      cy.get("table.tape tbody tr").first().invoke("text").should("match", /Buy|Sell/);
    });

    it("keeps the order book live", () => {
      cy.get("table.book tbody", { timeout: 20000 }).invoke("text").then((before) => {
        cy.get("table.book tbody", { timeout: 20000 }).should(($tbody) => expect($tbody.text()).not.to.equal(before));
      });
    });

    it("replaces the order book when another chart is opened, and its skeleton never shows the old symbol's prices", () => {
      cy.get("table.book tbody tr", { timeout: 20000 }).should("have.length", 10);
      tab.pick("AAB");
      cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
      cy.get("table.book tbody tr", { timeout: 20000 }).should("have.length", 10);
    });

    it("is drawn in the dark theme's colors when the theme is switched", () => {
      waitForChartDrawn();
      cy.get("[role=switch]").click();
      cy.get("html").should("have.attr", "data-theme", "dark");
      waitForChartDrawn();
    });
  });
}
