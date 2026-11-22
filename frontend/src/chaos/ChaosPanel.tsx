import { useId, useState } from "react";
import { useT } from "../i18n/useT";
import type { ChaosAction } from "../protocol/messages";

/** The most the server accepts for each argument, and what the box starts with. */
export const BURST = { min: 1, max: 60, start: 5 };
export const LATENCY = { min: 0, max: 5000, start: 500 };

/** The unit of the number some faults take, shown in what was sent. */
const UNITS: Partial<Record<ChaosAction, string>> = { burst: "s", latency: "ms" };

interface Limits {
  min: number;
  max: number;
  start: number;
}

const clamp = (value: number, { min, max, start }: Limits): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : start;

interface ChaosPanelProps {
  /** Controls only work while the connection is live. */
  connected: boolean;
  onSend: (action: ChaosAction, value?: number) => void;
}

interface RowProps {
  action: ChaosAction;
  disabled: boolean;
  onPress: () => void;
  /** Extra control (a number box) shown beside the button. */
  children?: React.ReactNode;
}

/** One fault: its button, what it does, and (for burst and latency) the number it takes. */
function Row({ action, disabled, onPress, children }: RowProps) {
  const t = useT();
  const helpId = useId();
  return (
    <li className="chaos-row">
      <button type="button" disabled={disabled} aria-describedby={helpId} onClick={onPress}>
        {t(`chaos.${action}.label`)}
      </button>
      {children}
      <span id={helpId} className="chaos-help">
        {t(`chaos.${action}.help`)}
      </span>
    </li>
  );
}

/**
 * A number box with its label, for the faults that take a size. Typing past the largest allowed value stops at it (a
 * browser's own max only marks the box invalid), and leaving the box puts an empty or too small value back in range.
 */
function NumberBox({ label, value, onChange, limits }: { label: string; value: string; onChange: (text: string) => void; limits: Limits }) {
  const id = useId();
  const onType = (text: string) => onChange(Number(text) > limits.max ? String(limits.max) : text);
  return (
    <span className="chaos-number">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={limits.min}
        max={limits.max}
        step={1}
        value={value}
        onChange={(event) => onType(event.target.value)}
        onBlur={() => onChange(String(clamp(Number(value), limits)))}
      />
    </span>
  );
}

/**
 * Buttons that make the server misbehave on purpose (the same commands as `npm run chaos`), to show how the page copes:
 * a frozen feed, a lost frame, a dropped connection, a burst, a delay. They affect every client connected to the server.
 * Kept closed until wanted, as a disclosure, so it stays out of the way.
 */
export function ChaosPanel({ connected, onSend }: ChaosPanelProps) {
  const t = useT();
  const [burst, setBurst] = useState(String(BURST.start));
  const [latency, setLatency] = useState(String(LATENCY.start));
  const [sent, setSent] = useState("");

  const send = (action: ChaosAction, value?: number) => {
    onSend(action, value);
    const unit = UNITS[action];
    const detail = unit ? ` (${value} ${unit})` : "";
    setSent(t("chaos.sent", { what: t(`chaos.${action}.label`) + detail }));
  };

  return (
    <details className="chaos">
      <summary>{t("chaos.title")}</summary>
      <p className="chaos-note">{t("chaos.note")}</p>
      {!connected && <p className="chaos-note">{t("chaos.needsConnection")}</p>}
      <ul className="chaos-list">
        <Row action="pause" disabled={!connected} onPress={() => send("pause")} />
        <Row action="resume" disabled={!connected} onPress={() => send("resume")} />
        <Row action="gap" disabled={!connected} onPress={() => send("gap")} />
        <Row action="drop" disabled={!connected} onPress={() => send("drop")} />
        <Row action="burst" disabled={!connected} onPress={() => send("burst", clamp(Number(burst), BURST))}>
          <NumberBox label={t("chaos.burst.value")} value={burst} onChange={setBurst} limits={BURST} />
        </Row>
        <Row action="latency" disabled={!connected} onPress={() => send("latency", clamp(Number(latency), LATENCY))}>
          <NumberBox label={t("chaos.latency.value")} value={latency} onChange={setLatency} limits={LATENCY} />
        </Row>
        <Row action="reset" disabled={!connected} onPress={() => send("reset")} />
      </ul>
      <p className="chaos-sent" role="status">
        {sent}
      </p>
    </details>
  );
}
