import { Workspace } from "../../../src/watchlist/Workspace";

const mountWorkspace = (open: boolean) =>
  cy.mount(
    <Workspace open={open} panel={<p id="panel">watchlist</p>}>
      <div id="quotes" style={{ height: 200 }}>
        quotes
      </div>
    </Workspace>,
  );
const widthOf = (selector: string) => cy.get(selector).then(($e) => $e[0]!.getBoundingClientRect().width);

describe("Workspace", () => {
  it("puts the quotes on the left (70%) and the watchlist on the right (30%) when open", () => {
    mountWorkspace(true);
    cy.get(".workspace").should("have.attr", "data-watchlist", "open");
    cy.get(".workspace-main").then(($main) => {
      cy.get(".workspace-side").then(($side) => {
        const main = $main[0]!.getBoundingClientRect();
        const side = $side[0]!.getBoundingClientRect();
        expect(main.width / (main.width + side.width), "the quotes' share").to.be.within(0.69, 0.71);
        expect(side.left, "the watchlist is to the right").to.be.greaterThan(main.right - 1);
      });
    });
  });

  it("gives the quotes the whole width, and no watchlist, when collapsed", () => {
    mountWorkspace(false);
    cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
    cy.get(".workspace-side").should("not.exist");
    cy.get("#panel").should("not.exist");
    cy.get(".workspace").then(($w) => {
      widthOf(".workspace-main").should("be.closeTo", $w[0]!.getBoundingClientRect().width, 1);
    });
  });

  it("is wider for the quotes when collapsed than when open", () => {
    mountWorkspace(true);
    widthOf(".workspace-main").then((open) => {
      mountWorkspace(false);
      widthOf(".workspace-main").should("be.greaterThan", open + 100);
    });
  });

  it("puts the watchlist below the quotes on a narrow screen, where 30% would be too small to use", () => {
    cy.viewport(700, 800);
    mountWorkspace(true);
    cy.get(".workspace-main").then(($main) => {
      cy.get(".workspace-side").then(($side) => {
        const main = $main[0]!.getBoundingClientRect();
        const side = $side[0]!.getBoundingClientRect();
        expect(side.top, "the watchlist is below").to.be.at.least(main.bottom - 1);
        expect(side.width, "and as wide as the quotes").to.be.closeTo(main.width, 2);
      });
    });
  });

  it("does not let wide content push the layout past its share", () => {
    cy.mount(
      <Workspace open panel={<p>side</p>}>
        <div style={{ width: 3000 }}>very wide quotes</div>
      </Workspace>,
    );
    widthOf(".workspace-main").should("be.lessThan", 1000);
  });
});
