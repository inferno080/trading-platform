import { lazy, useState, type ComponentType } from "react";
import type { Iteration } from "../../../src/iterations";
import { IterationPanel } from "../../../src/shell/IterationPanel";
import { withI18n } from "../../support/render";

const DESCRIPTION = "Every WebSocket message goes straight into React state and the whole table re-renders. This is the baseline to beat.";

const page = (text: string): ComponentType => function Page() {
  return <p data-cy="page">{text}</p>;
};

/** An iteration whose page loads when the test calls `finish()`, or fails when it calls `fail()`. */
function deferredIteration(id: string) {
  let finish: () => void = () => undefined;
  let fail: () => void = () => undefined;
  const loading = new Promise<{ default: ComponentType }>((resolve, reject) => {
    finish = () => resolve({ default: page(`${id} loaded`) });
    fail = () => reject(new Error("chunk failed to load"));
  });
  loading.catch(() => undefined); // a failure is expected and handled by the panel, not an unhandled rejection
  const Page = lazy(() => loading);
  const iteration = { id, labelId: "tab.naive", descriptionId: "tab.naive.description", Page } as Iteration;
  return { iteration, finish: () => finish(), fail: () => fail() };
}

const readyIteration = (id: string): Iteration =>
  ({ id, labelId: "tab.naive", descriptionId: "tab.naive.description", Page: lazy(async () => ({ default: page(`${id} loaded`) })) }) as Iteration;

describe("IterationPanel", () => {
  it("is a tab panel wired to its tab, with the description above the page", () => {
    cy.mount(withI18n(<IterationPanel iteration={readyIteration("alpha")} />));
    cy.get("[role=tabpanel]").should("have.attr", "id", "panel-alpha").and("have.attr", "aria-labelledby", "tab-alpha");
    cy.get(".iteration-description").should("have.text", DESCRIPTION);
    cy.get("[data-cy=page]").should("have.text", "alpha loaded");
  });

  it("shows a loading skeleton, announced as Loading, until the page's code arrives", () => {
    const slow = deferredIteration("slow");
    cy.mount(withI18n(<IterationPanel iteration={slow.iteration} />));
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading");
    cy.get("svg.skeleton").should("exist");
    cy.get("[data-cy=page]").should("not.exist");

    cy.then(() => slow.finish());
    cy.get("[data-cy=page]").should("have.text", "slow loaded");
    cy.get("svg.skeleton").should("not.exist");
  });

  it("shows an error with a Reload button, instead of a blank page, when the code fails to load", () => {
    Cypress.once("uncaught:exception", () => false); // React reports the error it caught
    const broken = deferredIteration("broken");
    cy.mount(withI18n(<IterationPanel iteration={broken.iteration} />));
    cy.get("svg.skeleton").should("exist");

    cy.then(() => broken.fail());
    cy.get("[role=alert]").should("contain.text", "This view could not be loaded.");
    cy.contains("[role=alert] button", "Reload").should("be.visible");
    cy.get(".iteration-description").should("exist"); // the rest of the panel still renders
  });

  it("reloads when the Reload button is pressed", () => {
    Cypress.once("uncaught:exception", () => false);
    const broken = deferredIteration("broken");
    const onReload = cy.stub();
    cy.mount(withI18n(<IterationPanel iteration={broken.iteration} onReload={onReload} />));
    cy.then(() => broken.fail());
    cy.contains("button", "Reload").click();
    cy.wrap(onReload).should("have.been.calledOnce");
  });

  it("reloads the browser page by default", () => {
    // The default handler is window.location.reload; it is only checked for being wired up, because
    // actually reloading would end the test.
    Cypress.once("uncaught:exception", () => false);
    const broken = deferredIteration("broken");
    cy.mount(withI18n(<IterationPanel iteration={broken.iteration} />));
    cy.then(() => broken.fail());
    cy.contains("button", "Reload").should("be.enabled");
  });

  it("forgets a load error when another iteration is shown", () => {
    Cypress.once("uncaught:exception", () => false);
    const broken = deferredIteration("broken");

    function Switcher() {
      const [current, setCurrent] = useState<Iteration>(broken.iteration);
      return (
        <div>
          <button onClick={() => setCurrent(readyIteration("healthy"))}>switch</button>
          <IterationPanel iteration={current} />
        </div>
      );
    }

    cy.mount(withI18n(<Switcher />));
    cy.then(() => broken.fail());
    cy.get("[role=alert]").should("exist");
    cy.contains("button", "switch").click();
    cy.get("[role=alert]").should("not.exist");
    cy.get("[data-cy=page]").should("have.text", "healthy loaded");
  });

  it("describes the iteration in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<IterationPanel iteration={readyIteration("alpha")} />));
    cy.get(".iteration-description").should("contain.text", "WebSocket");
    cy.get(".iteration-description").should("contain.text", "再描画");
  });
});
