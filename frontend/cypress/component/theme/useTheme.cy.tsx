import { installMatchMedia } from "../../support/matchMedia";
import { blockLocalStorage } from "../../support/storage";
import { useTheme } from "../../../src/theme/useTheme";

const DARK = "(prefers-color-scheme: dark)";

function Probe() {
  const { theme, toggle } = useTheme();
  return (
    <div>
      <p data-cy="theme">{theme}</p>
      <button onClick={toggle}>toggle</button>
    </div>
  );
}

describe("useTheme", () => {
  it("follows a light OS setting when the user has not chosen", () => {
    installMatchMedia();
    cy.mount(<Probe />);
    cy.get("[data-cy=theme]").should("have.text", "light");
    cy.document().its("documentElement").should("not.have.attr", "data-theme");
  });

  it("follows a dark OS setting when the user has not chosen", () => {
    installMatchMedia({ [DARK]: true });
    cy.mount(<Probe />);
    cy.get("[data-cy=theme]").should("have.text", "dark");
  });

  it("follows the OS when it changes while the page is open", () => {
    const media = installMatchMedia();
    cy.mount(<Probe />);
    cy.then(() => media.set(DARK, true));
    cy.get("[data-cy=theme]").should("have.text", "dark");
  });

  it("toggles to the opposite theme, applies it to the page and remembers it", () => {
    installMatchMedia();
    cy.mount(<Probe />);

    cy.contains("button", "toggle").click();
    cy.get("[data-cy=theme]").should("have.text", "dark");
    cy.document().its("documentElement").should("have.attr", "data-theme", "dark");
    cy.window().then((win) => expect(win.localStorage.getItem("theme")).to.equal("dark"));

    cy.contains("button", "toggle").click();
    cy.get("[data-cy=theme]").should("have.text", "light");
    cy.document().its("documentElement").should("have.attr", "data-theme", "light");
  });

  it("prefers the saved choice over the OS setting", () => {
    localStorage.setItem("theme", "light");
    installMatchMedia({ [DARK]: true });
    cy.mount(<Probe />);
    cy.get("[data-cy=theme]").should("have.text", "light");
    cy.document().its("documentElement").should("have.attr", "data-theme", "light");
  });

  it("ignores a saved value that is not a theme", () => {
    localStorage.setItem("theme", "purple");
    installMatchMedia();
    cy.mount(<Probe />);
    cy.get("[data-cy=theme]").should("have.text", "light");
  });

  it("keeps working when browser storage is blocked", () => {
    blockLocalStorage();
    installMatchMedia();
    cy.mount(<Probe />);
    cy.get("[data-cy=theme]").should("have.text", "light");
    cy.contains("button", "toggle").click();
    cy.get("[data-cy=theme]").should("have.text", "dark");
  });
});
