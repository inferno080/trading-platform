import { NaiveMiniChart } from "../../../src/naive/NaiveMiniChart";
import { countInk, series } from "../../support/canvas";
import { withI18n } from "../../support/render";

const climbing = series(60, (i) => 30000 + i * 5);
const falling = series(60, (i) => 30000 - i * 5);
const mini = (data: number[] | undefined) => withI18n(<NaiveMiniChart symbol="AAB" decimals={2} data={data} />);

describe("NaiveMiniChart", () => {
  it("shows a small skeleton, announced as loading, until its data arrives", () => {
    cy.mount(mini(undefined));
    cy.get(".mini-area .chart-overlay").should("have.attr", "role", "status").and("contain.text", "Loading price history");
    cy.get(".mini-area svg.skeleton").should("have.attr", "height", "56");
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "false");
  });

  it("draws the line and removes the skeleton when the data arrives", () => {
    cy.mount(mini(undefined));
    cy.mount(mini(climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "true");
    cy.get(".chart-overlay").should("not.exist");
    cy.get("canvas.mini-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(50));
  });

  it("writes the newest price and how far it moved, with an arrow, and colors it by direction", () => {
    cy.mount(mini(climbing));
    cy.get(".mini-caption").should("contain.text", "302.95").and("contain.text", "▲").and("have.attr", "data-direction", "1");
    cy.mount(mini(falling));
    cy.get(".mini-caption").should("contain.text", "▼").and("have.attr", "data-direction", "-1");
  });

  it("has an empty caption until there is data", () => {
    cy.mount(mini(undefined));
    cy.get(".mini-caption").should("have.text", "").and("have.attr", "data-direction", "0");
  });

  it("describes the chart in words for assistive technology", () => {
    cy.mount(mini(climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label").and("contain", "AAB price over the last");
  });
});
