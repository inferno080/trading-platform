import { Toast } from "../../../src/watchlist/Toast";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

const message = (text: string, nonce = 1) => ({ text, nonce });
// A short duration, so the tests use real timers and do not have to wait seven seconds.
const SHORT = 400;
const mountToast = (toast: ReturnType<typeof message> | null, onDismiss = cy.stub().as("dismiss"), durationMs = SHORT) => {
  cy.mount(
    withI18n(
      <>
        <Toast toast={toast} onDismiss={onDismiss} durationMs={durationMs} />
        <p id="elsewhere">elsewhere</p>
      </>,
    ),
  );
};

describe("Toast", () => {
  it("is a polite live region that is always on the page, so a screen reader announces each message when it appears", () => {
    mountToast(null);
    cy.get(".toast-region").should("have.attr", "role", "status").and("have.attr", "aria-live", "polite");
    cy.get(".toast").should("not.exist");
  });

  it("shows its message with a Dismiss button", () => {
    mountToast(message("The watchlist is full."));
    cy.get(".toast").should("contain.text", "The watchlist is full.");
    cy.get(".toast button").should("have.text", "Dismiss");
  });

  it("does not take keyboard focus when it appears", () => {
    mountToast(message("Hello"));
    cy.get(".toast").should("exist");
    cy.focused().should("not.exist");
  });

  it("calls onDismiss when Dismiss is pressed, by mouse or by keyboard", () => {
    mountToast(message("Hello"));
    cy.get(".toast button").click();
    cy.get("@dismiss").should("have.been.calledOnce");
    cy.get(".toast button").focus().realPress("Enter");
    cy.get("@dismiss").should("have.been.calledTwice");
  });

  it("goes away by itself after its duration, which is seven seconds unless told otherwise", () => {
    mountToast(message("Hello"));
    cy.get("@dismiss", { timeout: 4000 }).should("have.been.calledOnce");
  });

  it("waits while the pointer is on it, and starts counting again when the pointer leaves", () => {
    mountToast(message("Hello"));
    cy.get(".toast").realHover();
    afterFrames(90); // far longer than its duration
    cy.get("@dismiss").should("not.have.been.called");
    cy.get("#elsewhere").realHover();
    cy.get("@dismiss", { timeout: 4000 }).should("have.been.calledOnce");
  });

  it("waits while keyboard focus is inside it, and starts counting again when focus leaves", () => {
    mountToast(message("Hello"));
    cy.get(".toast button").focus();
    afterFrames(90);
    cy.get("@dismiss").should("not.have.been.called");
    cy.get(".toast button").blur();
    cy.get("@dismiss", { timeout: 4000 }).should("have.been.calledOnce");
  });

  it("starts the countdown again for a new message, even one with the same words", () => {
    const onDismiss = cy.stub().as("dismiss");
    mountToast(message("Hello", 1), onDismiss, 1500);
    afterFrames(60); // about a second in
    mountToast(message("Hello", 2), onDismiss, 1500);
    afterFrames(60); // about two seconds since the first message, one since the second
    cy.get("@dismiss").should("not.have.been.called");
    cy.get("@dismiss", { timeout: 4000 }).should("have.been.calledOnce");
  });

  it("says Dismiss in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    mountToast(message("満杯です"));
    cy.get(".toast button").should("have.text", "閉じる");
  });
});
