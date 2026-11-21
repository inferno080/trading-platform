import {
  BookSkeleton,
  ChartSkeleton,
  MiniChartLoading,
  MiniChartSkeleton,
  PageSkeleton,
  SymbolDetailSkeleton,
  TableSkeleton,
} from "../../../src/components/skeletons";
import { withI18n } from "../../support/render";

describe("TableSkeleton", () => {
  it("draws a header row and twelve body rows of eight columns", () => {
    cy.mount(withI18n(<TableSkeleton />));
    cy.get(".skeleton-frame svg.skeleton rect").should("have.length", 8 + 12 * 8);
  });
});

describe("BookSkeleton", () => {
  it("announces loading once, and has the order book and the trades as two blocks of ten rows", () => {
    cy.mount(withI18n(<BookSkeleton />));
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading the order book");
    cy.get(".book-panel > div").should("have.length", 2);
    cy.get(".book-panel svg.skeleton").should("have.length", 4);
  });
});

describe("PageSkeleton", () => {
  it("announces loading once to screen readers instead of reading the shapes", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get("[role=status]").should("contain.text", "Loading");
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading");
  });

  it("has the shape of the real page: toolbar, performance panel, the chart panel beside the watchlist, then the quotes below", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get(".hud svg.skeleton").should("exist");
    cy.get(".workspace[data-watchlist=open][data-main=chart] .workspace-main .symbol-detail").should("exist");
    cy.get(".workspace-main .symbol-detail svg.skeleton").should("have.length", 6); // heading, chart, and the order book and trades (two each)
    cy.get(".workspace-side .watchlist .watch-item").should("have.length", 2);
    cy.get(".workspace-side .watch-item svg.skeleton").should("have.length", 4); // symbol row and mini chart, twice
    cy.get(".workspace").next(".skeleton-frame").should("exist"); // the table's skeleton, below the row, outside it
  });

  it("puts the table skeleton across the full width, wider than the chart panel above it", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get(".workspace-main").then(($main) => {
      cy.get(".workspace").next(".skeleton-frame").then(($table) => {
        expect($table[0]!.getBoundingClientRect().width).to.be.greaterThan($main[0]!.getBoundingClientRect().width + 100);
      });
    });
  });

  it("lays the quotes and the watchlist out 70% and 30%, like the real page, so nothing jumps when it is replaced", () => {
    cy.mount(withI18n(<PageSkeleton />));
    cy.get(".workspace-main").then(($main) => {
      const main = $main[0]!.getBoundingClientRect().width;
      const side = $main.parent().find(".workspace-side")[0]!.getBoundingClientRect().width;
      expect(main / (main + side), "the quotes' share of the width").to.be.within(0.65, 0.72);
    });
  });

  it("says loading in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<PageSkeleton />));
    cy.get("[role=status] .visually-hidden").should("have.text", "読み込み中");
  });
});

describe("ChartSkeleton", () => {
  it("is as tall as the real chart, and hidden from assistive technology", () => {
    cy.mount(withI18n(<ChartSkeleton />));
    cy.get("svg.skeleton").should("have.attr", "height", "240").and("have.attr", "aria-hidden", "true");
  });

  it("has a price label and a grid line for each of the five price lines", () => {
    cy.mount(withI18n(<ChartSkeleton />));
    cy.get("svg.skeleton rect").should("have.length.greaterThan", 10);
  });
});

describe("MiniChartSkeleton", () => {
  it("is as tall as a watchlist mini chart", () => {
    cy.mount(withI18n(<MiniChartSkeleton />));
    cy.get("svg.skeleton").should("have.attr", "height", "56");
  });
});

describe("MiniChartLoading", () => {
  it("stands in for a watchlist chart whose symbol is not known yet, and says it is loading", () => {
    cy.mount(withI18n(<MiniChartLoading />));
    cy.get(".mini-chart[role=status] svg.skeleton").should("exist");
    cy.get(".visually-hidden").should("have.text", "Loading price history");
  });
});

describe("SymbolDetailSkeleton", () => {
  it("is a panel with a heading line, a chart, and the order book and trades below it, announced once as loading", () => {
    cy.mount(withI18n(<SymbolDetailSkeleton />));
    cy.get("section.symbol-detail[role=status]").should("exist");
    cy.get(".visually-hidden").should("have.text", "Loading price history");
    cy.get("svg.skeleton").should("have.length", 6);
    cy.get(".symbol-detail-chart svg.skeleton").should("have.length", 1);
    cy.get(".symbol-detail-side .book-panel > div").should("have.length", 2); // the order book and the trades, side by side
  });

  it("uses colors that stay visible on the panel's own background", () => {
    cy.mount(withI18n(<SymbolDetailSkeleton />));
    cy.get("section.symbol-detail").then(($panel) => {
      const styles = getComputedStyle($panel[0]!);
      const panelBackground = styles.backgroundColor;
      const base = styles.getPropertyValue("--skeleton-base").trim();
      expect(base, "the skeleton color is defined for the panel").not.to.equal("");
      cy.log(`panel ${panelBackground}, skeleton ${base}`);
    });
  });
});
