import { useState } from "react";
import { collector } from "../../../src/hud/collector";
import { Hud } from "../../../src/hud/Hud";
import { makeSession } from "../../support/fixtures";
import { withI18n } from "../../support/render";

/** Mount the HUD and wait until it is on screen, which is after React has registered its timers. */
const mountHud = (props: Partial<Parameters<typeof Hud>[0]> = {}) => {
  cy.mount(withI18n(<Hud session={makeSession()} mode="naive" {...props} />));
  cy.get(".hud").should("exist");
};

const metric = (label: string, options?: Partial<Cypress.Timeoutable>) =>
  cy.contains(".hud-metric", label, options).find("dd", options);

/** Advance the fake clock one second at a time, `seconds` times. */
const tickSeconds = (seconds: number) => Cypress._.times(seconds, () => cy.tick(1000));

/** Capture what the app saves when a recording finishes. */
const captureDownload = () => {
  const saved: { names: string[]; blob?: Blob } = { names: [] };
  cy.stub(URL, "createObjectURL").callsFake((blob: Blob) => {
    saved.blob = blob;
    return "blob:test";
  });
  cy.stub(URL, "revokeObjectURL");
  cy.stub(HTMLAnchorElement.prototype, "click").callsFake(function (this: HTMLAnchorElement) {
    saved.names.push(this.download);
  });
  return saved;
};

describe("Hud", () => {
  beforeEach(() => collector.reset());
  afterEach(() => {
    Reflect.deleteProperty(document, "hidden"); // undo any "tab hidden" simulation
  });

  it("shows placeholders for every metric before the first sample", () => {
    mountHud({ session: null });
    cy.get("#hud-title").should("have.text", "Performance");
    cy.get(".hud-metric dd").should("have.length", 7).each(($dd) => expect($dd.text()).to.equal("–"));
  });

  it("warns that numbers from a development build are not representative", () => {
    mountHud();
    cy.get(".hud-warning").should("contain.text", "Development build");
  });

  it("turns the counters into a sample every second", () => {
    mountHud();
    metric("Frame rate", { timeout: 5000 }).should("not.have.text", "–"); // the first sample has arrived
    cy.then(() => {
      collector.onDelta(100, 12);
      collector.onDelta(50, 12);
      collector.onGap();
      collector.onGap();
    });
    metric("Latency p50", { timeout: 5000 }).should("have.text", "12 ms"); // picked up by the next sample
    metric("Latency p99").should("have.text", "12 ms");
    metric("Sequence gaps").should("have.text", "2");
    metric("Messages per second").should("not.have.text", "0");
  });

  it("starts from zero even if another tab left counts behind", () => {
    collector.onGap();
    collector.onGap();
    mountHud();
    metric("Sequence gaps", { timeout: 5000 }).should("have.text", "0");
  });

  it("only allows recording once the server session is known", () => {
    mountHud({ session: null });
    cy.get(".record-button").should("be.disabled");
    mountHud();
    cy.get(".record-button").should("be.enabled").and("have.text", "Record 30-second run");
  });

  it("records a run: warming up, then a 30-second countdown, then saves the file", () => {
    const saved = captureDownload();
    cy.clock();
    mountHud();
    cy.get(".record-button").click();

    // Three seconds of warm-up that are measured but not kept.
    cy.get(".record-button").should("have.attr", "data-phase", "warmup").and("have.text", "Warming up, 3 s left").and("be.disabled");
    cy.tick(1000);
    cy.get(".record-button").should("have.text", "Warming up, 2 s left");
    tickSeconds(2);

    // Then the full 30-second countdown.
    cy.get(".record-button").should("have.attr", "data-phase", "measuring").and("have.text", "Recording, 30 s left");
    cy.tick(1000);
    cy.get(".record-button").should("have.text", "Recording, 29 s left");
    tickSeconds(28);
    cy.get(".record-button").should("have.text", "Recording, 1 s left");

    // The last second saves the file and returns the button to normal.
    cy.tick(1000);
    cy.get(".record-button").should("have.text", "Record 30-second run").and("be.enabled").and("not.have.attr", "data-phase");
    cy.get(".hud-note[role=status]").should("contain.text", "Saved").and("contain.text", ".json");

    cy.then(async () => {
      expect(saved.names).to.have.length(1);
      expect(saved.names[0]).to.match(/_naive_50k\.json$/);
      const result = JSON.parse(await (saved.blob as Blob).text());
      expect(result.mode).to.equal("naive");
      expect(result.warmupSeconds).to.equal(3);
      expect(result.durationSeconds).to.equal(30);
      expect(result.samples).to.have.length(30);
      expect(result.tabHidden).to.equal(false);
      expect(result.load.instruments).to.equal(3);
    });
  });

  it("names the file after the pipeline being measured", () => {
    const saved = captureDownload();
    cy.clock();
    mountHud({ mode: "optimized" });
    cy.get(".record-button").click();
    tickSeconds(33);
    cy.then(() => expect(saved.names[0]).to.match(/_optimized_50k\.json$/));
  });

  it("warns, and marks the file, when the tab was hidden during the run", () => {
    const saved = captureDownload();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    cy.clock();
    mountHud();
    cy.get(".record-button").click();
    tickSeconds(33);
    cy.get(".hud-note[role=status]").should("contain.text", "The tab was hidden");
    cy.then(async () => expect(JSON.parse(await (saved.blob as Blob).text()).tabHidden).to.equal(true));
  });

  describe("the refresh interval", () => {
    it("warns that a grid redrawing every 1.5 s flatters the numbers", () => {
      mountHud({ mode: "optimized", refreshSeconds: 1.5 });
      cy.get(".hud-warning").should("contain.text", "refreshes every 1.5 s").and("contain.text", "Set the refresh interval to 0");
    });

    it("does not warn at 0, which is the fair way to measure", () => {
      mountHud({ mode: "optimized", refreshSeconds: 0 });
      cy.contains(".hud-warning", "refreshes every").should("not.exist");
    });

    it("does not warn on a tab with no such setting", () => {
      mountHud();
      cy.contains(".hud-warning", "refreshes every").should("not.exist");
    });

    it("saves the interval in the result file", () => {
      const saved = captureDownload();
      cy.clock();
      mountHud({ mode: "optimized", refreshSeconds: 1.5 });
      cy.get(".record-button").click();
      tickSeconds(33);
      cy.then(async () => {
        const result = JSON.parse(await (saved.blob as Blob).text());
        expect(result.schema).to.equal(2);
        expect(result.settings).to.deep.equal({ refreshSeconds: 1.5, changedDuringRun: false });
      });
    });

    it("saves null for Naive", () => {
      const saved = captureDownload();
      cy.clock();
      mountHud();
      cy.get(".record-button").click();
      tickSeconds(33);
      cy.then(async () => expect(JSON.parse(await (saved.blob as Blob).text()).settings.refreshSeconds).to.equal(null));
    });

    it("warns, and marks the file, when the interval is changed during the run", () => {
      const saved = captureDownload();
      cy.clock();
      // The page's refresh box, which edits the interval the panel is told about.
      function Page() {
        const [seconds, setSeconds] = useState(1.5);
        return (
          <>
            <button onClick={() => setSeconds(0)}>set to 0</button>
            <Hud session={makeSession()} mode="optimized" refreshSeconds={seconds} />
          </>
        );
      }
      cy.mount(withI18n(<Page />));
      cy.get(".hud").should("exist");
      cy.get(".record-button").click();
      tickSeconds(5);
      cy.contains("button", "set to 0").click();
      tickSeconds(28);
      cy.get(".hud-note[role=status]").should("contain.text", "refresh interval was changed");
      cy.then(async () => {
        const result = JSON.parse(await (saved.blob as Blob).text());
        expect(result.settings).to.deep.equal({ refreshSeconds: 1.5, changedDuringRun: true });
      });
    });
  });

  it("stops its timers when it is removed", () => {
    cy.clock();
    mountHud();
    cy.mount(<p>elsewhere</p>);
    tickSeconds(3);
    cy.contains("elsewhere").should("exist");
  });

  it("labels the panel and the button in the current language", () => {
    localStorage.setItem("locale", "ja-JP");
    mountHud();
    cy.get("#hud-title").should("have.text", "パフォーマンス");
    cy.get(".record-button").should("have.text", "30秒間を記録");
  });
});
