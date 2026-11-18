import type { Session } from "../protocol/messages";
import { percentile } from "./collector";

export type PipelineMode = "naive" | "optimized";

/** Seconds measured in a recorded run, after the warm-up. */
export const RECORD_SECONDS = 30;
/** Seconds discarded at the start of a run, while the app settles. */
export const WARMUP_SECONDS = 3;

/** One second of measurements. */
export interface HudSample {
  fps: number;
  worstFrameMs: number; // longest gap between two frames in the window
  messagesPerSec: number;
  updatesPerSec: number;
  latencyP50: number;
  latencyP99: number;
  gaps: number; // gaps in this window
  gapsTotal: number; // gaps since page load
}

/** State collected while a run is being recorded. */
export interface Recording {
  tick: number; // seconds elapsed, including warm-up
  samples: HudSample[]; // measured seconds only
  latencies: number[]; // every latency from the measured seconds
  tabHidden: boolean; // true if the tab was ever hidden during the run
}

/** What the record button shows. `remaining` counts down within the current phase. */
export type RecordState =
  | { status: "idle" }
  | { status: "recording"; phase: "warmup" | "measuring"; remaining: number }
  | { status: "done"; fileName: string; tabHidden: boolean };

export type RecordingInProgress = Extract<RecordState, { status: "recording" }>;

/** Count one more second of a run: note if the tab was hidden, and keep the sample once warm-up is over. */
export function advanceRecording(run: Recording, sample: HudSample, latencies: number[], tabHidden: boolean): void {
  run.tick++;
  if (tabHidden) run.tabHidden = true;
  if (run.tick > WARMUP_SECONDS) {
    run.samples.push(sample);
    run.latencies.push(...latencies);
  }
}

/**
 * What the record button should show after `tick` whole seconds of a run, or null once the run is complete.
 * The label describes the second that is starting now: warm-up first, then a countdown from the full run length.
 */
export function recordingStateAfter(tick: number): RecordingInProgress | null {
  const measured = tick - WARMUP_SECONDS; // measured seconds completed so far (negative during warm-up)
  if (measured >= RECORD_SECONDS) return null;
  return tick < WARMUP_SECONDS
    ? { status: "recording", phase: "warmup", remaining: WARMUP_SECONDS - tick }
    : { status: "recording", phase: "measuring", remaining: RECORD_SECONDS - measured };
}

const round = (n: number, decimals = 1): number => Number(n.toFixed(decimals));
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Shape of the JSON file saved to benchmarks/results/. Bump `schema` if fields change meaning. */
export function buildResult(rec: Recording, mode: PipelineMode, session: Session | null) {
  const sorted = rec.latencies.slice().sort((a, b) => a - b);
  const fps = rec.samples.map((s) => s.fps);
  return {
    schema: 1,
    recordedAt: new Date().toISOString(),
    mode,
    build: import.meta.env.PROD ? "production" : "development",
    commit: __GIT_COMMIT__,
    load: session && {
      instruments: session.instruments,
      updatesPerSecond: session.updatesPerSecond,
      tickMs: session.tickMs,
      protocolVersion: session.v,
    },
    environment: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    warmupSeconds: WARMUP_SECONDS,
    durationSeconds: rec.samples.length,
    tabHidden: rec.tabHidden,
    summary: {
      fpsAvg: round(mean(fps)),
      fpsMin: round(Math.min(...fps)),
      worstFrameMs: round(Math.max(...rec.samples.map((s) => s.worstFrameMs))),
      messagesPerSecAvg: round(mean(rec.samples.map((s) => s.messagesPerSec))),
      updatesPerSecAvg: Math.round(mean(rec.samples.map((s) => s.updatesPerSec))),
      latencyMs: { p50: round(percentile(sorted, 0.5)), p99: round(percentile(sorted, 0.99)) },
      gaps: rec.samples.reduce((sum, s) => sum + s.gaps, 0),
    },
    samples: rec.samples.map((s) => ({
      fps: round(s.fps),
      worstFrameMs: round(s.worstFrameMs),
      messagesPerSec: round(s.messagesPerSec),
      updatesPerSec: Math.round(s.updatesPerSec),
      latencyP50: round(s.latencyP50),
      latencyP99: round(s.latencyP99),
      gaps: s.gaps,
    })),
  };
}

/** File name like 2026-11-18T14-30_naive_50k.json. */
export function resultFileName(mode: PipelineMode, session: Session | null): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
  const rate = session ? `${Math.round(session.updatesPerSecond / 1000)}k` : "unknown";
  return `${stamp}_${mode}_${rate}.json`;
}

/** Trigger a browser download of `data` as a JSON file. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
