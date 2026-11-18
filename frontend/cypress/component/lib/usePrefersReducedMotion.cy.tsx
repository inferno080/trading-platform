import { installMatchMedia } from "../../support/matchMedia";
import { usePrefersReducedMotion } from "../../../src/lib/usePrefersReducedMotion";

const QUERY = "(prefers-reduced-motion: reduce)";

function Probe() {
  return <p data-cy="reduce">{String(usePrefersReducedMotion())}</p>;
}

describe("usePrefersReducedMotion", () => {
  it("is false when the OS has no motion preference", () => {
    installMatchMedia();
    cy.mount(<Probe />);
    cy.get("[data-cy=reduce]").should("have.text", "false");
  });

  it("is true when the OS asks to reduce motion", () => {
    installMatchMedia({ [QUERY]: true });
    cy.mount(<Probe />);
    cy.get("[data-cy=reduce]").should("have.text", "true");
  });

  it("updates when the setting changes while the page is open", () => {
    const media = installMatchMedia();
    cy.mount(<Probe />);
    cy.get("[data-cy=reduce]").should("have.text", "false");
    cy.then(() => media.set(QUERY, true));
    cy.get("[data-cy=reduce]").should("have.text", "true");
  });
});
