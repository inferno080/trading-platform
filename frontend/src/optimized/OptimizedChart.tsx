import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { drawChart, readChartColors } from "../chart/drawChart";
import { useCanvasSize, useThemeVersion } from "../chart/hooks";
import { chartLabel } from "../chart/label";
import { ChartSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import type { FeedStore } from "./feedStore";

interface OptimizedChartProps {
  store: FeedStore;
  id: number;
  symbol: string;
  decimals: number;
  prevClose: number;
  unavailable: boolean;
  /** How often the chart redraws for new data, in ms (0: every frame), and whether Freeze is on. Same settings as the grid's. */
  refreshMs: number;
  frozen: boolean;
}

/** How often the description read out for the chart is refreshed. Faster would only churn the page. */
const LABEL_EVERY_MS = 1000;

/**
 * The same chart as the Naive tab's, driven differently. The data is not React state: the worker keeps the chart
 * current and sends it, the store holds it, and this draws from the store at most once per animation frame, however
 * many updates arrived, so no React render is involved in a tick.
 */
export function OptimizedChart({ store, id, symbol, decimals, prevClose, unavailable, refreshMs, frozen }: OptimizedChartProps) {
  const t = useT();
  const { locale } = useIntl();
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const themeVersion = useThemeVersion();
  const hoverX = useRef<number | null>(null);
  const shown = useRef<Float64Array | undefined>(undefined); // what was last drawn: a frozen chart redraws this, not newer data
  const schedule = useRef<() => void>(() => undefined); // draw soon, because the data changed: held to the refresh interval
  const scheduleNow = useRef<() => void>(() => undefined); // draw at the next frame, whatever the interval: for the pointer, a resize, a theme
  const [painted, setPainted] = useState(false); // the skeleton stays until the chart has really been drawn once

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drawnAt = -Infinity;
    let labelledAt = -Infinity; // so the very first drawing always describes the chart
    const draw = () => {
      frame = 0;
      const element = canvas.current;
      const context = element?.getContext("2d");
      const data = frozen ? shown.current : store.chart(id); // frozen: hold the view, even through a resize or a new theme
      if (!element || !context || !data || size.width === 0) return;
      shown.current = data;
      drawChart(context, data, { ...size, decimals, locale, hoverX: hoverX.current, prevClose, prevCloseLabel: t("table.prevClose") }, readChartColors());
      drawnAt = performance.now();
      setPainted(true);
      if (performance.now() - labelledAt > LABEL_EVERY_MS) {
        labelledAt = performance.now();
        element.setAttribute("aria-label", chartLabel(t, symbol, data, decimals, locale));
      }
    };
    scheduleNow.current = () => {
      if (frame === 0) frame = requestAnimationFrame(draw); // one drawing pass per frame, whatever the number of changes
    };
    schedule.current = () => {
      if (refreshMs <= 0) {
        scheduleNow.current();
        return;
      }
      // Wait out what is left of the interval since the last drawing, then draw at the next frame.
      if (timer === undefined && frame === 0) {
        timer = setTimeout(() => {
          timer = undefined;
          scheduleNow.current();
        }, Math.max(0, drawnAt + refreshMs - performance.now()));
      }
    };
    const unsubscribe = store.subscribeCharts((ids) => {
      if (!ids.includes(id)) return; // another instrument's chart changed
      if (!frozen) schedule.current(); // frozen: the chart holds still, and catches up when unfrozen (see below)
    });
    scheduleNow.current(); // draw what is already there: after a resize, a theme change, a new language, or unfreezing
    return () => {
      unsubscribe();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [store, id, size, decimals, prevClose, locale, themeVersion, symbol, t, refreshMs, frozen]);

  return (
    <div className="chart-area">
      <canvas
        ref={canvas}
        className="chart-canvas"
        role="img"
        aria-label={symbol}
        data-ready={painted}
        onPointerMove={(event) => {
          hoverX.current = event.clientX - event.currentTarget.getBoundingClientRect().left;
          scheduleNow.current(); // the crosshair follows the pointer at once, not at the refresh interval
        }}
        onPointerLeave={() => {
          hoverX.current = null;
          scheduleNow.current();
        }}
      />
      {!painted && !unavailable && (
        <div className="chart-overlay" role="status">
          <span className="visually-hidden">{t("chart.loading")}</span>
          <ChartSkeleton />
        </div>
      )}
      {unavailable && (
        <p className="chart-overlay chart-message" role="alert">
          {t("chart.unavailable")}
        </p>
      )}
    </div>
  );
}
