import { ConnectionStatus } from "../../../src/components/ConnectionStatus";
import { withI18n } from "../../support/render";

describe("ConnectionStatus", () => {
  it("shows the state as text, with the state on the element so the dot can be coloured", () => {
    cy.mount(withI18n(<ConnectionStatus status="live" reconnect={null} onRetry={cy.stub()} />));
    cy.get(".status").should("have.attr", "data-status", "live").and("have.attr", "role", "status").and("have.text", "Live");
    cy.contains("button", "Retry now").should("not.exist");
  });

  it("says Connecting while it connects, with nothing to retry", () => {
    cy.mount(withI18n(<ConnectionStatus status="connecting" reconnect={null} onRetry={cy.stub()} />));
    cy.get(".status").should("have.text", "Connecting");
    cy.get(".reconnect-countdown").should("not.exist");
  });

  it("while reconnecting says which attempt is next, counts down to it and offers to retry now", () => {
    cy.clock(1_000_000, ["Date", "setInterval", "clearInterval"]);
    cy.mount(withI18n(<ConnectionStatus status="reconnecting" reconnect={{ attempt: 3, retryAt: 1_004_000 }} onRetry={cy.stub().as("retry")} />));
    cy.get(".status").should("have.attr", "data-status", "reconnecting").and("have.text", "Reconnecting (attempt 3)");
    cy.get(".reconnect-countdown").should("have.text", "next try in 4 s");
    cy.tick(2000);
    cy.get(".reconnect-countdown").should("have.text", "next try in 2 s");
    cy.tick(10_000);
    cy.get(".reconnect-countdown").should("have.text", "next try in 0 s"); // never negative
    cy.contains("button", "Retry now").click();
    cy.get("@retry").should("have.been.calledOnce");
  });

  it("keeps the ticking countdown out of what a screen reader hears, so it is not read every second", () => {
    cy.mount(withI18n(<ConnectionStatus status="reconnecting" reconnect={{ attempt: 1, retryAt: Date.now() + 5000 }} onRetry={cy.stub()} />));
    cy.get(".reconnect-countdown").should("have.attr", "aria-hidden", "true");
    cy.get(".status .reconnect-countdown").should("not.exist"); // it is not inside the live region
  });

  it("shows no countdown when reconnecting but no attempt is known yet", () => {
    cy.mount(withI18n(<ConnectionStatus status="reconnecting" reconnect={null} onRetry={cy.stub()} />));
    cy.get(".status").should("have.text", "Reconnecting");
    cy.contains("button", "Retry now").should("not.exist");
  });

  it("is in Japanese when the language is", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<ConnectionStatus status="reconnecting" reconnect={{ attempt: 2, retryAt: Date.now() + 3000 }} onRetry={cy.stub()} />));
    cy.get(".status").should("have.text", "再接続中 (2回目)");
    cy.contains("button", "今すぐ再試行").should("exist");
  });
});
