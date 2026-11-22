import { FeedStore } from "../../../src/optimized/feedStore";
import { OptimizedBook } from "../../../src/optimized/OptimizedBook";
import type { DepthUpdate } from "../../../src/feed/messages";
import type { Trade } from "../../../src/protocol/messages";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

const depth = (bid: number): DepthUpdate => ({
  id: 1,
  bids: Array.from({ length: 10 }, (_, i): [number, number] => [bid - i, 1000 + i]),
  asks: Array.from({ length: 10 }, (_, i): [number, number] => [bid + 4 + i, 2000 + i]),
});
const trade = (n: number, side: Trade["side"] = "buy"): Trade => ({ ts: 1_700_000_000_000 + n * 1000, price: 29900 + n, size: 100 * (n + 1), side });

const bookElement = (store: FeedStore, options: { refreshMs?: number } = {}) =>
  withI18n(<OptimizedBook store={store} id={1} decimals={2} refreshMs={options.refreshMs ?? 0} />);
const mountBook = (store = new FeedStore(), options: { refreshMs?: number } = {}) => {
  cy.mount(bookElement(store, options));
  return store;
};
const bestBid = () => cy.get("table.book tbody tr").first().find("td").eq(1);

describe("OptimizedBook", () => {
  it("shows a skeleton until the first order book arrives", () => {
    mountBook();
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading the order book");
    cy.get("table.book").should("not.exist");
  });

  it("shows the order book and the trades when they arrive", () => {
    const store = mountBook();
    cy.then(() => {
      store.setBook(depth(29917));
      store.addTrades({ id: 1, trades: [trade(0), trade(1)] });
    });
    bestBid().should("have.text", "299.17");
    cy.get("table.tape tbody tr").should("have.length", 2);
  });

  it("shows what is already in the store when it appears", () => {
    const store = new FeedStore();
    store.setBook(depth(29917));
    mountBook(store);
    bestBid().should("have.text", "299.17");
  });

  it("replaces the order book with the newest one, and shows new trades first", () => {
    const store = mountBook();
    cy.then(() => store.setBook(depth(29917)));
    bestBid().should("have.text", "299.17");
    cy.then(() => {
      store.setBook(depth(30000));
      store.addTrades({ id: 1, trades: [trade(5)] });
    });
    bestBid().should("have.text", "300.00");
    cy.get("table.tape tbody tr").first().find("td").eq(1).should("have.text", "299.05");
  });

  it("goes back to the skeleton when the book is cleared (another symbol is opened)", () => {
    const store = mountBook();
    cy.then(() => store.setBook(depth(29917)));
    bestBid().should("exist");
    cy.then(() => store.clearBook());
    cy.get("table.book").should("not.exist");
    cy.get("svg.skeleton").should("exist");
  });

  it("keeps the tape at ten rows as trades keep arriving", () => {
    const store = mountBook();
    cy.then(() => store.setBook(depth(29917)));
    cy.then(() => {
      for (let i = 0; i < 50; i++) store.addTrades({ id: 1, trades: [trade(i)] });
    });
    cy.get("table.tape tbody tr").should("have.length", 10);
    cy.get("table.tape tbody tr").first().find("td").eq(1).should("have.text", "299.49"); // the newest
  });

  describe("the refresh interval", () => {
    it("holds changes back until the interval has passed, then shows the latest", () => {
      const store = mountBook(new FeedStore(), { refreshMs: 1500 });
      cy.then(() => store.setBook(depth(29917)));
      bestBid().should("have.text", "299.17");
      cy.then(() => store.setBook(depth(30000)));
      afterFrames(20);
      bestBid().should("have.text", "299.17"); // not yet
      cy.get("table.book tbody tr", { timeout: 5000 }).first().find("td").eq(1).should("have.text", "300.00");
    });

    it("shows many changes inside one interval as a single update of the latest", () => {
      const store = mountBook(new FeedStore(), { refreshMs: 300 });
      cy.then(() => store.setBook(depth(29917)));
      bestBid().should("have.text", "299.17");
      cy.then(() => {
        for (let i = 1; i <= 20; i++) store.setBook(depth(29917 + i));
      });
      bestBid().should("have.text", "299.37");
    });
  });

  it("stops listening to the store when it is removed", () => {
    const store = mountBook();
    cy.then(() => store.setBook(depth(29917)));
    cy.mount(<p>gone</p>);
    cy.then(() => store.setBook(depth(30000))); // nothing is listening, so this must not fail
    cy.contains("gone").should("exist");
  });

  it("times the trades on the market's clock once the open symbol's session is known, naming the zone in the heading", () => {
    const store = new FeedStore();
    store.setCharts([
      {
        id: 1,
        range: "1d",
        session: { market: "us", timeZone: "America/New_York", continuous: false, open: Date.UTC(2026, 10, 18, 14, 30), close: Date.UTC(2026, 10, 18, 21, 0) },
        data: Float64Array.of(1000, 29900, 2000, 29910),
      },
    ]);
    mountBook(store);
    cy.then(() => {
      store.setBook(depth(29917));
      store.addTrades({ id: 1, trades: [{ ...trade(0), ts: Date.UTC(2026, 10, 18, 15, 0, 0) }] });
    });
    cy.get("table.tape thead th").first().invoke("text").should("match", /^Time \(E[SD]T\)$/);
  });

  it("keeps the plain heading until the session is known", () => {
    const store = mountBook();
    cy.then(() => {
      store.setBook(depth(29917));
      store.addTrades({ id: 1, trades: [trade(0)] });
    });
    cy.get("table.tape thead th").first().should("have.text", "Time");
  });
});

