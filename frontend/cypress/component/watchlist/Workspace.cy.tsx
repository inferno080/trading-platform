import { Workspace } from "../../../src/watchlist/Workspace";

const chartPanel = (
  <div id="chart" style={{ height: 200 }}>
    chart
  </div>
);
const mountWorkspace = (open: boolean, withChart = true) =>
  cy.mount(
    <Workspace open={open} panel={<p id="panel">watchlist</p>}>
      {withChart ? chartPanel : undefined}
    </Workspace>,
  );
const rect = (selector: string) => cy.get(selector).then(($e) => $e[0]!.getBoundingClientRect());

describe("Workspace", () => {
  it("puts the chart panel on the left (70%) and the watchlist on the right (30%) when both are shown", () => {
    mountWorkspace(true);
    cy.get(".workspace").should("have.attr", "data-watchlist", "open").and("have.attr", "data-main", "chart");
    rect(".workspace-main").then((main) => {
      rect(".workspace-side").then((side) => {
        expect(main.width / (main.width + side.width), "the chart's share").to.be.within(0.69, 0.71);
        expect(side.left, "the watchlist is to the right").to.be.greaterThan(main.right - 1);
      });
    });
  });

  it("gives the chart panel the whole width, and no watchlist, when collapsed", () => {
    mountWorkspace(false);
    cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
    cy.get(".workspace-side").should("not.exist");
    cy.get("#panel").should("not.exist");
    rect(".workspace").then((row) => {
      rect(".workspace-main").its("width").should("be.closeTo", row.width, 1);
    });
  });

  it("is wider for the chart panel when collapsed than when open", () => {
    mountWorkspace(true);
    rect(".workspace-main").then((open) => {
      mountWorkspace(false);
      rect(".workspace-main").its("width").should("be.greaterThan", open.width + 100);
    });
  });

  describe("with no chart open", () => {
    it("gives the watchlist the whole row, so there is no hole where the chart would be", () => {
      mountWorkspace(true, false);
      cy.get(".workspace").should("have.attr", "data-main", "empty");
      cy.get(".workspace-main").should("not.exist");
      rect(".workspace").then((row) => {
        rect(".workspace-side").its("width").should("be.closeTo", row.width, 1);
      });
    });

    it("shows nothing at all when the watchlist is collapsed too", () => {
      mountWorkspace(false, false);
      cy.get(".workspace").should("not.exist");
      cy.get("#panel").should("not.exist");
    });
  });

  it("puts the watchlist below the chart panel on a narrow screen, where 30% would be too small to use", () => {
    cy.viewport(700, 800);
    mountWorkspace(true);
    rect(".workspace-main").then((main) => {
      rect(".workspace-side").then((side) => {
        expect(side.top, "the watchlist is below").to.be.at.least(main.bottom - 1);
        expect(side.width, "and as wide as the chart panel").to.be.closeTo(main.width, 2);
      });
    });
  });

  it("does not let wide content push the layout past its share", () => {
    cy.mount(
      <Workspace open panel={<p>side</p>}>
        <div style={{ width: 3000 }}>very wide chart</div>
      </Workspace>,
    );
    rect(".workspace-main").its("width").should("be.lessThan", 1000);
  });
});
