import { NaiveMiniChart } from "../../../src/naive/NaiveMiniChart";
import { countInk, series } from "../../support/canvas";
import { withI18n } from "../../support/render";

const climbing = series(60, (i) => 30000 + i * 5);
const falling = series(60, (i) => 30000 - i * 5);
const mini = (data: number[] | undefined) => withI18n(<NaiveMiniChart symbol="AAB" decimals={2} prevClose={29800} data={data} />);

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

  it("shows the newest price, large, with how far it moved since the previous close and the amount, and Today", () => {
    cy.mount(mini(climbing)); // newest 302.95 against a previous close of 298.00
    cy.get(".price-line-small .price-now").should("have.text", "302.95");
    cy.get(".price-line-small .price-move").should("contain.text", "▲").and("contain.text", "+1.66%");
    cy.get(".price-line-small .price-today").should("contain.text", "(+4.95)").and("contain.text", "Today");
    cy.get(".price-line-small").should("have.attr", "data-direction", "1");
  });

  it("shows a fall against the previous close in the down direction", () => {
    cy.mount(mini(falling)); // newest 297.05
    cy.get(".price-line-small .price-now").should("have.text", "297.05");
    cy.get(".price-line-small .price-move").should("contain.text", "▼").and("contain.text", "0.32%");
    cy.get(".price-line-small").should("have.attr", "data-direction", "-1");
  });

  it("has an empty price line, which keeps its height, until there is data", () => {
    cy.mount(mini(undefined));
    cy.get(".price-line-small").should("have.text", "").and("have.attr", "data-direction", "0");
  });

  it("draws a faint dotted line at the previous close", () => {
    cy.mount(mini(climbing));
    cy.get("canvas.mini-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(50));
  });

  it("describes the chart in words for assistive technology", () => {
    cy.mount(mini(climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label").and("contain", "AAB price over the last");
  });
});
