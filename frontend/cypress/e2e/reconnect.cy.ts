import { NAIVE, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// These need the real backend. They check, on both tabs, that a dropped connection is noticed and reopened by the
// page itself, and that the chaos controls reach the server.

const TABS = [
  { name: "Naive", url: NAIVE, ready: waitForLiveTable },
  { name: "Optimized", url: "/", ready: waitForLiveGrid },
];
const openChaos = () => cy.contains("summary", "Chaos controls").click();
const status = () => cy.get(".toolbar .status");

for (const tab of TABS) {
  describe(`reconnecting and the chaos controls on the ${tab.name} tab`, () => {
    beforeEach(() => {
      cy.visit(tab.url);
      tab.ready();
      openChaos();
    });

    it("notices a dropped connection, counts down to the next attempt, and is live again by itself", () => {
      cy.contains("button", "Drop the connection").click();
      status().should("have.attr", "data-status", "reconnecting").and("contain.text", "Reconnecting (attempt");
      cy.get(".reconnect-countdown").should("contain.text", "next try in");
      status().should("have.attr", "data-status", "live");
      cy.contains("button", "Retry now").should("not.exist");
    });

    it("tries at once when Retry now is pressed", () => {
      cy.contains("button", "Drop the connection").click();
      cy.contains("button", "Retry now").click();
      status().should("have.attr", "data-status", "live");
    });

    it("has the open chart and its order book again after reconnecting", () => {
      cy.contains("button", "Drop the connection").click();
      status().should("have.attr", "data-status", "live");
      cy.get("table.book tbody tr", { timeout: 20_000 }).should("have.length", 10);
    });

    it("sends the chosen fault to the server and says what it sent", () => {
      cy.contains("button", "Add latency").click();
      cy.get(".chaos-sent").should("have.text", "Sent: Add latency (500 ms)");
      cy.contains("button", "Reset all faults").click();
      cy.get(".chaos-sent").should("have.text", "Sent: Reset all faults");
      status().should("have.attr", "data-status", "live");
    });

    it("keeps the page working through a lost frame, by asking for a fresh snapshot", () => {
      cy.contains("button", "Lose a frame").click();
      status().should("have.attr", "data-status", "live");
      cy.get("#symbol-detail-title").should("exist");
      cy.contains("button", "Drop the connection").should("be.enabled");
    });
  });
}
