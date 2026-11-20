import { makeSession } from "../../support/fixtures";
import {
  advanceRecording,
  buildResult,
  downloadJson,
  recordingStateAfter,
  resultFileName,
  type HudSample,
  type Recording,
} from "../../../src/hud/recorder";

const sample = (overrides: Partial<HudSample> = {}): HudSample => ({
  fps: 60,
  worstFrameMs: 20,
  messagesPerSec: 50,
  updatesPerSec: 50_000,
  latencyP50: 4,
  latencyP99: 9,
  gaps: 0,
  gapsTotal: 0,
  ...overrides,
});

const recording = (
  samples: HudSample[],
  latencies: number[] = [],
  tabHidden = false,
  refreshSeconds: number | null = null,
  refreshChanged = false,
): Recording => ({
  tick: 33,
  samples,
  latencies,
  tabHidden,
  refreshSeconds,
  refreshChanged,
});

describe("buildResult", () => {
  const twoSeconds = recording(
    [
      sample({ fps: 60, worstFrameMs: 20, messagesPerSec: 50, updatesPerSec: 50_000, gaps: 0 }),
      sample({ fps: 40, worstFrameMs: 50, messagesPerSec: 30, updatesPerSec: 30_000, gaps: 2 }),
    ],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );

  it("summarises the measured seconds", () => {
    const { summary, durationSeconds, warmupSeconds, samples } = buildResult(twoSeconds, "naive", makeSession());
    expect(summary).to.deep.equal({
      fpsAvg: 50,
      fpsMin: 40,
      worstFrameMs: 50,
      messagesPerSecAvg: 40,
      updatesPerSecAvg: 40_000,
      latencyMs: { p50: 6, p99: 10 },
      gaps: 2,
    });
    expect(durationSeconds).to.equal(2);
    expect(warmupSeconds).to.equal(3);
    expect(samples).to.have.length(2);
  });

  it("records the pipeline mode and the load the server reported", () => {
    const result = buildResult(twoSeconds, "optimized", makeSession());
    expect(result.schema).to.equal(2);
    expect(result.mode).to.equal("optimized");
    expect(result.load).to.deep.equal({ instruments: 3, updatesPerSecond: 50_000, tickMs: 20, protocolVersion: 2 });
  });

  describe("the refresh setting", () => {
    it("saves the interval the grid was redrawing at, so a flattering run cannot pass for a fair one", () => {
      expect(buildResult(recording([sample()], [], false, 1.5), "optimized", null).settings).to.deep.equal({
        refreshSeconds: 1.5,
        changedDuringRun: false,
      });
    });

    it("saves 0 as 0, which is the fair way to measure", () => {
      expect(buildResult(recording([sample()], [], false, 0), "optimized", null).settings.refreshSeconds).to.equal(0);
    });

    it("saves null for a tab with no such setting, like Naive", () => {
      expect(buildResult(twoSeconds, "naive", null).settings.refreshSeconds).to.equal(null);
    });

    it("says when the interval was changed during the run", () => {
      expect(buildResult(recording([sample()], [], false, 1.5, true), "optimized", null).settings.changedDuringRun).to.equal(true);
    });
  });

  it("records the load as null when there was no session", () => {
    expect(buildResult(twoSeconds, "naive", null).load).to.equal(null);
  });

  it("records whether the tab was hidden during the run", () => {
    expect(buildResult(recording([sample()], [1], true), "naive", null).tabHidden).to.equal(true);
    expect(buildResult(twoSeconds, "naive", null).tabHidden).to.equal(false);
  });

  it("rounds each sample for the file", () => {
    const { samples } = buildResult(recording([sample({ fps: 59.96, updatesPerSec: 49_999.6 })]), "naive", null);
    expect(samples[0]?.fps).to.equal(60);
    expect(samples[0]?.updatesPerSec).to.equal(50_000);
  });

  it("describes the build and the browser that produced the run", () => {
    const result = buildResult(twoSeconds, "naive", null);
    expect(result.build).to.equal("development"); // component tests run on the dev server
    expect(result.commit).to.be.a("string").and.not.equal("");
    expect(result.environment.userAgent).to.equal(navigator.userAgent);
    expect(result.environment.viewport).to.deep.equal({ width: window.innerWidth, height: window.innerHeight });
    expect(new Date(result.recordedAt).toString()).not.to.equal("Invalid Date");
  });
});

describe("resultFileName", () => {
  it("combines the time, the pipeline and the load", () => {
    expect(resultFileName("naive", makeSession())).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}_naive_50k\.json$/);
  });

  it("falls back to 'unknown' when there was no session", () => {
    expect(resultFileName("optimized", null)).to.match(/_optimized_unknown\.json$/);
  });
});

describe("downloadJson", () => {
  it("saves the data as a JSON file download and frees the temporary URL", () => {
    let blob: Blob | undefined;
    let downloadName = "";
    cy.stub(URL, "createObjectURL").callsFake((object: Blob) => {
      blob = object;
      return "blob:test";
    });
    const revoke = cy.stub(URL, "revokeObjectURL");
    cy.stub(HTMLAnchorElement.prototype, "click").callsFake(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });

    downloadJson("run.json", { answer: 42 });

    cy.then(async () => {
      expect(downloadName).to.equal("run.json");
      expect(JSON.parse(await (blob as Blob).text())).to.deep.equal({ answer: 42 });
      expect(revoke).to.have.been.calledWith("blob:test");
    });
  });
});

describe("recordingStateAfter", () => {
  it("counts down the warm-up first", () => {
    expect(recordingStateAfter(0)).to.deep.equal({ status: "recording", phase: "warmup", remaining: 3 });
    expect(recordingStateAfter(1)).to.deep.equal({ status: "recording", phase: "warmup", remaining: 2 });
    expect(recordingStateAfter(2)).to.deep.equal({ status: "recording", phase: "warmup", remaining: 1 });
  });

  it("starts the 30-second countdown the moment warm-up ends", () => {
    expect(recordingStateAfter(3)).to.deep.equal({ status: "recording", phase: "measuring", remaining: 30 });
    expect(recordingStateAfter(4)).to.deep.equal({ status: "recording", phase: "measuring", remaining: 29 });
    expect(recordingStateAfter(32)).to.deep.equal({ status: "recording", phase: "measuring", remaining: 1 });
  });

  it("reports the run as complete after 3 + 30 seconds", () => {
    expect(recordingStateAfter(33)).to.equal(null);
    expect(recordingStateAfter(40)).to.equal(null);
  });
});

describe("advanceRecording", () => {
  const fresh = (refreshSeconds: number | null = null): Recording => ({
    tick: 0,
    samples: [],
    latencies: [],
    tabHidden: false,
    refreshSeconds,
    refreshChanged: false,
  });

  it("counts every second but keeps nothing during warm-up", () => {
    const run = fresh();
    for (let i = 0; i < 3; i++) advanceRecording(run, sample(), [5], false, null);
    expect(run.tick).to.equal(3);
    expect(run.samples).to.have.length(0);
    expect(run.latencies).to.have.length(0);
  });

  it("keeps each sample and its latencies once warm-up is over", () => {
    const run = fresh();
    for (let i = 0; i < 4; i++) advanceRecording(run, sample({ fps: 50 + i }), [i, i + 10], false, null);
    expect(run.samples.map((s) => s.fps)).to.deep.equal([53]);
    expect(run.latencies).to.deep.equal([3, 13]);
  });

  it("remembers if the tab was hidden at any point, and never forgets it", () => {
    const run = fresh();
    advanceRecording(run, sample(), [], false, null);
    expect(run.tabHidden).to.equal(false);
    advanceRecording(run, sample(), [], true, null);
    advanceRecording(run, sample(), [], false, null);
    expect(run.tabHidden).to.equal(true);
  });

  it("notices if the refresh interval changes during the run, and never forgets it", () => {
    const run = fresh(1.5);
    advanceRecording(run, sample(), [], false, 1.5);
    expect(run.refreshChanged).to.equal(false);
    advanceRecording(run, sample(), [], false, 0);
    advanceRecording(run, sample(), [], false, 1.5); // changed back, but the run was still affected
    expect(run.refreshChanged).to.equal(true);
  });

  it("does not flag a tab with no refresh setting", () => {
    const run = fresh(null);
    advanceRecording(run, sample(), [], false, null);
    expect(run.refreshChanged).to.equal(false);
  });
});
