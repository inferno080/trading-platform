import { NAIVE, waitForLiveTable } from "../support/e2e";

// These tests need the real backend running on port 8080. Run it with a light feed
// (INSTRUMENTS=200 UPDATES_PER_SEC=500 npm start) so the page stays responsive on any machine.

describe("the live dashboard", () => {
  it("connects to the backend and fills the table", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("h1").should("have.text", "Trading Dashboard");
    cy.title().should("equal", "Trading Dashboard");
  });

  it("shows the reference data and readable prices for the first instrument", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("tbody tr").first().find("td").then(($cells) => {
      // The data cells after the symbol, in column order.
      const columns = ["name", "currency", "bid", "ask", "spread", "last", "prevClose", "change", "bidSize", "askSize", "volume"] as const;
      const row = Object.fromEntries(columns.map((column, index) => [column, $cells[index]?.textContent ?? ""])) as Record<(typeof columns)[number], string>;
      const price = /^\d{1,3}(,\d{3})*\.\d{2}$/; // the first instrument is a USD equity with 2 decimals
      const whole = (text: string) => Number(text.replace(/,/g, ""));

      expect(row.name).to.match(/^[A-Z][a-z]+ [A-Z][a-z]+ Inc\.$/);
      expect(row.currency).to.equal("USD");
      for (const value of [row.bid, row.ask, row.last, row.prevClose]) expect(value).to.match(price);
      expect(whole(row.ask)).to.be.greaterThan(whole(row.bid));
      expect(row.spread).to.match(/^\d+\.\d{2}$/);
      expect(row.change).to.match(/^[+-]?\d+\.\d{2}%$/);
      for (const value of [row.bidSize, row.askSize, row.volume]) expect(value).to.match(/^[\d,]+$/);
    });
  });

  it("prices every kind of instrument with its own number of decimals", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("tbody tr").then(($rows) => {
      // Columns: symbol (th), then name, currency, bid, ask, spread, last, prev close, chg, sizes, volume.
      const seen = new Set<string>();
      for (const row of $rows) {
        const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "");
        const [, currency, bid, ask, spread, last, prevClose] = cells;
        const fraction = (text: string | undefined) => (text ?? "").split(".")[1]?.length ?? 0;
        const decimals = fraction(bid);
        const kind = `${currency} ${decimals}dp`;
        seen.add(kind);
        // Every price of an instrument has the same number of decimals: the instrument's own.
        for (const [name, value] of Object.entries({ ask, spread, last, prevClose })) {
          expect(fraction(value), `${kind} ${name} ${value}`).to.equal(decimals);
        }
      }
      expect([...seen].sort()).to.deep.equal(["EUR 3dp", "JPY 0dp", "USD 2dp", "USD 4dp"]);
    });
  });

  it("keeps updating as the feed streams", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("tbody").invoke("text").then((before) => {
      cy.get("tbody", { timeout: 15000 }).should(($tbody) => expect($tbody.text()).not.to.equal(before));
    });
  });

  it("shows live numbers in the performance panel", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.contains(".hud-metric", "Messages per second").find("dd", { timeout: 15000 }).should(($dd) => {
      expect($dd.text()).not.to.equal("–");
      expect(Number($dd.text().replace(/,/g, ""))).to.be.greaterThan(0);
    });
    cy.contains(".hud-metric", "Frame rate").find("dd").should("not.have.text", "–");
    cy.contains(".hud-metric", "Sequence gaps").find("dd").should("have.text", "0");
  });

  it("shows a shimmering skeleton while the page code downloads", () => {
    cy.intercept("**/assets/NaivePage*.js", (request) => {
      request.on("response", (response) => {
        response.setDelay(1500);
      });
    });
    cy.visit(NAIVE);
    cy.get("[role=status]").should("contain.text", "Loading");
    cy.get("svg.skeleton").should("exist");
    cy.get("svg.skeleton animateTransform").should("exist");
    waitForLiveTable();
    cy.get("svg.skeleton").should("not.exist");
  });

  it("shows an error with a way to reload when the page code cannot be downloaded", () => {
    cy.intercept("**/assets/NaivePage*.js", { forceNetworkError: true });
    cy.visit(NAIVE);
    cy.get("[role=alert]").should("contain.text", "This view could not be loaded.");
    cy.contains("button", "Reload").should("be.visible");
  });
});
