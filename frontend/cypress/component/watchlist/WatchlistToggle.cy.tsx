import { WatchlistToggle } from "../../../src/watchlist/WatchlistToggle";
import { withI18n } from "../../support/render";

describe("WatchlistToggle", () => {
  it("is a button that just says Watchlist, with no count", () => {
    cy.mount(withI18n(<WatchlistToggle open onToggle={cy.stub()} />));
    cy.get("button").should("have.text", "Watchlist");
  });

  it("says whether the panel is expanded, and which panel it controls", () => {
    cy.mount(withI18n(<WatchlistToggle open onToggle={cy.stub()} />));
    cy.get("button").should("have.attr", "aria-expanded", "true").and("have.attr", "aria-controls", "watchlist-panel");
    cy.mount(withI18n(<WatchlistToggle open={false} onToggle={cy.stub()} />));
    cy.get("button").should("have.attr", "aria-expanded", "false");
  });

  describe("its icon", () => {
    it("is an eye when the panel is open, hidden from assistive technology", () => {
      cy.mount(withI18n(<WatchlistToggle open onToggle={cy.stub()} />));
      cy.get("button svg.icon").should("have.attr", "aria-hidden", "true").and("have.attr", "focusable", "false");
      cy.get("button svg circle").should("exist"); // the pupil
      cy.get('button svg line[x1="1"]').should("not.exist"); // no slash
    });

    it("is a crossed-out eye when the panel is collapsed, so it shows the state as well", () => {
      cy.mount(withI18n(<WatchlistToggle open={false} onToggle={cy.stub()} />));
      cy.get('button svg line[x1="1"]').should("exist");
    });

    it("sits before the text, vertically centered with it", () => {
      cy.mount(withI18n(<WatchlistToggle open onToggle={cy.stub()} />));
      cy.get("button").then(($button) => {
        const icon = $button.find("svg")[0]!.getBoundingClientRect();
        const box = $button[0]!.getBoundingClientRect();
        expect(Math.abs(icon.top + icon.height / 2 - (box.top + box.height / 2)), "centers differ by").to.be.lessThan(2);
      });
    });
  });

  it("calls onToggle on a click, and on Enter and Space from the keyboard", () => {
    const onToggle = cy.stub().as("toggle");
    cy.mount(withI18n(<WatchlistToggle open onToggle={onToggle} />));
    cy.get("button").click();
    cy.get("@toggle").should("have.been.calledOnce");
    cy.get("button").focus().realPress("Enter");
    cy.get("@toggle").should("have.been.calledTwice");
    cy.get("button").realPress("Space");
    cy.get("@toggle").should("have.been.calledThrice");
  });

  it("says Watchlist in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<WatchlistToggle open onToggle={cy.stub()} />));
    cy.get("button").should("have.text", "ウォッチリスト");
  });
});
