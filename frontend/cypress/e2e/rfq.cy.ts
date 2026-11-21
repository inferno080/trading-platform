import { NAIVE, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// These need the real backend (the simulated dealer answers after a short think). They check a request for a quote
// end to end on both tabs: asking, seeing the quote, taking it or turning it down, and the keyboard.

const TABS = [
  { name: "Naive", url: NAIVE, ready: waitForLiveTable },
  { name: "Optimized", url: "/", ready: waitForLiveGrid },
];

const openTicket = () => {
  cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
  cy.contains(".symbol-detail-header button", "Request a quote").click();
  cy.get("dialog[open]").should("exist");
};
const ask = (quantity: string, side: "buy" | "sell" = "buy") => {
  cy.get(`input[value=${side}]`).check();
  cy.get("#rfq-quantity").clear().type(`${quantity}{enter}`);
};

for (const tab of TABS) {
  describe(`asking for a quote on the ${tab.name} tab`, () => {
    beforeEach(() => {
      cy.visit(tab.url);
      tab.ready();
      openTicket();
    });

    it("gets a quote from the dealer and fills it when it is accepted", () => {
      ask("4888");
      cy.get(".rfq-message", { timeout: 15_000 }).should("contain.text", "You buy 4,888 AAA at");
      cy.get(".rfq-countdown").should("contain.text", "s left");
      cy.contains("button", "Accept").click();
      cy.get(".rfq-message", { timeout: 15_000 }).should("contain.text", "Done: bought 4,888 AAA at");
      cy.get(".rfq-detail").should("contain.text", "Trade reference");
    });

    it("quotes a sale, and lets it be turned down with the Reject button", () => {
      ask("100", "sell");
      cy.get(".rfq-message", { timeout: 15_000 }).should("contain.text", "You sell 100 AAA at");
      cy.contains("button", "Reject").click();
      cy.get(".rfq-message").should("have.text", "You turned the quote down.");
    });

    it("turns a quote down on the first Escape, and closes the dialog on the second", () => {
      ask("100");
      cy.get(".rfq-message", { timeout: 15_000 }).should("contain.text", "You buy 100 AAA at");
      cy.get(".rfq-status").should("be.focused");
      cy.realPress("Escape");
      cy.get(".rfq-message").should("have.text", "You turned the quote down.");
      cy.get("dialog[open]").should("exist");
      cy.realPress("Escape");
      cy.get("dialog[open]").should("not.exist");
      cy.get("#symbol-detail-title").should("exist"); // the chart panel behind it stayed open
    });

    it("refuses an impossible quantity without asking the server", () => {
      ask("0");
      cy.get("#rfq-quantity-error").should("be.visible");
      cy.get(".rfq-message").should("not.exist");
    });

    it("has no accessibility violations while a quote is open", () => {
      ask("100");
      cy.get(".rfq-message", { timeout: 15_000 }).should("contain.text", "You buy 100 AAA at");
      cy.injectAxe();
      cy.checkA11y("dialog", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } });
    });
  });
}
