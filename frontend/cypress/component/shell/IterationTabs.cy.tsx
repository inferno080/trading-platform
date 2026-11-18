import { useState } from "react";
import { withI18n } from "../../support/render";
import type { Iteration } from "../../../src/iterations";
import { IterationTabs } from "../../../src/shell/IterationTabs";

// Three tabs, with labels taken from existing messages. The pages are never rendered here.
const iterations = [
  { id: "one", labelId: "tab.naive", descriptionId: "tab.naive.description" },
  { id: "two", labelId: "hud.title", descriptionId: "tab.naive.description" },
  { id: "three", labelId: "table.symbol", descriptionId: "tab.naive.description" },
] as Iteration[];

// Holds the selected tab in state, the way App does, and reports each selection.
function Harness({ onSelect }: { onSelect?: (id: string) => void }) {
  const [activeId, setActiveId] = useState("one");
  return (
    <IterationTabs
      iterations={iterations}
      activeId={activeId}
      onSelect={(id) => {
        setActiveId(id);
        onSelect?.(id);
      }}
    />
  );
}

const mountTabs = (onSelect?: (id: string) => void) => cy.mount(withI18n(<Harness onSelect={onSelect} />));

describe("IterationTabs", () => {
  it("renders an accessible tab list with one selected tab", () => {
    mountTabs();
    cy.get("[role=tablist]").should("have.attr", "aria-label", "Frontend iterations");
    cy.get("[role=tab]").should("have.length", 3);
    cy.get("#tab-one").should("have.attr", "aria-selected", "true").and("have.attr", "aria-controls", "panel-one");
    cy.get("#tab-two").should("have.attr", "aria-selected", "false");
  });

  it("puts only the selected tab in the Tab order", () => {
    mountTabs();
    cy.get("#tab-one").should("have.attr", "tabindex", "0");
    cy.get("#tab-two").should("have.attr", "tabindex", "-1");
    cy.get("#tab-three").should("have.attr", "tabindex", "-1");
  });

  it("selects a tab on click", () => {
    const onSelect = cy.stub();
    mountTabs(onSelect);
    cy.get("#tab-two").click();
    cy.get("#tab-two").should("have.attr", "aria-selected", "true");
    cy.wrap(onSelect).should("have.been.calledWith", "two");
  });

  it("moves to the next and previous tab with the arrow keys, wrapping at the ends", () => {
    mountTabs();
    cy.get("#tab-one").focus().type("{rightarrow}");
    cy.get("#tab-two").should("have.attr", "aria-selected", "true").and("have.focus");

    cy.focused().type("{rightarrow}{rightarrow}");
    cy.get("#tab-one").should("have.attr", "aria-selected", "true").and("have.focus"); // wrapped around

    cy.focused().type("{leftarrow}");
    cy.get("#tab-three").should("have.attr", "aria-selected", "true").and("have.focus"); // wrapped back
  });

  it("jumps to the first and last tab with Home and End", () => {
    mountTabs();
    cy.get("#tab-one").focus().type("{end}");
    cy.get("#tab-three").should("have.attr", "aria-selected", "true").and("have.focus");
    cy.focused().type("{home}");
    cy.get("#tab-one").should("have.attr", "aria-selected", "true").and("have.focus");
  });

  it("mirrors the arrow keys in a right-to-left layout", () => {
    cy.mount(
      <div dir="rtl">
        {withI18n(<Harness />)}
      </div>,
    );
    cy.get("#tab-one").focus().type("{leftarrow}");
    cy.get("#tab-two").should("have.attr", "aria-selected", "true");
    cy.focused().type("{rightarrow}");
    cy.get("#tab-one").should("have.attr", "aria-selected", "true");
  });

  it("ignores keys that are not navigation keys", () => {
    const onSelect = cy.stub();
    mountTabs(onSelect);
    cy.get("#tab-one").focus().type("a");
    cy.wrap(onSelect).should("not.have.been.called");
    cy.get("#tab-one").should("have.attr", "aria-selected", "true");
  });

  it("labels the tabs in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    mountTabs();
    cy.get("[role=tablist]").should("have.attr", "aria-label", "フロントエンドの各バージョン");
    cy.get("#tab-one").should("have.text", "ナイーブ");
  });
});
