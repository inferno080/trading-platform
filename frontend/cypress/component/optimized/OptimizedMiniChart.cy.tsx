import { FeedStore } from "../../../src/optimized/feedStore";
import { OptimizedMiniChart } from "../../../src/optimized/OptimizedMiniChart";
import { countInk, series } from "../../support/canvas";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

const ID = 2;
const data = (prices: number[]) => Float64Array.from(series(prices.length, (i) => prices[i]!));
const climbing = data(Array.from({ length: 60 }, (_, i) => 30000 + i * 5));
const falling = data(Array.from({ length: 60 }, (_, i) => 30000 - i * 5));
const send = (store: FeedStore, values: Float64Array, id = ID) => store.setCharts([{ id, data: values }]);

const miniElement = (store: FeedStore, options: { refreshMs?: number; frozen?: boolean } = {}) =>
  withI18n(<OptimizedMiniChart store={store} id={ID} symbol="AAB" decimals={2} refreshMs={options.refreshMs ?? 0} frozen={options.frozen ?? false} />);
const mountMini = (store = new FeedStore(), options: { refreshMs?: number; frozen?: boolean } = {}) => {
  cy.mount(miniElement(store, options));
  return store;
};
const inkNow = () => cy.get("canvas.mini-canvas").then(($c) => countInk($c[0] as HTMLCanvasElement));

describe("OptimizedMiniChart", () => {
  it("shows a small skeleton, announced as loading, until its history has been drawn", () => {
    mountMini();
    cy.get(".mini-area .chart-overlay").should("have.attr", "role", "status").and("contain.text", "Loading price history");
    cy.get(".mini-area svg.skeleton").should("have.attr", "height", "56");
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "false");
  });

  it("draws the line and removes the skeleton once the history arrives", () => {
    const store = mountMini();
    cy.then(() => send(store, climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "true");
    cy.get(".chart-overlay").should("not.exist");
    cy.get("canvas.mini-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(50));
  });

  it("writes the newest price and how far it moved, with an arrow, and colors it by direction", () => {
    const store = mountMini();
    cy.then(() => send(store, climbing));
    cy.get(".mini-caption").should("contain.text", "302.95").and("contain.text", "▲").and("contain.text", "+0.98%");
    cy.get(".mini-caption").should("have.attr", "data-direction", "1");
    cy.then(() => send(store, falling));
    cy.get(".mini-caption").should("contain.text", "▼").and("have.attr", "data-direction", "-1");
  });

  it("describes the chart in words for assistive technology", () => {
    const store = mountMini();
    cy.then(() => send(store, climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label").and("contain", "AAB price over the last");
  });

  it("ignores a chart for another instrument", () => {
    const store = mountMini();
    cy.then(() => send(store, climbing, 9));
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "false");
  });

  it("draws what was already in the store when it appears", () => {
    const store = new FeedStore();
    send(store, climbing);
    mountMini(store);
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "true");
  });

  it("holds changes back until the refresh interval has passed", () => {
    const store = mountMini(new FeedStore(), { refreshMs: 1500 });
    cy.then(() => send(store, climbing));
    cy.get("canvas.mini-canvas").should("have.attr", "data-ready", "true");
    cy.get(".mini-caption").should("have.attr", "data-direction", "1");
    cy.then(() => send(store, falling));
    afterFrames(20);
    cy.get(".mini-caption").should("have.attr", "data-direction", "1"); // not yet
    cy.get(".mini-caption", { timeout: 5000 }).should("have.attr", "data-direction", "-1");
  });

  it("holds still while frozen, and catches up when unfrozen", () => {
    const store = mountMini(new FeedStore(), { frozen: true });
    cy.then(() => send(store, climbing));
    afterFrames(15);
    inkNow().should("equal", 0);
    cy.mount(miniElement(store, { frozen: false }));
    cy.get("canvas.mini-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(50));
  });
});
