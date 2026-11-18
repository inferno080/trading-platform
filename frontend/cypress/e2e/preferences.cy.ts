import { emulateMedia, waitForLiveTable } from "../support/e2e";

const DARK_BACKGROUND = "rgb(11, 15, 20)"; // --color-bg in the dark theme
const LIGHT_BACKGROUND = "rgb(255, 255, 255)"; // --color-bg in the light theme

describe("theme", () => {
  it("follows a light OS setting until the user chooses", () => {
    emulateMedia([{ name: "prefers-color-scheme", value: "light" }]);
    cy.visit("/");
    cy.get("html").should("not.have.attr", "data-theme");
    cy.get("body").should("have.css", "background-color", LIGHT_BACKGROUND);
    cy.get("[role=switch]").should("have.attr", "aria-checked", "false");
  });

  it("follows a dark OS setting until the user chooses", () => {
    emulateMedia([{ name: "prefers-color-scheme", value: "dark" }]);
    cy.visit("/");
    cy.get("body").should("have.css", "background-color", DARK_BACKGROUND);
    cy.get("[role=switch]").should("have.attr", "aria-checked", "true");
  });

  it("lets the user override a dark OS setting", () => {
    emulateMedia([{ name: "prefers-color-scheme", value: "dark" }]);
    cy.visit("/");
    cy.get("[role=switch]").click();
    cy.get("html").should("have.attr", "data-theme", "light");
    cy.get("body").should("have.css", "background-color", LIGHT_BACKGROUND);
  });

  it("remembers the choice after a reload, without flashing the wrong theme first", () => {
    cy.visit("/");
    cy.get("[role=switch]").click();
    cy.get("body").should("have.css", "background-color", DARK_BACKGROUND);

    cy.reload();
    // Checked right away: the saved theme is applied before the app starts, not after.
    cy.document().its("documentElement.dataset.theme").should("equal", "dark");
    cy.get("body").should("have.css", "background-color", DARK_BACKGROUND);
    cy.get("[role=switch]").should("have.attr", "aria-checked", "true");
  });

  it("restyles the whole page, including the table and the HUD", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get(".hud").invoke("css", "background-color").then((light) => {
      cy.get("[role=switch]").click();
      cy.get(".hud").should("not.have.css", "background-color", light as unknown as string);
    });
  });
});

describe("language", () => {
  it("starts in US English", () => {
    cy.visit("/");
    cy.get("html").should("have.attr", "lang", "en-US");
    cy.get("h1").should("have.text", "Trading Dashboard");
  });

  it("switches to Japanese, including numbers, the document language and the title", () => {
    cy.visit("/");
    waitForLiveTable();
    cy.get("select").select("日本語");
    cy.get("html").should("have.attr", "lang", "ja-JP");
    cy.get("h1").should("have.text", "取引ダッシュボード");
    cy.title().should("equal", "取引ダッシュボード");
    cy.get("#tab-naive").should("have.text", "ナイーブ");
    cy.get("thead th").first().should("have.text", "銘柄");
    cy.get(".status").should("contain.text", "ライブ");
  });

  it("remembers the language after a reload", () => {
    cy.visit("/");
    cy.get("select").select("日本語");
    cy.reload();
    cy.get("html").should("have.attr", "lang", "ja-JP");
    cy.get("h1").should("have.text", "取引ダッシュボード");
    cy.get("select").should("have.value", "ja-JP");
  });

  it("offers UK English too", () => {
    cy.visit("/");
    cy.get("select").select("English (UK)");
    cy.get("html").should("have.attr", "lang", "en-GB");
  });

  it("names the language picker for assistive technology without showing the word", () => {
    cy.visit("/");
    cy.get("select").should("have.attr", "aria-label", "Language");
    cy.get("header").should("not.contain.text", "Language");
  });
});
