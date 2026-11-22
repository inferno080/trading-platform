import { useIntl } from "react-intl";
import { useT } from "../i18n/useT";
import { decimalFormatter, integerFormatter, millisecondFormatter } from "../lib/format";
import { RECORD_SECONDS, type HudSample, type RecordState } from "./recorder";
import type { HudState } from "./useHud";

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
      {record.status === "done" && record.refreshChanged && ` ${t("hud.refreshChangedWarning")}`}
    </p>
  );
}

/** A screen that refreshes less often than every change looks smoother than it is, so say so before anyone records it. */
function RefreshWarning({ seconds }: { seconds: number | null }) {
  const t = useT();
  if (!seconds) return null; // null: no such setting (Naive); 0: every change, which is the fair way to measure
  return <p className="hud-note hud-warning">{t("hud.refreshWarning", { seconds })}</p>;
}

/** The button that records a run to a JSON file. It sits in the page's toolbar; its state comes from `useHud`. */
export function RecordButton({ hud }: { hud: HudState }) {
  const t = useT();
  const { record } = hud;
  return (
    <button
      type="button"
      className="record-button"
      data-phase={record.status === "recording" ? record.phase : undefined}
      onClick={hud.startRecording}
      disabled={record.status === "recording" || !hud.canRecord}
    >
      {recordLabel(record, t)}
    </button>
  );
}

interface HudProps {
  hud: HudState;
  /** How often the display refreshes, in seconds (0 for every change), for tabs that have that setting. */
  refreshSeconds?: number | null;
}

/**
 * Performance panel: live frame rate and feed stats. It can be collapsed to its heading; the numbers are still sampled
 * while it is (see useHud). Its warnings collapse with it; the note below it, saying where a recorded run was saved, stays in
 * view, since it is announced to screen readers.
 */
export function Hud({ hud, refreshSeconds = null }: HudProps) {
  const intl = useIntl();
  const t = useT();

  return (
    <section className="hud" aria-labelledby="hud-title">
      <details open>
        <summary>
          <h2 id="hud-title">{t("hud.title")}</h2>
        </summary>
        {/* Numbers change every second, so this is deliberately not a live region. */}
        <dl className="hud-metrics">
          {formatMetrics(hud.sample, intl.locale, t).map(([label, value]) => (
            <div className="hud-metric" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {!import.meta.env.PROD && <p className="hud-note hud-warning">{t("hud.devWarning")}</p>}
        <RefreshWarning seconds={refreshSeconds} />
      </details>

      <RecordNote record={hud.record} />
    </section>
  );
}
