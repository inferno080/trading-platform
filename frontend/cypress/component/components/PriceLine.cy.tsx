import { PriceLine } from "../../../src/components/PriceLine";
import type { PriceSummary } from "../../../src/chart/price";
import type { HistoryRange } from "../../../src/protocol/messages";
import { withI18n } from "../../support/render";

const up: PriceSummary = { price: "912.76", direction: 1, percent: "+0.62%", change: "+5.65" };
const down: PriceSummary = { price: "297.05", direction: -1, percent: "-0.32%", change: "-0.95" };
const flat: PriceSummary = { price: "298.00", direction: 0, percent: "0.00%", change: "0.00" };

const mountLine = (summary: PriceSummary | null, variant: "big" | "small" = "big", range?: HistoryRange) =>
  cy.mount(withI18n(<PriceLine summary={summary} variant={variant} range={range} />));
const color = (selector: string) => cy.get(selector).then(($e) => getComputedStyle($e[0]!).color);
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toRgb = (hex: string) => {
  const probe = document.createElement("span");
  probe.style.color = hex;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

describe("PriceLine", () => {
  it("shows the price, then an arrow and the percentage, then the amount in brackets and Today", () => {
    mountLine(up);
    cy.get(".price-line").invoke("text").should("match", /^912\.76\s*▲ \+0\.62%\s*\(\+5\.65\) Today$/);
  });

  it("shows a fall with a down arrow", () => {
    mountLine(down);
    cy.get(".price-move").should("contain.text", "▼").and("contain.text", "0.32%");
    cy.get(".price-change").should("have.text", "(-0.95)");
  });

  it("shows no arrow when the price is unchanged", () => {
    mountLine(flat);
    cy.get(".price-move").should("have.text", " 0.00%").find("[aria-hidden]").should("have.text", "");
  });

  it("hides the arrow from assistive technology, which hears the signed percentage", () => {
    mountLine(up);
    cy.get(".price-move [aria-hidden=true]").should("have.text", "▲");
  });

  describe("color", () => {
    it("colors the price and its move green when up", () => {
      mountLine(up);
      cy.get(".price-line").should("have.attr", "data-direction", "1");
      for (const part of [".price-now", ".price-move", ".price-change"]) color(part).should("equal", toRgb(token("--color-up")));
    });

    it("colors the price and its move red when down", () => {
      mountLine(down);
      cy.get(".price-line").should("have.attr", "data-direction", "-1");
      for (const part of [".price-now", ".price-move", ".price-change"]) color(part).should("equal", toRgb(token("--color-down")));
    });

    it("leaves a flat price in the ordinary text color", () => {
      mountLine(flat);
      color(".price-now").should("not.equal", toRgb(token("--color-up"))).and("not.equal", toRgb(token("--color-down")));
    });

    it("keeps the word Today muted, whatever the direction", () => {
      mountLine(up);
      color(".price-today").should("equal", toRgb(token("--color-text-muted")));
    });
  });

  it("shows only the price when there is nothing to compare it with", () => {
    mountLine({ price: "298.00", direction: 0, percent: null, change: null });
    cy.get(".price-now").should("have.text", "298.00");
    cy.get(".price-move").should("not.exist");
    cy.get(".price-today").should("not.exist");
  });

  it("is empty, but keeps its height so nothing jumps, until there is data", () => {
    mountLine(null);
    cy.get(".price-line").should("have.text", "").and("have.attr", "data-direction", "0");
    cy.get(".price-line").should(($line) => expect($line[0]!.getBoundingClientRect().height).to.be.greaterThan(15));
  });

  describe("sizes", () => {
    it("is bigger on the open chart's panel than on a watchlist tile", () => {
      mountLine(up, "big");
      cy.get(".price-now").then(($big) => {
        const big = parseFloat(getComputedStyle($big[0]!).fontSize);
        mountLine(up, "small");
        cy.get(".price-now").should(($small) => expect(parseFloat(getComputedStyle($small[0]!).fontSize)).to.be.lessThan(big));
      });
    });

    it("sets the price in a bold monospace font, so the digits line up", () => {
      mountLine(up);
      cy.get(".price-now").should("have.css", "font-weight", "700").and("have.css", "font-variant-numeric", "tabular-nums");
    });

    it("puts the price, the move and Today on one line when there is room", () => {
      mountLine(up, "small");
      cy.get(".price-line").then(($line) => {
        const tops = [...$line.children()].map((child) => Math.round(child.getBoundingClientRect().bottom));
        expect(new Set(tops).size, "distinct baselines").to.be.lessThan(3);
      });
    });
  });

  it("says Today in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    mountLine(up);
    cy.get(".price-today").should("contain.text", "本日");
  });

  it("says Today for the live range and for one day, and names the longer ranges instead", () => {
    for (const range of ["5m", "1d"] as const) {
      mountLine(up, "big", range);
      cy.get(".price-today").should("contain.text", "Today");
    }
    for (const [range, words] of [
      ["1m", "1 month"],
      ["1y", "1 year"],
      ["ytd", "YTD"],
      ["max", "All time"],
    ] as const) {
      mountLine(up, "big", range);
      cy.get(".price-today").should("contain.text", words).and("not.contain.text", "Today");
    }
  });

  it("names the longer ranges in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    mountLine(up, "big", "ytd");
    cy.get(".price-today").should("contain.text", "年初来");
  });
});
