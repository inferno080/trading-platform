import { useRef, useState } from "react";
import type { Session } from "../protocol/messages";
import {
  WARMUP_SECONDS,
  advanceRecording,
  buildResult,
  downloadJson,
  recordingStateAfter,
  resultFileName,
  type HudSample,
  type PipelineMode,
  type RecordState,
  type Recording,
} from "./recorder";
import { useHudSampler } from "./useHudSampler";

/** What the performance panel and the record button share: the newest sample, and where a recording is. */
export interface HudState {
  sample: HudSample | null;
  record: RecordState;
  /** A run needs a session (its file is named after it). */
  canRecord: boolean;
  startRecording: () => void;
}

/**
 * Samples the performance numbers once a second, and records a run on request. It lives in the page, apart from the panel
 * and the button, so the numbers keep being sampled (and a run keeps recording) while the panel is collapsed, and the
 * button can sit anywhere on the page.
 */
export function useHud(session: Session | null, mode: PipelineMode, refreshSeconds: number | null = null): HudState {
  const [sample, setSample] = useState<HudSample | null>(null);
  const [record, setRecord] = useState<RecordState>({ status: "idle" });
  const recording = useRef<Recording | null>(null);

  // Runs once a second with the newest sample; while a run is recording it counts the second and saves the file at the end.
  useHudSampler((next, latencies) => {
    setSample(next);
    const run = recording.current;
    if (!run) return;

    advanceRecording(run, next, latencies, document.hidden, refreshSeconds);
    const progress = recordingStateAfter(run.tick);
    if (progress) {
      setRecord(progress);
      return;
    }
    const fileName = resultFileName(mode, session);
    downloadJson(fileName, buildResult(run, mode, session));
    recording.current = null;
    setRecord({ status: "done", fileName, tabHidden: run.tabHidden, refreshChanged: run.refreshChanged });
  });

  const startRecording = () => {
    recording.current = { tick: 0, samples: [], latencies: [], tabHidden: false, refreshSeconds, refreshChanged: false };
    setRecord({ status: "recording", phase: "warmup", remaining: WARMUP_SECONDS });
  };

  return { sample, record, canRecord: session !== null, startRecording };
}
