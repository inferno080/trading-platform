import { waitForLiveTable } from "../support/e2e";

describe("navigation and keyboard use", () => {
  it("shows the Naive iteration as the selected tab", () => {
    cy.visit("/");
    cy.get("[role=tab]").should("have.length", 1).and("have.text", "Naive").and("have.attr", "aria-selected", "true");
    cy.get("[role=tabpanel]").should("have.attr", "aria-labelledby", "tab-naive");
  });

  it("opens the iteration named in the URL", () => {
    cy.visit("/#/naive");
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");
    waitForLiveTable();
  });

  it("falls back to the first iteration for an unknown address", () => {
    cy.visit("/#/does-not-exist");
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");
  });

  it("writes the selected tab into the URL when it is activated", () => {
    cy.visit("/");
    cy.get("#tab-naive").click();
    cy.location("hash").should("equal", "#/naive");
  });

  it("moves focus to the content from the skip link, keeping the URL", () => {
    cy.visit("/#/naive");
    cy.get(".skip-link").focus().realPress("Enter");
    cy.focused().should("have.attr", "id", "main");
    cy.location("hash").should("equal", "#/naive");
  });

  it("can be used with the keyboard alone, in a sensible order", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("body").realPress("Tab");
    cy.focused().should("have.class", "skip-link");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "switch");
    cy.realPress("Tab");
    cy.focused().should("match", "select");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "tab");
    cy.realPress("Tab");
    cy.focused().should("have.class", "record-button");
    cy.realPress("Tab");
    cy.focused().should("have.class", "table-wrap"); // the scrollable table can be reached and scrolled by keyboard
  });

  it("shows a clear focus ring on whatever has keyboard focus", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("body").realPress("Tab");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "switch").and("have.css", "outline-style", "solid").and("have.css", "outline-width", "2px");
  });

  it("toggles the theme from the keyboard", () => {
    cy.visit("/");
    cy.get("[role=switch]").focus().realPress("Enter");
    cy.get("[role=switch]").should("have.attr", "aria-checked", "true");
    cy.get("html").should("have.attr", "data-theme", "dark");
  });
});
