import { useIterationRoute } from "../../../src/shell/useIterationRoute";

const IDS = ["naive", "optimized"] as const;

function Probe() {
  const [active, select] = useIterationRoute(IDS, "naive");
  return (
    <div>
      <p data-cy="active">{active}</p>
      <button onClick={() => select("optimized")}>go optimized</button>
      <button onClick={() => select("naive")}>go naive</button>
    </div>
  );
}

describe("useIterationRoute", () => {
  it("starts on the fallback when the URL has no iteration", () => {
    cy.mount(<Probe />);
    cy.get("[data-cy=active]").should("have.text", "naive");
  });

  it("starts on the iteration named in the URL hash", () => {
    window.location.hash = "#/optimized";
    cy.mount(<Probe />);
    cy.get("[data-cy=active]").should("have.text", "optimized");
  });

  it("falls back when the hash names something unknown", () => {
    window.location.hash = "#/does-not-exist";
    cy.mount(<Probe />);
    cy.get("[data-cy=active]").should("have.text", "naive");
  });

  it("writes the selection into the URL hash and follows it", () => {
    cy.mount(<Probe />);
    cy.contains("button", "go optimized").click();
    cy.get("[data-cy=active]").should("have.text", "optimized");
    cy.location("hash").should("equal", "#/optimized");
  });

  it("follows the URL when it changes outside the app, such as the back button", () => {
    cy.mount(<Probe />);
    cy.window().then((win) => {
      win.location.hash = "#/optimized";
    });
    cy.get("[data-cy=active]").should("have.text", "optimized");
  });

  it("ignores hashes that are not iterations, such as the skip link's #main", () => {
    window.location.hash = "#/optimized";
    cy.mount(<Probe />);
    cy.get("[data-cy=active]").should("have.text", "optimized");
    cy.window().then((win) => {
      win.location.hash = "#main";
    });
    cy.get("[data-cy=active]").should("have.text", "optimized");
  });

  it("stops listening when it unmounts", () => {
    cy.mount(<Probe />);
    cy.mount(<p>gone</p>);
    cy.window().then((win) => {
      win.location.hash = "#/optimized";
    });
    cy.contains("gone").should("exist");
  });
});
