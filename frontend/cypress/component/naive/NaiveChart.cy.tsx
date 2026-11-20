import { NaiveChart } from "../../../src/naive/NaiveChart";
import { countInk, series } from "../../support/canvas";
import { withI18n } from "../../support/render";

const rising = series(300, (i) => 30000 + i * 2);
const chartElement = (data: number[] | null, unavailable = false) =>
  withI18n(
    <>
      <NaiveChart symbol="AAA" decimals={2} data={data} unavailable={unavailable} />
      <p id="elsewhere">elsewhere</p>
    </>,
  );
const inkNow = () => cy.get("canvas.chart-canvas").then(($c) => countInk($c[0] as HTMLCanvasElement));

describe("NaiveChart", () => {
  it("shows a chart skeleton, announced as loading, until its data arrives", () => {
    cy.mount(chartElement(null));
    cy.get(".chart-overlay svg.skeleton").should("exist");
    cy.get(".chart-overlay").should("have.attr", "role", "status").and("contain.text", "Loading price history");
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "false");
  });

  it("draws the chart and removes the skeleton when the data arrives", () => {
    cy.mount(chartElement(null));
    cy.mount(chartElement(rising));
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    cy.get(".chart-overlay").should("not.exist");
    cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(500));
  });

  it("redraws every time the data changes: that is what makes it the naive version", () => {
    cy.mount(chartElement(rising));
    cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(500));
    inkNow().then((before) => {
      cy.mount(chartElement(series(300, (i) => 30000 + (i % 2) * 500)));
      cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).not.to.equal(before));
    });
  });

  it("describes the chart in words for assistive technology", () => {
    cy.mount(chartElement([0, 30000, 60_000, 31000, 120_000, 30500]));
    cy.get("canvas.chart-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label", "AAA price over the last 2 minutes: last 305.00, high 310.00, low 300.00.");
  });

  it("is named for the symbol until there is data", () => {
    cy.mount(chartElement(null));
    cy.get("canvas.chart-canvas").should("have.attr", "aria-label", "AAA");
  });

  it("moves a crosshair with the pointer", () => {
    cy.mount(chartElement(rising));
    cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(500));
    inkNow().then((before) => {
      cy.get("canvas.chart-canvas").realHover({ position: { x: 400, y: 100 } });
      cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(before + 100)); // the crosshair and its label
      inkNow().then((hovering) => {
        cy.get("#elsewhere").realHover(); // the pointer leaves the chart
        cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.lessThan(hovering - 100)); // and the crosshair goes
      });
    });
  });

  it("says so, as an alert, when the server has no history, and shows no skeleton", () => {
    cy.mount(chartElement(null, true));
    cy.get("p.chart-message").should("have.attr", "role", "alert").and("contain.text", "Price history is not available");
    cy.get("svg.skeleton").should("not.exist");
  });
});
