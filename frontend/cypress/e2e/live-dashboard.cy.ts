import { waitForLiveTable } from "../support/e2e";

// These tests need the real backend running on port 8080. Run it with a light feed
// (INSTRUMENTS=200 UPDATES_PER_SEC=500 npm start) so the page stays responsive on any machine.

describe("the live dashboard", () => {
  it("connects to the backend and fills the table", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("h1").should("have.text", "Trading Dashboard");
    cy.title().should("equal", "Trading Dashboard");
  });

  it("shows readable prices, spreads and sizes", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("tbody tr").first().find("td").then(($cells) => {
      const [bid, ask, spread, last, bidSize, askSize, volume] = [...$cells].map((c) => c.textContent ?? "");
      expect(bid).to.match(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      expect(ask).to.match(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      expect(Number(ask?.replace(/,/g, ""))).to.be.greaterThan(Number(bid?.replace(/,/g, "")));
      expect(spread).to.match(/^\d+\.\d{2}$/);
      expect(last).to.match(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      expect(bidSize).to.match(/^[\d,]+$/);
      expect(askSize).to.match(/^[\d,]+$/);
      expect(volume).to.match(/^[\d,]+$/);
    });
  });

  it("keeps updating as the feed streams", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("tbody").invoke("text").then((before) => {
      cy.get("tbody", { timeout: 15000 }).should(($tbody) => expect($tbody.text()).not.to.equal(before));
    });
  });

  it("shows live numbers in the performance panel", () => {
    cy.visit("/");
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
    cy.visit("/");
    cy.get("[role=status]").should("contain.text", "Loading");
    cy.get("svg.skeleton").should("exist");
    cy.get("svg.skeleton animateTransform").should("exist");
    waitForLiveTable();
    cy.get("svg.skeleton").should("not.exist");
  });

  it("shows an error with a way to reload when the page code cannot be downloaded", () => {
    cy.intercept("**/assets/NaivePage*.js", { forceNetworkError: true });
    cy.visit("/");
    cy.get("[role=alert]").should("contain.text", "This view could not be loaded.");
    cy.contains("button", "Reload").should("be.visible");
  });
});
