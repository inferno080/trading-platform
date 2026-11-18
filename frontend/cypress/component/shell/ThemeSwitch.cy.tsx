import { withI18n } from "../../support/render";
import { ThemeSwitch } from "../../../src/shell/ThemeSwitch";

describe("ThemeSwitch", () => {
  it("is an accessible switch that starts off in a light theme", () => {
    cy.mount(withI18n(<ThemeSwitch />));
    cy.get("[role=switch]")
      .should("have.attr", "aria-checked", "false")
      .and("have.attr", "aria-label", "Dark mode");
    cy.get(".theme-switch-thumb circle").should("exist"); // the sun icon
  });

  it("turns dark on click, flips its state and shows the moon icon", () => {
    cy.mount(withI18n(<ThemeSwitch />));
    cy.get("[role=switch]").click().should("have.attr", "aria-checked", "true");
    cy.get(".theme-switch-thumb circle").should("not.exist");
    cy.get(".theme-switch-thumb svg").should("exist");
    cy.document().its("documentElement").should("have.attr", "data-theme", "dark");
  });

  it("goes back to light when clicked again", () => {
    cy.mount(withI18n(<ThemeSwitch />));
    cy.get("[role=switch]").click().click().should("have.attr", "aria-checked", "false");
  });

  it("is operable from the keyboard", () => {
    cy.mount(withI18n(<ThemeSwitch />));
    cy.get("[role=switch]").focus().realPress("Enter");
    cy.get("[role=switch]").should("have.attr", "aria-checked", "true");
  });

  it("is labelled in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<ThemeSwitch />));
    cy.get("[role=switch]").should("have.attr", "aria-label", "ダークモード");
  });
});
