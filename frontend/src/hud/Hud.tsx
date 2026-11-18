import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useT } from "../i18n/useT";
import { decimalFormatter, integerFormatter, millisecondFormatter } from "../lib/format";
import type { Session } from "../protocol/messages";
import { collector, percentile } from "./collector";
import {
  RECORD_SECONDS,
  WARMUP_SECONDS,
  buildResult,
  downloadJson,
  resultFileName,
  type HudSample,
  type PipelineMode,
  type Recording,
} from "./recorder";

type RecordState =
  | { status: "idle" }
  | { status: "recording"; phase: "warmup" | "measuring"; remaining: number } // remaining counts down within the phase
  | { status: "done"; fileName: string; tabHidden: boolean };

interface HudProps {
  session: Session | null;
  mode: PipelineMode;
}

/** Performance panel: live frame rate and feed stats, plus a button that records a run to a JSON file. */
export function Hud({ session, mode }: HudProps) {
  const intl = useIntl();
  const t = useT();
  const [sample, setSample] = useState<HudSample | null>(null);
  const [record, setRecord] = useState<RecordState>({ status: "idle" });

  // The sampling timer lives for the whole page, so it reads these through refs to avoid stale values.
  const recording = useRef<Recording | null>(null);
  const sessionRef = useRef(session);
  const modeRef = useRef(mode);
  useEffect(() => {
    sessionRef.current = session;
    modeRef.current = mode;
  }, [session, mode]);

  useEffect(() => {
    collector.reset(); // start clean: counters from a previously active tab must not leak in
    let frames = 0;
    let worstFrame = 0;
    let lastFrame = performance.now();
    let windowStart = lastFrame;

    // Count every animation frame and track the longest gap between two of them.
    let raf = requestAnimationFrame(function onFrame(now) {
      frames++;
      worstFrame = Math.max(worstFrame, now - lastFrame);
      lastFrame = now;
      raf = requestAnimationFrame(onFrame);
    });

    // Once a second, turn the counters into a sample. Rates use the real elapsed time,
    // because a busy page can delay this timer.
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = (now - windowStart) / 1000;
      const feed = collector.drain();
      const sorted = feed.latencies.slice().sort((a, b) => a - b);
      const next: HudSample = {
        fps: frames / seconds,
        worstFrameMs: worstFrame,
        messagesPerSec: feed.messages / seconds,
        updatesPerSec: feed.updates / seconds,
        latencyP50: percentile(sorted, 0.5),
        latencyP99: percentile(sorted, 0.99),
        gaps: feed.gaps,
        gapsTotal: collector.totalGaps,
      };
      frames = 0;
      worstFrame = 0;
      windowStart = now;
      setSample(next);

      const run = recording.current;
      if (!run) return;
      run.tick++;
      if (document.hidden) run.tabHidden = true;
      if (run.tick > WARMUP_SECONDS) {
        run.samples.push(next);
        run.latencies.push(...sorted);
      }
      const measured = run.tick - WARMUP_SECONDS; // seconds counted so far, once warm-up is over
      if (measured < RECORD_SECONDS) {
        // The first seconds are shown as "warming up"; the countdown then starts from the full run length.
        setRecord(
          measured < 0 || run.tick <= WARMUP_SECONDS
            ? { status: "recording", phase: "warmup", remaining: WARMUP_SECONDS - run.tick }
            : { status: "recording", phase: "measuring", remaining: RECORD_SECONDS - measured },
        );
        return;
      }
      // Run complete: save the file and go back to idle.
      const fileName = resultFileName(modeRef.current, sessionRef.current);
      downloadJson(fileName, buildResult(run, modeRef.current, sessionRef.current));
      recording.current = null;
      setRecord({ status: "done", fileName, tabHidden: run.tabHidden });
    }, 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const startRecording = () => {
    recording.current = { tick: 0, samples: [], latencies: [], tabHidden: false };
    setRecord({ status: "recording", phase: "warmup", remaining: WARMUP_SECONDS });
  };

  const fmt = (n: number | undefined, decimals: number) =>
    n === undefined ? "–" : decimalFormatter(intl.locale, decimals).format(n);
  const ms = (n: number | undefined) => (n === undefined ? "–" : millisecondFormatter(intl.locale).format(n));
  const int = (n: number | undefined) => (n === undefined ? "–" : integerFormatter(intl.locale).format(n));

  const metrics: [string, string][] = [
    [t("hud.fps"), fmt(sample?.fps, 0)],
    [t("hud.worstFrame"), ms(sample?.worstFrameMs)],
    [t("hud.messagesPerSec"), int(sample?.messagesPerSec)],
    [t("hud.updatesPerSec"), int(sample?.updatesPerSec)],
    [t("hud.latencyP50"), ms(sample?.latencyP50)],
    [t("hud.latencyP99"), ms(sample?.latencyP99)],
    [t("hud.gaps"), int(sample?.gapsTotal)],
  ];

  const isRecording = record.status === "recording";

  return (
    <section className="hud" aria-labelledby="hud-title">
      <div className="hud-header">
        <h2 id="hud-title">{t("hud.title")}</h2>
        <button
          type="button"
          className="record-button"
          data-phase={record.status === "recording" ? record.phase : undefined}
          onClick={startRecording}
          disabled={isRecording || !session}
        >
          {record.status === "recording"
            ? t(record.phase === "warmup" ? "hud.warmingUp" : "hud.recording", { seconds: record.remaining })
            : t("hud.record", { seconds: RECORD_SECONDS })}
        </button>
      </div>

      {/* Numbers change every second, so this is deliberately not a live region. */}
      <dl className="hud-metrics">
        {metrics.map(([label, value]) => (
          <div className="hud-metric" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {!import.meta.env.PROD && <p className="hud-note hud-warning">{t("hud.devWarning")}</p>}
      {/* Announced once when a run finishes. */}
      <p className="hud-note" role="status">
        {record.status === "done" && t("hud.recorded", { fileName: record.fileName })}
        {record.status === "done" && record.tabHidden && ` ${t("hud.tabHiddenWarning")}`}
      </p>
    </section>
  );
}
