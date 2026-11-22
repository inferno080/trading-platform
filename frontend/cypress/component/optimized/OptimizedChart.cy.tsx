import { FeedStore } from "../../../src/optimized/feedStore";
import { OptimizedChart } from "../../../src/optimized/OptimizedChart";
import { countInk, series } from "../../support/canvas";
import { afterFrames } from "../../support/frames";
import { withI18n } from "../../support/render";

const ID = 1;
// Five minutes of a price rising from 300.00 to 305.00 (decimals 2), as the worker would send it.
const rising = (count = 300, from = 30000) => Float64Array.from(series(count, (i) => from + i * 2));
const send = (store: FeedStore, data: Float64Array, id = ID) => store.setCharts([{ id, data }]);

interface Options {
  unavailable?: boolean;
  refreshMs?: number;
}
const chartElement = (store: FeedStore, { unavailable = false, refreshMs = 0 }: Options = {}) =>
  withI18n(
    <>
      <OptimizedChart store={store} id={ID} symbol="AAA" decimals={2} prevClose={29800} unavailable={unavailable} refreshMs={refreshMs} />
      <p id="elsewhere">elsewhere</p>
    </>,
  );
const mountChart = (store = new FeedStore(), options: Options = {}) => {
  cy.mount(chartElement(store, options));
  return store;
};
const ink = () => cy.get("canvas.chart-canvas").then(($c) => countInk($c[0] as HTMLCanvasElement));

describe("OptimizedChart", () => {
  describe("before the history arrives", () => {
    it("shows a chart skeleton, announced once as loading, and keeps the canvas hidden", () => {
      mountChart();
      cy.get(".chart-overlay svg.skeleton").should("exist");
      cy.get(".chart-overlay").should("have.attr", "role", "status").and("contain.text", "Loading price history");
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "false");
    });

    it("is a labelled image, named for the symbol until there is data to describe", () => {
      mountChart();
      cy.get("canvas.chart-canvas").should("have.attr", "role", "img").and("have.attr", "aria-label", "AAA");
    });
  });

  describe("when the history arrives", () => {
    it("draws it, and only then removes the skeleton (never a blank gap)", () => {
      const store = mountChart();
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
      cy.get(".chart-overlay").should("not.exist");
      cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(500));
    });

    it("describes the chart in words for assistive technology: last, high and low over the period", () => {
      const store = mountChart();
      cy.then(() => send(store, Float64Array.from([0, 30000, 60_000, 31000, 120_000, 30500])));
      cy.get("canvas.chart-canvas").should("have.attr", "aria-label", "AAA price over the last 2 minutes: last 305.00, high 310.00, low 300.00.");
    });

    it("draws what was already in the store when it appears (a chart opened after its data arrived)", () => {
      const store = new FeedStore();
      send(store, rising());
      mountChart(store);
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    });

    it("ignores a chart for another instrument", () => {
      const store = mountChart();
      cy.then(() => send(store, rising(), 2));
      cy.get(".chart-overlay svg.skeleton").should("exist");
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "false");
    });
  });

  describe("as the price changes", () => {
    it("redraws on each change when the refresh interval is 0", () => {
      const store = mountChart();
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
      ink().then((before) => {
        cy.then(() => send(store, Float64Array.from(series(300, (i) => 30000 + (i % 2) * 500))));
        cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).not.to.equal(before));
      });
    });

    it("holds changes back until the refresh interval has passed, then draws them", () => {
      const store = mountChart(new FeedStore(), { refreshMs: 1500 });
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
      ink().then((before) => {
        cy.then(() => send(store, Float64Array.from(series(300, (i) => 30000 + (i % 2) * 500))));
        afterFrames(20); // about a third of a second: well inside the interval
        ink().should("equal", before);
        cy.get("canvas.chart-canvas", { timeout: 5000 }).should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).not.to.equal(before));
      });
    });

    it("draws many changes inside one interval as a single redraw of the latest", () => {
      const store = mountChart(new FeedStore(), { refreshMs: 300 });
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
      cy.then(() => {
        for (let i = 0; i < 20; i++) send(store, rising(300, 30000 + i * 100));
      });
      cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("match", /last 3\d\d\.\d\d/);
    });
  });

  describe("the pointer", () => {
    it("moves a crosshair with it at once, even when the refresh interval is long", () => {
      const store = mountChart(new FeedStore(), { refreshMs: 60_000 });
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(500));
      ink().then((before) => {
        cy.get("canvas.chart-canvas").realHover({ position: { x: 400, y: 100 } });
        cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.greaterThan(before + 100)); // the crosshair and its label
        ink().then((hovering) => {
          cy.get("#elsewhere").realHover(); // the pointer leaves the chart
          cy.get("canvas.chart-canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement)).to.be.lessThan(hovering - 100)); // and the crosshair goes
        });
      });
    });
  });

  describe("when the server has no history", () => {
    it("says so, as an alert, and shows no skeleton", () => {
      mountChart(new FeedStore(), { unavailable: true });
      cy.get("p.chart-message").should("have.attr", "role", "alert").and("contain.text", "Price history is not available");
      cy.get("svg.skeleton").should("not.exist");
    });
  });

  describe("the theme", () => {
    it("redraws in the new colors when the theme changes", () => {
      document.documentElement.style.setProperty("--color-up", "rgb(255, 0, 0)"); // the line is the up color when the price is above the previous close
      const store = mountChart();
      cy.then(() => send(store, rising()));
      cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
      cy.get("canvas.chart-canvas").then(($c) => {
        const canvas = $c[0] as HTMLCanvasElement;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const red = () => {
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let count = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60 && data[i + 3]! > 200) count++;
          return count;
        };
        expect(red(), "red line before").to.be.greaterThan(100);
        document.documentElement.style.setProperty("--color-up", "rgb(0, 0, 255)");
        document.documentElement.setAttribute("data-theme", "dark");
        cy.wrap(null).should(() => expect(red(), "red line after").to.be.lessThan(20));
        cy.then(() => {
          document.documentElement.style.removeProperty("--color-up");
          document.documentElement.removeAttribute("data-theme");
        });
      });
    });
  });

  it("says its loading text in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    mountChart();
    cy.get(".chart-overlay").should("contain.text", "価格履歴を読み込み中");
  });
});
