import { QuotesTable } from "../../../src/naive/QuotesTable";
import type { ReferenceById } from "../../../src/naive/useNaiveFeed";
import { makeQuote, makeReference } from "../../support/fixtures";
import { withI18n } from "../../support/render";

const cellTexts = ($cells: JQuery<HTMLElement>): (string | null)[] => [...$cells].map((cell) => cell.textContent);

// One instrument of each group, each priced in its own scale.
const usd = makeReference(0); // 2 decimals
const jpy = makeReference(1, { name: "Beacon Foods K.K.", currency: "JPY", tickSize: 1, decimals: 0, prevClose: 46566 });
const eur = makeReference(2, { name: "Summit Networks SE", currency: "EUR", tickSize: 0.005, decimals: 3, prevClose: 145955 });
const fx = makeReference(3, { name: "EUR/USD Spot", currency: "USD", tickSize: 0.0001, decimals: 4, prevClose: 12937 });

const usdQuote = makeQuote(0); // wire 29917 / 29921, last 29920
const jpyQuote = makeQuote(1, { bid: 47213, ask: 47217, last: 47215 });
const eurQuote = makeQuote(2, { bid: 145670, ask: 145690, last: 145680 });
const fxQuote = makeQuote(3, { bid: 12801, ask: 12809, last: 12805 });

const referenceOf = (...instruments: ReturnType<typeof makeReference>[]): ReferenceById =>
  new Map(instruments.map((instrument) => [instrument.id, instrument]));

const mountTable = (quotes = [usdQuote, jpyQuote, eurQuote, fxQuote], reference: ReferenceById | null = referenceOf(usd, jpy, eur, fx)) =>
  cy.mount(withI18n(<QuotesTable quotes={quotes} reference={reference} />));

// Name, currency, bid, ask, spread, last, previous close, chg %, bid size, ask size, volume.
const row = (index: number) => cy.get("tbody tr").eq(index).find("td");

describe("QuotesTable", () => {
  it("shows a loading skeleton, with a hidden message for screen readers, while there are no quotes", () => {
    mountTable([], referenceOf(usd));
    cy.get("[role=status] .visually-hidden").should("have.text", "Waiting for the first snapshot and the reference data");
    cy.get("svg.skeleton").should("exist");
    cy.get("table").should("not.exist");
  });

  it("keeps the skeleton until the reference data has arrived, even when quotes are there", () => {
    mountTable([usdQuote], null);
    cy.get("svg.skeleton").should("exist");
    cy.get("table").should("not.exist");
  });

  it("renders a captioned table with one row per instrument and twelve columns", () => {
    mountTable();
    cy.get("table caption").should("have.text", "Live quotes for 4 instruments");
    cy.get("thead th").should("have.length", 12).first().should("have.text", "Symbol");
    cy.get("thead th").then(($headers) => {
      expect(cellTexts($headers)).to.deep.equal([
        "Symbol", "Name", "Currency", "Bid", "Ask", "Spread", "Last", "Prev close", "Chg %",
        "Bid size", "Ask size", "Volume",
      ]);
    });
    cy.get("tbody tr").should("have.length", 4);
  });

  it("uses proper header cells, so assistive technology can read each value with its column", () => {
    mountTable();
    cy.get("thead th").each(($th) => expect($th.attr("scope")).to.equal("col"));
    cy.get("tbody th").first().should("have.attr", "scope", "row").and("have.text", "AAA");
  });

  it("prices a USD equity with 2 decimals", () => {
    mountTable();
    row(0).then(($cells) => {
      expect(cellTexts($cells)).to.deep.equal([
        "Apex Systems Inc.", "USD", "299.17", "299.21", "0.04", "299.20", "298.00", "+0.40%", "2,700", "3,500", "8,600",
      ]);
    });
  });

  it("prices a yen equity with no decimals", () => {
    mountTable();
    row(1).then(($cells) => {
      expect(cellTexts($cells)).to.deep.equal([
        "Beacon Foods K.K.", "JPY", "47,213", "47,217", "4", "47,215", "46,566", "+1.39%", "2,700", "3,500", "8,600",
      ]);
    });
  });

  it("prices a euro equity with 3 decimals and a half-cent tick", () => {
    mountTable();
    row(2).then(($cells) => {
      expect(cellTexts($cells)).to.deep.equal([
        "Summit Networks SE", "EUR", "145.670", "145.690", "0.020", "145.680", "145.955", "-0.19%", "2,700", "3,500", "8,600",
      ]);
    });
  });

  it("prices an FX-style instrument with 4 decimals", () => {
    mountTable();
    row(3).then(($cells) => {
      expect(cellTexts($cells)).to.deep.equal([
        "EUR/USD Spot", "USD", "1.2801", "1.2809", "0.0008", "1.2805", "1.2937", "-1.02%", "2,700", "3,500", "8,600",
      ]);
    });
  });

  it("shows no sign when the price has not changed from the previous close", () => {
    mountTable([makeQuote(0, { last: 29800 })], referenceOf(usd));
    row(0).eq(7).should("have.text", "0.00%");
  });

  it("shows a dash instead of dividing by a previous close of zero", () => {
    mountTable([usdQuote], referenceOf(makeReference(0, { prevClose: 0 })));
    row(0).eq(7).should("have.text", "–");
  });

  it("says so, instead of showing wrong prices, when an instrument has no reference data", () => {
    mountTable([usdQuote, makeQuote(9)], referenceOf(usd));
    cy.get("tbody tr").eq(1).within(() => {
      cy.get("th").should("have.text", "S9");
      cy.get("td").should("have.length", 1).and("have.text", "No reference data for this instrument").and("have.attr", "colspan", "11");
    });
  });

  it("is a labelled, keyboard-focusable scroll region", () => {
    mountTable();
    cy.get(".table-wrap")
      .should("have.attr", "role", "region")
      .and("have.attr", "aria-label", "Quotes table, scrollable")
      .and("have.attr", "tabindex", "0");
  });

  it("left-aligns the text columns and leaves the numbers right-aligned", () => {
    mountTable();
    row(0).eq(0).should("have.class", "text-col").and("have.css", "text-align", "start");
    row(0).eq(2).should("not.have.class", "text-col").and("have.css", "text-align", "end");
  });

  it("formats numbers and headings for the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    mountTable([makeQuote(1, { vol: 1234567, bid: 47213, ask: 47217, last: 47215 })], referenceOf(jpy));
    cy.get("thead th").eq(0).should("have.text", "銘柄");
    cy.get("thead th").eq(1).should("have.text", "銘柄名");
    cy.get("thead th").eq(7).should("have.text", "前日終値");
    row(0).eq(10).should("have.text", "1,234,567");
    row(0).eq(2).should("have.text", "47,213");
  });
});

describe("QuotesTable: choosing a symbol", () => {
  const mountSelectable = (selectedId: number | null = null) => {
    const onSelect = cy.stub().as("select");
    cy.mount(
      withI18n(
        <QuotesTable quotes={[usdQuote, jpyQuote]} reference={referenceOf(usd, jpy)} selectedId={selectedId} onSelect={onSelect} />,
      ),
    );
  };

  it("makes each symbol a real button, so the chart can be opened with the keyboard", () => {
    mountSelectable();
    cy.get("tbody th button.symbol-button").should("have.length", 2).first().should("have.text", "AAA");
  });

  it("chooses a symbol when its button is pressed, once (the row's click does not count it again)", () => {
    mountSelectable();
    cy.get("tbody tr").eq(1).find("button").click();
    cy.get("@select").should("have.been.calledOnceWith", 1);
  });

  it("chooses a symbol when anywhere else on its row is clicked", () => {
    mountSelectable();
    cy.get("tbody tr").eq(0).find("td").eq(2).click();
    cy.get("@select").should("have.been.calledOnceWith", 0);
  });

  it("chooses with Enter and Space on the focused symbol button", () => {
    mountSelectable();
    cy.get("tbody tr").eq(0).find("button").focus().realPress("Enter");
    cy.get("@select").should("have.been.calledOnceWith", 0);
    cy.get("tbody tr").eq(1).find("button").focus().realPress("Space");
    cy.get("@select").should("have.been.calledTwice");
  });

  it("marks the chosen row, in its class and on its button, so it can be told apart", () => {
    mountSelectable(1);
    cy.get("tbody tr").eq(1).should("have.class", "row-selected").find("button").should("have.attr", "aria-pressed", "true");
    cy.get("tbody tr").eq(0).should("not.have.class", "row-selected").find("button").should("have.attr", "aria-pressed", "false");
  });

  it("marks the chosen row with a bar as well as a tint, so the choice never relies on colour alone", () => {
    mountSelectable(0);
    cy.get("tbody tr").eq(0).should("have.css", "box-shadow").and("not.equal", "none");
    cy.get("tbody tr").eq(1).should("have.css", "box-shadow", "none");
  });

  it("tints a row under the pointer, like the grid's hover", () => {
    mountSelectable();
    cy.get("tbody tr").eq(1).then(($row) => {
      const resting = getComputedStyle($row[0]!).backgroundColor;
      cy.wrap($row).realHover();
      cy.get("tbody tr").eq(1).should(($r) => expect(getComputedStyle($r[0]!).backgroundColor).not.to.equal(resting));
    });
  });

  it("shows the symbol as plain text: no link color and no underline", () => {
    mountSelectable();
    cy.get("tbody tr").eq(0).find("button").then(($button) => {
      const button = getComputedStyle($button[0]!);
      expect(button.textDecorationLine, "no underline").to.equal("none");
      expect(button.color, "the same color as the text around it").to.equal(getComputedStyle($button.parent()[0]!).color);
      expect(button.backgroundColor, "no button background").to.equal("rgba(0, 0, 0, 0)");
    });
  });

  it("does nothing, and does not fail, when no one is listening for a choice", () => {
    cy.mount(withI18n(<QuotesTable quotes={[usdQuote]} reference={referenceOf(usd)} />));
    cy.get("tbody tr").first().click();
    cy.get("tbody tr").should("have.length", 1);
  });
});
