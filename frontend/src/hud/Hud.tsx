import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useT } from "../i18n/useT";
import { decimalFormatter, integerFormatter, millisecondFormatter } from "../lib/format";
import type { Session } from "../protocol/messages";
import {
  RECORD_SECONDS,
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

type Translate = ReturnType<typeof useT>;

const NO_VALUE = "–"; // shown until the first sample arrives

/** Text for the record button: the idle prompt, the warm-up countdown, or the recording countdown. */
function recordLabel(record: RecordState, t: Translate): string {
  if (record.status !== "recording") return t("hud.record", { seconds: RECORD_SECONDS });
  const messageId = record.phase === "warmup" ? "hud.warmingUp" : "hud.recording";
  return t(messageId, { seconds: record.remaining });
}

/** Label and formatted value for each metric, in display order. */
function formatMetrics(sample: HudSample | null, locale: string, t: Translate): [string, string][] {
  const decimal = (n: number | undefined) => (n === undefined ? NO_VALUE : decimalFormatter(locale, 0).format(n));
  const milliseconds = (n: number | undefined) => (n === undefined ? NO_VALUE : millisecondFormatter(locale).format(n));
  const integer = (n: number | undefined) => (n === undefined ? NO_VALUE : integerFormatter(locale).format(n));
  return [
    [t("hud.fps"), decimal(sample?.fps)],
    [t("hud.worstFrame"), milliseconds(sample?.worstFrameMs)],
    [t("hud.messagesPerSec"), integer(sample?.messagesPerSec)],
    [t("hud.updatesPerSec"), integer(sample?.updatesPerSec)],
    [t("hud.latencyP50"), milliseconds(sample?.latencyP50)],
    [t("hud.latencyP99"), milliseconds(sample?.latencyP99)],
    [t("hud.gaps"), integer(sample?.gapsTotal)],
  ];
}

/** Announces, once, that a run finished and where the file went. Kept in the page even when empty so the announcement is read. */
function RecordNote({ record }: { record: RecordState }) {
  const t = useT();
  return (
    <p className="hud-note" role="status">
      {record.status === "done" && t("hud.recorded", { fileName: record.fileName })}
      {record.status === "done" && record.tabHidden && ` ${t("hud.tabHiddenWarning")}`}
    </p>
  );
}

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
  const recording = useRef<Recording | null>(null);

  // Runs once a second with the newest sample; while a run is recording it counts the second and saves the file at the end.
  useHudSampler((next, latencies) => {
    setSample(next);
    const run = recording.current;
    if (!run) return;

    advanceRecording(run, next, latencies, document.hidden);
    const progress = recordingStateAfter(run.tick);
    if (progress) {
      setRecord(progress);
      return;
    }
    const fileName = resultFileName(mode, session);
    downloadJson(fileName, buildResult(run, mode, session));
    recording.current = null;
    setRecord({ status: "done", fileName, tabHidden: run.tabHidden });
  });

  const startRecording = () => {
    recording.current = { tick: 0, samples: [], latencies: [], tabHidden: false };
    setRecord({ status: "recording", phase: "warmup", remaining: WARMUP_SECONDS });
  };

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
          {recordLabel(record, t)}
        </button>
      </div>

      {/* Numbers change every second, so this is deliberately not a live region. */}
      <dl className="hud-metrics">
        {formatMetrics(sample, intl.locale, t).map(([label, value]) => (
          <div className="hud-metric" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {!import.meta.env.PROD && <p className="hud-note hud-warning">{t("hud.devWarning")}</p>}
      <RecordNote record={record} />
    </section>
  );
}
