import { SkeletonSvg, type Bar } from "../../../src/components/SkeletonSvg";
import { installMatchMedia } from "../../support/matchMedia";

const bars: Bar[] = [
  { x: 0, y: 0, width: 100, height: 10 },
  { x: "10%", y: 20, width: "50%", height: 10, rx: 2 },
];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

describe("SkeletonSvg", () => {
  it("draws one rounded rectangle per bar at the requested size", () => {
    cy.mount(<SkeletonSvg height={40} bars={bars} />);
    cy.get("svg.skeleton").should("have.attr", "height", "40").and("have.attr", "width", "100%");
    cy.get("svg.skeleton rect").should("have.length", 2);
    cy.get("svg.skeleton rect").first().should("have.attr", "rx", "4"); // default radius
    cy.get("svg.skeleton rect").last().should("have.attr", "rx", "2").and("have.attr", "x", "10%");
  });

  it("is hidden from assistive technology, because it is decoration", () => {
    cy.mount(<SkeletonSvg height={40} bars={bars} />);
    cy.get("svg.skeleton").should("have.attr", "aria-hidden", "true").and("have.attr", "focusable", "false");
  });

  it("fills every bar with the shimmer gradient and animates it", () => {
    cy.mount(<SkeletonSvg height={40} bars={bars} />);
    cy.get("linearGradient").invoke("attr", "id").then((id) => {
      cy.get("svg.skeleton rect").each(($rect) => expect($rect.attr("fill")).to.equal(`url(#${id})`));
    });
    cy.get("animateTransform").should("exist");
  });

  it("stops the shimmer when the user prefers reduced motion", () => {
    installMatchMedia({ [REDUCED_MOTION]: true });
    cy.mount(<SkeletonSvg height={40} bars={bars} />);
    cy.get("svg.skeleton rect").should("have.length", 2);
    cy.get("animateTransform").should("not.exist");
  });

  it("gives each skeleton its own gradient, so several can share a page", () => {
    cy.mount(
      <div>
        <SkeletonSvg height={20} bars={bars} />
        <SkeletonSvg height={20} bars={bars} />
      </div>,
    );
    cy.get("linearGradient").should("have.length", 2);
    cy.get("linearGradient").then(($gradients) => {
      expect($gradients[0]?.id).not.to.equal($gradients[1]?.id);
    });
  });
});
