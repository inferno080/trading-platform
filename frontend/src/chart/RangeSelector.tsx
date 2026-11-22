import { useT } from "../i18n/useT";
import { CHART_RANGES, type HistoryRange } from "./range";

interface RangeSelectorProps {
  range: HistoryRange;
  onChange: (range: HistoryRange) => void;
}

/**
 * The buttons that choose how far back the chart goes: a day, a month, a year, the year so far, or the whole history. The
 * short label is what is shown; the accessible name starts with it (so what is seen is part of what is heard, WCAG 2.5.3)
 * and adds the longer name. All of them are made up by the server (the simulator
 * has no real past), so the row says so beside them.
 */
export function RangeSelector({ range, onChange }: RangeSelectorProps) {
  const t = useT();
  return (
    <div className="range-bar">
      <div className="range-buttons" role="group" aria-label={t("range.label")}>
        {CHART_RANGES.map((option) => (
          <button key={option} type="button" className="range-button" aria-pressed={range === option} aria-label={t("range.name", { short: t(`range.${option}`), long: t(`range.${option}.long`) })} onClick={() => onChange(option)}>
            {t(`range.${option}`)}
          </button>
        ))}
      </div>
      <span className="range-note">{t("range.simulated")}</span>
    </div>
  );
}
