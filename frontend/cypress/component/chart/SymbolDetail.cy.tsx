import { useState } from "react";
import { SymbolDetail } from "../../../src/chart/SymbolDetail";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

interface Overrides {
  inWatchlist?: boolean;
  takeFocus?: boolean;
  tickSize?: number;
  decimals?: number;
}

const detail = (overrides: Overrides = {}, handlers: { onClose?: () => void; onToggleWatchlist?: () => void } = {}) => (
  <SymbolDetail
    symbol="AAA"
    name="Apex Systems Inc."
    currency="USD"
    tickSize={overrides.tickSize ?? 0.01}
    decimals={overrides.decimals ?? 2}
    inWatchlist={overrides.inWatchlist ?? false}
    onToggleWatchlist={handlers.onToggleWatchlist ?? cy.stub().as("toggle")}
    onClose={handlers.onClose ?? cy.stub().as("close")}
    takeFocus={overrides.takeFocus ?? false}
    side={<p id="side">the book and trades</p>}
    price={<p id="price">912.76</p>}
    ticket={<button id="ticket">Request a quote</button>}
  >
    <p id="chart">the chart</p>
  </SymbolDetail>
);

describe("SymbolDetail", () => {
  it("is a labelled section with the symbol's heading, and shows the chart it is given", () => {
    cy.mount(withI18n(detail()));
    cy.get("section.symbol-detail").should("have.attr", "aria-labelledby", "symbol-detail-title");
    cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
    cy.get("#chart").should("exist");
  });

  it("shows the price under the heading, above the chart", () => {
    cy.mount(withI18n(detail()));
    cy.get(".symbol-detail-price #price").should("have.text", "912.76");
    cy.get("#symbol-detail-title").then(($title) => {
      cy.get("#price").then(($price) => {
        cy.get("#chart").then(($chart) => {
          expect($price[0]!.getBoundingClientRect().top).to.be.greaterThan($title[0]!.getBoundingClientRect().bottom - 1);
          expect($chart[0]!.getBoundingClientRect().top).to.be.greaterThan($price[0]!.getBoundingClientRect().bottom - 1);
        });
      });
    });
  });

  it("puts the chart across the full width, with the side content (the order book and trades) below it", () => {
    cy.mount(withI18n(detail()));
    cy.get(".symbol-detail-chart #chart").should("exist");
    cy.get(".symbol-detail-side #side").should("exist");
    cy.get(".symbol-detail-chart").then(($chart) => {
      cy.get(".symbol-detail-side").then(($side) => {
        cy.get(".symbol-detail").then(($panel) => {
          const chart = $chart[0]!.getBoundingClientRect();
          const side = $side[0]!.getBoundingClientRect();
          expect(side.top, "the side content is below the chart").to.be.at.least(chart.bottom - 1);
          expect(chart.width, "the chart is as wide as the panel's content").to.be.greaterThan($panel[0]!.getBoundingClientRect().width - 60);
        });
      });
    });
  });

  it("shows the name, the currency, and the tick size and decimals that are not columns in the quotes", () => {
    cy.mount(withI18n(detail()));
    cy.get(".symbol-detail-name").should("have.text", "Apex Systems Inc. · USD · Tick size 0.01 · Decimals 2");
  });

  it("formats the tick size to the instrument's decimals", () => {
    cy.mount(withI18n(detail({ tickSize: 0.005, decimals: 3 })));
    cy.get(".symbol-detail-name").should("contain.text", "Tick size 0.005").and("contain.text", "Decimals 3");
    cy.mount(withI18n(detail({ tickSize: 1, decimals: 0 })));
    cy.get(".symbol-detail-name").should("contain.text", "Tick size 1 ").and("contain.text", "Decimals 0");
  });

  describe("the watchlist button", () => {
    it("offers to add the symbol when it is not on the watchlist, and to remove it when it is", () => {
      cy.mount(withI18n(detail({ inWatchlist: false })));
      cy.get(".symbol-detail-watch").should("have.text", "Add to watchlist");
      cy.mount(withI18n(detail({ inWatchlist: true })));
      cy.get(".symbol-detail-watch").should("have.text", "Remove from watchlist");
    });

    it("calls onToggleWatchlist when pressed", () => {
      cy.mount(withI18n(detail()));
      cy.get(".symbol-detail-watch").click();
      cy.get("@toggle").should("have.been.calledOnce");
    });
  });

  describe("closing", () => {
    it("has a Close chart button", () => {
      cy.mount(withI18n(detail()));
      cy.get(".symbol-detail-close").should("have.text", "Close chart").click();
      cy.get("@close").should("have.been.calledOnce");
    });

    it("closes with Escape", () => {
      cy.mount(withI18n(detail()));
      cy.get(".symbol-detail").should("exist");
      afterFrames(3); // React registers the key listener just after mounting
      cy.get("body").type("{esc}");
      cy.get("@close").should("have.been.calledOnce");
    });

    it("does not close when Escape is meant for something else: the grid's filter pop-up", () => {
      cy.mount(
        withI18n(
          <>
            {detail()}
            <div className="ag-popup">
              <input id="filter" />
            </div>
          </>,
        ),
      );
      afterFrames(3);
      cy.get("#filter").focus().type("{esc}");
      cy.get("@close").should("not.have.been.called");
    });

    it("does not close when Escape was already handled by something else", () => {
      cy.mount(withI18n(detail()));
      afterFrames(3);
      cy.get("body").then(($body) => {
        const body = $body[0]!;
        body.addEventListener("keydown", (event) => event.preventDefault(), { once: true }); // something handles it first
        body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      cy.get("@close").should("not.have.been.called");
    });

    it("stops listening for Escape once it is gone", () => {
      cy.mount(withI18n(detail()));
      cy.mount(withI18n(<p>gone</p>));
      cy.get("body").type("{esc}");
      cy.get("@close").should("not.have.been.called");
    });
  });

  describe("keyboard focus", () => {
    function Opener({ takeFocus }: { takeFocus: boolean }) {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button id="opener" onClick={() => setOpen(true)}>
            open
          </button>
          {open && detail({ takeFocus }, { onClose: () => setOpen(false) })}
        </>
      );
    }

    it("moves into the heading when it was opened by the person, so a keyboard or screen reader user lands in it", () => {
      cy.mount(withI18n(<Opener takeFocus />));
      cy.get("#opener").click();
      cy.get("#symbol-detail-title").should("have.focus");
    });

    it("goes back to where focus was when it closes", () => {
      cy.mount(withI18n(<Opener takeFocus />));
      cy.get("#opener").click();
      cy.get(".symbol-detail-close").click();
      cy.get("#opener").should("have.focus");
    });

    it("does not take focus when it was open from the start, which would be rude as a page loads", () => {
      cy.mount(withI18n(<Opener takeFocus={false} />));
      cy.get("#opener").click();
      cy.get(".symbol-detail").should("exist");
      cy.get("#symbol-detail-title").should("not.have.focus");
      cy.get("#opener").should("have.focus");
    });

    it("can be reached and used with the keyboard alone", () => {
      cy.mount(withI18n(detail()));
      cy.get(".symbol-detail-watch").focus().realPress("Enter");
      cy.get("@toggle").should("have.been.calledOnce");
      cy.realPress("Tab");
      cy.focused().should("have.id", "ticket");
      cy.realPress("Tab");
      cy.focused().should("have.class", "symbol-detail-close");
      cy.realPress("Enter");
      cy.get("@close").should("have.been.calledOnce");
    });
  });

  it("says the heading and buttons in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(detail()));
    cy.get("#symbol-detail-title").should("have.text", "AAA の価格チャート");
    cy.get(".symbol-detail-close").should("have.text", "チャートを閉じる");
    cy.get(".symbol-detail-watch").should("have.text", "ウォッチリストに追加");
  });

  it("puts the ticket's button in the header, between the watchlist button and Close", () => {
    cy.mount(withI18n(detail()));
    cy.get(".symbol-detail-header #ticket").should("exist");
    cy.get(".symbol-detail-header button").then(($buttons) => {
      const labels = [...$buttons].map((button) => button.textContent?.trim());
      expect(labels).to.deep.equal(["Add to watchlist", "Request a quote", "Close chart"]);
    });
  });
});
