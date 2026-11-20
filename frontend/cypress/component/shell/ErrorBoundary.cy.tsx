import { ErrorBoundary } from "../../../src/shell/ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders its children when nothing goes wrong", () => {
    cy.mount(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <p>all good</p>
      </ErrorBoundary>,
    );
    cy.contains("all good").should("exist");
    cy.contains("fallback").should("not.exist");
  });

  it("shows the fallback instead of a blank page when a child fails", () => {
    // React reports the error it caught; keep the expected error from failing the test.
    Cypress.once("uncaught:exception", () => false);
    cy.mount(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    cy.contains("fallback").should("exist");
  });

  it("also says what failed in the console, since the fallback does not", () => {
    Cypress.once("uncaught:exception", () => false);
    cy.window().then((win) => cy.spy(win.console, "error").as("consoleError"));
    cy.mount(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    cy.get("@consoleError").should("be.calledWithMatch", "A view failed to render:");
  });
});
