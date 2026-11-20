import { WatchlistToggle } from "../../../src/watchlist/WatchlistToggle";
import { withI18n } from "../../support/render";

describe("WatchlistToggle", () => {
  it("is a button that says how many symbols are on the watchlist", () => {
    cy.mount(withI18n(<WatchlistToggle count={3} open onToggle={cy.stub()} />));
    cy.get("button").should("have.text", "Watchlist (3)");
  });

  it("says whether the panel is expanded, and which panel it controls", () => {
    cy.mount(withI18n(<WatchlistToggle count={0} open onToggle={cy.stub()} />));
    cy.get("button").should("have.attr", "aria-expanded", "true").and("have.attr", "aria-controls", "watchlist-panel");
    cy.mount(withI18n(<WatchlistToggle count={0} open={false} onToggle={cy.stub()} />));
    cy.get("button").should("have.attr", "aria-expanded", "false");
  });

  it("calls onToggle on a click, and on Enter and Space from the keyboard", () => {
    const onToggle = cy.stub().as("toggle");
    cy.mount(withI18n(<WatchlistToggle count={0} open onToggle={onToggle} />));
    cy.get("button").click();
    cy.get("@toggle").should("have.been.calledOnce");
    cy.get("button").focus().realPress("Enter");
    cy.get("@toggle").should("have.been.calledTwice");
    cy.get("button").realPress("Space");
    cy.get("@toggle").should("have.been.calledThrice");
  });

  it("says Watchlist in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<WatchlistToggle count={2} open onToggle={cy.stub()} />));
    cy.get("button").should("have.text", "ウォッチリスト（2）");
  });
});
