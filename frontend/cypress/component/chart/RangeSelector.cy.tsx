import { useState } from "react";
import { RangeSelector } from "../../../src/chart/RangeSelector";
import type { HistoryRange } from "../../../src/chart/range";
import { withI18n } from "../../support/render";

const mount = (range: HistoryRange = "1d") => {
  const onChange = cy.stub().as("change");
  cy.mount(withI18n(<RangeSelector range={range} onChange={onChange} />));
};

describe("RangeSelector", () => {
  it("is a labelled group of five buttons, a day to the maximum in order, and no five-minute button", () => {
    mount();
    cy.get(".range-buttons").should("have.attr", "role", "group").and("have.attr", "aria-label", "Chart range");
    cy.get(".range-button").then(($buttons) => {
      expect([...$buttons].map((button) => button.textContent)).to.deep.equal(["1D", "1M", "1Y", "YTD", "MAX"]);
    });
    cy.contains(".range-button", "5m").should("not.exist");
  });

  it("marks only the chosen range as pressed", () => {
    mount("1y");
    cy.get('.range-button[aria-pressed="true"]').should("have.length", 1).and("have.text", "1Y");
    cy.get('.range-button[aria-pressed="false"]').should("have.length", 4);
  });

  it("gives each button a longer name for a screen reader that starts with the short one, since the short one alone is cryptic", () => {
    mount();
    const names = ["1D, Last day", "1M, Last month", "1Y, Last year", "YTD, Year to date"];
    cy.get(".range-button").then(($buttons) => {
      expect([...$buttons].slice(0, 4).map((button) => button.getAttribute("aria-label"))).to.deep.equal(names);
      expect($buttons.last().attr("aria-label")).to.match(/^MAX, Maximum/);
    });
  });

  it("keeps what is seen inside the accessible name of every button, as WCAG 2.5.3 (label in name) asks", () => {
    mount();
    cy.get(".range-button").each(($button) => expect($button.attr("aria-label")).to.contain($button.text()));
  });

  it("tells the page which range was chosen", () => {
    mount();
    cy.contains(".range-button", "1M").click();
    cy.get("@change").should("have.been.calledWith", "1m");
    cy.contains(".range-button", "MAX").click();
    cy.get("@change").should("have.been.calledWith", "max");
    cy.contains(".range-button", "YTD").click();
    cy.get("@change").should("have.been.calledWith", "ytd");
  });

  it("says the history is simulated, for every range", () => {
    for (const range of ["1d", "1m", "1y", "ytd", "max"] as const) {
      mount(range);
      cy.get(".range-note").should("have.text", "Simulated history");
    }
  });

  it("moves the pressed state when a different range is chosen", () => {
    function Host() {
      const [range, setRange] = useState<HistoryRange>("1d");
      return <RangeSelector range={range} onChange={setRange} />;
    }
    cy.mount(withI18n(<Host />));
    cy.contains(".range-button", "YTD").click();
    cy.get('.range-button[aria-pressed="true"]').should("have.length", 1).and("have.text", "YTD");
  });

  it("can be used with the keyboard alone: Tab between the buttons and Enter or Space to choose", () => {
    mount();
    cy.get(".range-button").first().focus().realPress("Tab");
    cy.focused().should("have.text", "1M");
    cy.realPress("Enter");
    cy.get("@change").should("have.been.calledWith", "1m");
    cy.realPress("Tab");
    cy.focused().should("have.text", "1Y");
    cy.realPress("Space");
    cy.get("@change").should("have.been.calledWith", "1y");
  });

  it("is flat text with no blue: the chosen button sits on a neutral pill, not an accent-coloured block", () => {
    mount("1m");
    const accent = () => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    cy.get('.range-button[aria-pressed="true"]').then(($button) => {
      const style = getComputedStyle($button[0]!);
      expect(style.backgroundColor).not.to.equal(accent());
      expect(style.borderTopColor).to.equal("rgba(0, 0, 0, 0)"); // no border colour either
    });
    cy.get('.range-button[aria-pressed="false"]').first().then(($button) => {
      expect(getComputedStyle($button[0]!).backgroundColor).to.equal("rgba(0, 0, 0, 0)");
    });
  });

  it("is in Japanese when the language is", () => {
    localStorage.setItem("locale", "ja-JP");
    mount();
    cy.get(".range-button").then(($buttons) => {
      expect([...$buttons].map((button) => button.textContent)).to.deep.equal(["1日", "1か月", "1年", "年初来", "全期間"]);
    });
    cy.get(".range-note").should("have.text", "模擬データ");
    cy.get(".range-buttons").should("have.attr", "aria-label", "チャートの期間");
    cy.get(".range-button").first().should("have.attr", "aria-label", "1日、直近1日");
    cy.get(".range-button").each(($button) => expect($button.attr("aria-label")).to.contain($button.text()));
  });
});
