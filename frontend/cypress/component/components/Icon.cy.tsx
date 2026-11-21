import { Icon, type IconName } from "../../../src/components/Icon";

const NAMES: IconName[] = ["eye", "eye-off", "plus", "minus", "x"];

describe("Icon", () => {
  it("is decorative: hidden from assistive technology and not focusable, since the button's words say what it does", () => {
    for (const name of NAMES) {
      cy.mount(<Icon name={name} />);
      cy.get("svg.icon").should("have.attr", "aria-hidden", "true").and("have.attr", "focusable", "false");
    }
  });

  it("is a small square, drawn in the current text color", () => {
    cy.mount(
      <p style={{ color: "rgb(1, 2, 3)" }}>
        <Icon name="plus" />
      </p>,
    );
    cy.get("svg.icon").should("have.attr", "width", "14").and("have.attr", "height", "14").and("have.attr", "stroke", "currentColor");
    cy.get("svg.icon").should("have.css", "color", "rgb(1, 2, 3)");
  });

  it("draws an eye with a pupil", () => {
    cy.mount(<Icon name="eye" />);
    cy.get("svg circle").should("have.length", 1);
    cy.get("svg line").should("have.length", 0);
  });

  it("draws a crossed-out eye with a slash", () => {
    cy.mount(<Icon name="eye-off" />);
    cy.get('svg line[x1="1"][y1="1"]').should("exist");
  });

  it("draws a plus as two crossing lines, a minus as one, and a cross as two diagonals", () => {
    cy.mount(<Icon name="plus" />);
    cy.get("svg line").should("have.length", 2);
    cy.mount(<Icon name="minus" />);
    cy.get("svg line").should("have.length", 1);
    cy.mount(<Icon name="x" />);
    cy.get("svg line").should("have.length", 2);
  });

  it("does not shrink inside a flex row", () => {
    cy.mount(
      <div style={{ display: "flex", width: 10 }}>
        <Icon name="x" />
      </div>,
    );
    cy.get("svg.icon").should(($icon) => expect($icon[0]!.getBoundingClientRect().width).to.equal(14));
  });
});
