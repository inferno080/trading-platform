import { FeedStore } from "../../../src/optimized/feedStore";
import { OptimizedPriceLine } from "../../../src/optimized/OptimizedPriceLine";
import { series } from "../../support/canvas";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

const ID = 1;
const chart = (last: number) => Float64Array.from(series(20, (i) => last - (19 - i) * 5));
const send = (store: FeedStore, last: number, id = ID) => store.setCharts([{ id, data: chart(last) }]);

const lineElement = (store: FeedStore, options: { refreshMs?: number; variant?: "big" | "small" } = {}) =>
  withI18n(<OptimizedPriceLine store={store} id={ID} decimals={2} prevClose={29800} variant={options.variant ?? "big"} refreshMs={options.refreshMs ?? 0} />);
const mountLine = (store = new FeedStore(), options: { refreshMs?: number; variant?: "big" | "small" } = {}) => {
  cy.mount(lineElement(store, options));
  return store;
};

describe("OptimizedPriceLine", () => {
  it("is empty until the chart's data arrives", () => {
    mountLine();
    cy.get(".price-line").should("have.text", "").and("have.attr", "data-direction", "0");
  });

  it("shows the newest price and its move since the previous close", () => {
    const store = mountLine();
    cy.then(() => send(store, 29920)); // against a previous close of 298.00
    cy.get(".price-now").should("have.text", "299.20");
    cy.get(".price-move").should("contain.text", "▲").and("contain.text", "+0.40%");
    cy.get(".price-change").should("have.text", "(+1.20)");
    cy.get(".price-line").should("have.attr", "data-direction", "1");
  });

  it("follows the price as it changes, including across the previous close", () => {
    const store = mountLine();
    cy.then(() => send(store, 29920));
    cy.get(".price-line").should("have.attr", "data-direction", "1");
    cy.then(() => send(store, 29705));
    cy.get(".price-now").should("have.text", "297.05");
    cy.get(".price-move").should("contain.text", "▼");
    cy.get(".price-line").should("have.attr", "data-direction", "-1");
  });

  it("shows what is already in the store when it appears", () => {
    const store = new FeedStore();
    send(store, 29920);
    mountLine(store);
    cy.get(".price-now").should("have.text", "299.20");
  });

  it("ignores another instrument's chart", () => {
    const store = mountLine();
    cy.then(() => send(store, 29920, 9));
    afterFrames(10);
    cy.get(".price-line").should("have.text", "");
  });

  it("uses the size it is asked for", () => {
    mountLine(new FeedStore(), { variant: "small" });
    cy.get(".price-line").should("have.class", "price-line-small");
  });

  describe("the refresh interval", () => {
    it("holds changes back until the interval has passed, then shows the latest", () => {
      const store = mountLine(new FeedStore(), { refreshMs: 1500 });
      cy.then(() => send(store, 29920));
      cy.get(".price-now").should("have.text", "299.20");
      cy.then(() => send(store, 30100));
      afterFrames(20);
      cy.get(".price-now").should("have.text", "299.20"); // not yet
      cy.get(".price-now", { timeout: 5000 }).should("have.text", "301.00");
    });
  });

  it("stops listening to the store when it is removed", () => {
    const store = mountLine();
    cy.mount(<p>gone</p>);
    cy.then(() => send(store, 29920));
    cy.contains("gone").should("exist");
  });
});
