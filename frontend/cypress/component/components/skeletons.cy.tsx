import { PageSkeleton, TableSkeleton } from "../../../src/components/skeletons";
import { withI18n } from "../../support/render";

describe("TableSkeleton", () => {
  it("draws a header row and twelve body rows of eight columns", () => {
    cy.mount(withI18n(<TableSkeleton />));
    cy.get(".skeleton-frame svg.skeleton rect").should("have.length", 8 + 12 * 8);
  });
});

describe("PageSkeleton", () => {
  it("announces loading once to screen readers instead of reading the shapes", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get("[role=status]").should("contain.text", "Loading");
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading");
  });

  it("outlines the status line, the HUD and the table", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get("svg.skeleton").should("have.length", 3); // status, HUD, table
    cy.get(".hud svg.skeleton").should("exist");
    cy.get(".skeleton-frame").should("exist");
  });

  it("says loading in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<PageSkeleton />));
    cy.get("[role=status] .visually-hidden").should("have.text", "読み込み中");
  });
});
