import { WatchlistPanel, type WatchlistItem } from "../../../src/watchlist/WatchlistPanel";
import { withI18n } from "../../support/render";

const item = (id: number, symbol: string, name = `${symbol} Inc.`): WatchlistItem => ({
  id,
  symbol,
  name,
  chart: <p data-chart={id}>chart {symbol}</p>,
});

const mountPanel = (items: WatchlistItem[]) => {
  const onOpen = cy.stub().as("open");
  const onRemove = cy.stub().as("remove");
  cy.mount(withI18n(<WatchlistPanel items={items} onOpen={onOpen} onRemove={onRemove} />));
};

describe("WatchlistPanel", () => {
  it("is a labelled section whose heading says how many of the four are used", () => {
    mountPanel([item(0, "AAA"), item(1, "AAB")]);
    cy.get("section#watchlist-panel").should("have.attr", "aria-labelledby", "watchlist-title");
    cy.get("#watchlist-title").should("contain.text", "Watchlist").and("contain.text", "2 of 4");
  });

  it("says how to add a symbol when the list is empty", () => {
    mountPanel([]);
    cy.get(".watchlist-empty").should("contain.text", "Open a symbol's chart and choose Add to watchlist");
    cy.get("ul").should("not.exist");
  });

  it("lists each symbol with its name and its mini chart", () => {
    mountPanel([item(0, "AAA", "Apex Systems Inc."), item(1, "AAB")]);
    cy.get(".watch-item").should("have.length", 2);
    cy.get(".watch-item").first().should("contain.text", "AAA").and("contain.text", "Apex Systems Inc.").and("contain.text", "chart AAA");
    cy.get("[data-chart=1]").should("exist");
  });

  it("is a list, so assistive technology can say how many items there are", () => {
    mountPanel([item(0, "AAA"), item(1, "AAB")]);
    cy.get("ul.watchlist-items > li").should("have.length", 2);
  });

  describe("opening a chart", () => {
    it("has a button for each symbol, named for what it does, that opens its chart", () => {
      mountPanel([item(0, "AAA"), item(3, "AAD")]);
      cy.get('button[aria-label="Open the AAD Inc. (AAD) chart"]').click();
      cy.get("@open").should("have.been.calledOnceWith", 3);
    });
  });

  describe("removing a symbol", () => {
    it("has a button for each symbol, named for what it does, that removes it", () => {
      mountPanel([item(0, "AAA"), item(3, "AAD")]);
      cy.get('button[aria-label="Remove AAD from the watchlist"]').click();
      cy.get("@remove").should("have.been.calledOnceWith", 3);
    });

    it("moves keyboard focus to the heading, so it is not lost when the item disappears", () => {
      mountPanel([item(0, "AAA")]);
      cy.get('button[aria-label="Remove AAA from the watchlist"]').click();
      cy.get("#watchlist-title").should("have.focus");
    });

    it("hides the cross icon from assistive technology, which hears the button's name instead", () => {
      mountPanel([item(0, "AAA")]);
      cy.get(".watch-remove svg.icon").should("have.attr", "aria-hidden", "true");
    });

    it("centers the cross in a square button", () => {
      mountPanel([item(0, "AAA")]);
      cy.get(".watch-remove").then(($button) => {
        const box = $button[0]!.getBoundingClientRect();
        const icon = $button.find("svg")[0]!.getBoundingClientRect();
        expect(box.width, "a square").to.be.closeTo(box.height, 1);
        expect(Math.abs(icon.left + icon.width / 2 - (box.left + box.width / 2)), "horizontal offset").to.be.lessThan(1.5);
        expect(Math.abs(icon.top + icon.height / 2 - (box.top + box.height / 2)), "vertical offset").to.be.lessThan(1.5);
      });
    });
  });

  describe("keyboard", () => {
    it("reaches each symbol's open and remove buttons in order with Tab", () => {
      mountPanel([item(0, "AAA"), item(1, "AAB")]);
      cy.get('button[aria-label="Open the AAA Inc. (AAA) chart"]').focus();
      cy.realPress("Tab");
      cy.focused().should("have.attr", "aria-label", "Remove AAA from the watchlist");
      cy.realPress("Tab");
      cy.focused().should("have.attr", "aria-label", "Open the AAB Inc. (AAB) chart");
      cy.realPress("Tab");
      cy.focused().should("have.attr", "aria-label", "Remove AAB from the watchlist");
    });

    it("opens a chart with Enter and removes a symbol with Space", () => {
      mountPanel([item(0, "AAA")]);
      cy.get('button[aria-label="Open the AAA Inc. (AAA) chart"]').focus().realPress("Enter");
      cy.get("@open").should("have.been.calledOnceWith", 0);
      cy.get('button[aria-label="Remove AAA from the watchlist"]').focus().realPress("Space");
      cy.get("@remove").should("have.been.calledOnceWith", 0);
    });

    it("shows a visible focus ring round the whole tile when its open button is reached by keyboard", () => {
      mountPanel([item(0, "AAA")]);
      cy.get("body").realPress("Tab");
      cy.focused().should("have.class", "watch-open");
      cy.get(".watch-item").should("have.css", "outline-style", "solid");
    });
  });

  it("names the buttons in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    mountPanel([item(0, "AAA")]);
    cy.get("#watchlist-title").should("contain.text", "ウォッチリスト");
    cy.get(".watch-open").should("have.attr", "aria-label", "AAA Inc. (AAA) のチャートを開く");
    cy.get(".watch-remove").should("have.attr", "aria-label", "AAA をウォッチリストから削除");
  });
});
