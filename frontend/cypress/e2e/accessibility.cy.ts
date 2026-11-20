import type { Result } from "axe-core";
import { NAIVE, emulateMedia, waitForChartDrawn, waitForLiveGrid, waitForLiveTable } from "../support/e2e";

// WCAG 2.2 level AA, as far as an automated scan can check it. Manual checks (screen reader, zoom
// by eye) are still needed; automated tools find roughly a third of issues.
const AXE_OPTIONS = {
  runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
};

// One line per violation, then the page elements involved.
const describeViolation = (violation: Result): string => {
  const elements = violation.nodes.map((node) => "    " + node.target.join(" ")).join("\n");
  return "[" + violation.impact + "] " + violation.id + ": " + violation.help + "\n" + elements;
};

// Print a readable summary of any violations, then let the assertion fail.
const logViolations = (violations: Result[]) => {
  cy.task("log", violations.map(describeViolation).join("\n"));
};

const scan = () => {
  cy.injectAxe();
  cy.checkA11y(undefined, AXE_OPTIONS, logViolations);
};

const visitWith = (settings: { theme?: "light" | "dark"; locale?: string }, url = NAIVE) =>
  cy.visit(url, {
    onBeforeLoad(win) {
      if (settings.theme) win.localStorage.setItem("theme", settings.theme);
      if (settings.locale) win.localStorage.setItem("locale", settings.locale);
    },
  });

describe("accessibility (automated WCAG 2.2 AA scan)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const locale of ["en-US", "ja-JP"]) {
      it(`has no violations: ${theme} theme, ${locale}`, () => {
        visitWith({ theme, locale });
        waitForLiveTable();
        scan();
      });
    }
  }

  it("has no violations while the page is loading (skeleton)", () => {
    cy.intercept("**/assets/NaivePage*.js", (request) => {
      request.on("response", (response) => {
        response.setDelay(3000);
      });
    });
    cy.visit(NAIVE);
    cy.get("svg.skeleton").should("exist");
    scan();
  });

  it("has no violations when the page code fails to load", () => {
    cy.intercept("**/assets/NaivePage*.js", { forceNetworkError: true });
    cy.visit(NAIVE);
    cy.get("[role=alert]").should("exist");
    scan();
  });

  it("has no violations while a recording is in progress", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get(".record-button").click();
    cy.get(".record-button").should("have.attr", "data-phase");
    scan();
  });

  it("has no violations in the high-contrast theme", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.document().then((doc) => doc.documentElement.setAttribute("data-theme", "high-contrast"));
    scan();
  });
});

// A changed value flashes a highlight behind its text for a second. That is a moment in time, not the page's state, and
// a scan that lands inside it reads the flash color as the background. So these scans run with reduced motion, which
// is when the grid does not flash; the flash itself is checked in the component tests.
describe("accessibility of the Optimized tab (the default view)", () => {
  beforeEach(() => emulateMedia([{ name: "prefers-reduced-motion", value: "reduce" }]));

  for (const theme of ["light", "dark"] as const) {
    for (const locale of ["en-US", "ja-JP"]) {
      it(`has no violations: ${theme} theme, ${locale}`, () => {
        visitWith({ theme, locale }, "/");
        waitForLiveGrid();
        scan();
      });
    }
  }

  it("has no violations while the grid is frozen", () => {
    cy.visit("/");
    waitForLiveGrid();
    cy.contains("button", "Freeze stream").click();
    scan();
  });

  it("reflows to a 320 pixel wide screen without sideways scrolling of the page (WCAG 1.4.10)", () => {
    cy.viewport(320, 640);
    cy.visit("/");
    waitForLiveGrid();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});

// The chart, the watchlist with entries in it, and the toast, on both tabs. As above, a value that has just changed
// flashes a highlight, so the Optimized scans run with reduced motion (when the grid does not flash).
describe("accessibility of the chart and the watchlist", () => {
  const TABS = [
    { name: "Naive", url: NAIVE, ready: waitForLiveTable },
    { name: "Optimized", url: "/", ready: waitForLiveGrid },
  ];
  beforeEach(() => emulateMedia([{ name: "prefers-reduced-motion", value: "reduce" }]));

  for (const tab of TABS) {
    for (const theme of ["light", "dark"] as const) {
      for (const locale of ["en-US", "ja-JP"]) {
        it(`${tab.name}: no violations with the chart open and symbols on the watchlist: ${theme} theme, ${locale}`, () => {
          visitWith({ theme, locale }, tab.url);
          tab.ready();
          waitForChartDrawn();
          cy.get(".symbol-detail-watch").click();
          cy.get(".watchlist .watch-item").should("have.length", 1);
          cy.get('.watchlist canvas.mini-canvas[data-ready="true"]', { timeout: 30000 }).should("exist");
          scan();
        });
      }
    }

    it(`${tab.name}: no violations while the toast is showing`, () => {
      cy.visit(tab.url, { onBeforeLoad: (win) => win.localStorage.setItem("watchlist", "[1,2,3,4]") }); // already full
      tab.ready();
      waitForChartDrawn();
      cy.get(".symbol-detail-watch").click(); // AAA would be a fifth
      cy.get(".toast").should("be.visible");
      scan();
    });

    it(`${tab.name}: no violations with the watchlist collapsed`, () => {
      cy.visit(tab.url);
      tab.ready();
      waitForChartDrawn();
      cy.get(".watchlist-toggle").click();
      cy.get(".watchlist").should("not.exist");
      scan();
    });

    it(`${tab.name}: no violations while the chart and the watchlist are still loading (skeletons)`, () => {
      cy.visit(tab.url, { onBeforeLoad: (win) => win.localStorage.setItem("watchlist", "[1,2]") });
      cy.get("svg.skeleton").should("exist");
      scan();
    });

    it(`${tab.name}: the open chart, its buttons and each watchlist entry have names for assistive technology`, () => {
      cy.visit(tab.url, { onBeforeLoad: (win) => win.localStorage.setItem("watchlist", "[1,2]") });
      tab.ready();
      waitForChartDrawn();
      cy.get("canvas.chart-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label");
      cy.get(".watchlist .watch-item").each(($item) => {
        cy.wrap($item).find("button").each(($button) => expect($button.attr("aria-label"), "button name").to.be.a("string").and.not.be.empty);
        cy.wrap($item).find("canvas").should("have.attr", "role", "img");
      });
    });
  }

  it("makes the watchlist's buttons at least 24 by 24 pixels (WCAG 2.5.8)", () => {
    cy.visit("/", { onBeforeLoad: (win) => win.localStorage.setItem("watchlist", "[1,2]") });
    waitForLiveGrid();
    cy.get(".watchlist button, .watchlist-toggle, .symbol-detail button").each(($control) => {
      const { width, height } = $control[0]?.getBoundingClientRect() ?? { width: 0, height: 0 };
      expect(width, `${$control.attr("aria-label") ?? $control.text()} width`).to.be.at.least(24);
      expect(height, `${$control.attr("aria-label") ?? $control.text()} height`).to.be.at.least(24);
    });
  });

  it("reflows to a 320 pixel wide screen without sideways scrolling of the page, with the watchlist below the quotes", () => {
    cy.viewport(320, 800);
    cy.visit("/", { onBeforeLoad: (win) => win.localStorage.setItem("watchlist", "[1]") });
    waitForLiveGrid();
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth));
    cy.get(".workspace-main").then(($main) => {
      cy.get(".workspace-side").then(($side) => expect($side[0]!.getBoundingClientRect().top).to.be.at.least($main[0]!.getBoundingClientRect().bottom - 1));
    });
  });
});

describe("accessibility details a scanner cannot fully judge", () => {
  it("makes every control at least 24 by 24 pixels (WCAG 2.5.8)", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get("button, select, [role=tab], [role=switch]").each(($control) => {
      const { width, height } = $control[0]?.getBoundingClientRect() ?? { width: 0, height: 0 };
      expect(width, `${$control.text() || $control.attr("aria-label")} width`).to.be.at.least(24);
      expect(height, `${$control.text() || $control.attr("aria-label")} height`).to.be.at.least(24);
    });
  });

  it("stops the loading shimmer when the user prefers reduced motion (WCAG 2.3.3)", () => {
    emulateMedia([{ name: "prefers-reduced-motion", value: "reduce" }]);
    cy.intercept("**/assets/NaivePage*.js", (request) => {
      request.on("response", (response) => {
        response.setDelay(2000);
      });
    });
    cy.visit(NAIVE);
    cy.get("svg.skeleton rect").should("exist");
    cy.get("svg.skeleton animateTransform").should("not.exist");
  });

  it("reflows to a 320 pixel wide screen without sideways scrolling (WCAG 1.4.10)", () => {
    cy.viewport(320, 640);
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it("keeps the table's own horizontal scrolling inside its labelled region", () => {
    cy.viewport(320, 640);
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get(".table-wrap").should("have.attr", "tabindex", "0").and("have.attr", "aria-label");
    cy.get(".table-wrap").then(($wrap) => {
      expect($wrap[0]?.scrollWidth).to.be.greaterThan($wrap[0]?.clientWidth ?? 0);
    });
  });

  it("does not rely on colour alone to show connection status", () => {
    cy.visit(NAIVE);
    waitForLiveTable();
    cy.get(".status").invoke("text").should("not.be.empty");
  });
});
