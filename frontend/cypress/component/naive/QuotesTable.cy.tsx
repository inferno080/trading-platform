import { QuotesTable } from "../../../src/naive/QuotesTable";
import { makeQuote } from "../../support/fixtures";
import { withI18n } from "../../support/render";

const cellTexts = ($cells: JQuery<HTMLElement>): (string | null)[] => [...$cells].map((cell) => cell.textContent);

describe("QuotesTable", () => {
  it("shows a loading skeleton, with a hidden message for screen readers, while there are no quotes", () => {
    cy.mount(withI18n(<QuotesTable quotes={[]} pxScale={100} />));
    cy.get("[role=status] .visually-hidden").should("have.text", "Waiting for the first snapshot");
    cy.get("svg.skeleton").should("exist");
    cy.get("table").should("not.exist");
  });

  it("renders a captioned table with one row per instrument", () => {
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0), makeQuote(1)]} pxScale={100} />));
    cy.get("table caption").should("have.text", "Live quotes for 2 instruments");
    cy.get("thead th").should("have.length", 8).first().should("have.text", "Symbol");
    cy.get("tbody tr").should("have.length", 2);
  });

  it("uses proper header cells, so assistive technology can read each value with its column", () => {
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0)]} pxScale={100} />));
    cy.get("thead th").each(($th) => expect($th.attr("scope")).to.equal("col"));
    cy.get("tbody th").should("have.attr", "scope", "row").and("have.text", "AAA");
  });

  it("turns fixed-point prices into readable prices, with the spread and grouped sizes", () => {
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0)]} pxScale={100} />));
    cy.get("tbody tr td").then(($cells) => {
      expect(cellTexts($cells)).to.deep.equal(["299.17", "299.21", "0.04", "299.20", "2,700", "3,500", "8,600"]);
    });
  });

  it("shows as many decimals as the price scale implies", () => {
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0, { bid: 299170, ask: 299210, last: 299200 })]} pxScale={1000} />));
    cy.get("tbody tr td").first().should("have.text", "299.170");
  });

  it("is a labelled, keyboard-focusable scroll region", () => {
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0)]} pxScale={100} />));
    cy.get(".table-wrap")
      .should("have.attr", "role", "region")
      .and("have.attr", "aria-label", "Quotes table, scrollable")
      .and("have.attr", "tabindex", "0");
  });

  it("formats numbers and headings for the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<QuotesTable quotes={[makeQuote(0, { vol: 1234567 })]} pxScale={100} />));
    cy.get("thead th").first().should("have.text", "銘柄");
    cy.get("tbody tr td").last().should("have.text", "1,234,567");
  });
});
