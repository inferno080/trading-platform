import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { readChartColors } from "../chart/drawChart";
import { useCanvasSize, useThemeVersion } from "../chart/hooks";
import { chartLabel } from "../chart/label";
import { drawSparkline } from "../chart/sparkline";
import { MiniChartSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import type { FeedStore } from "./feedStore";
import { OptimizedPriceLine } from "./OptimizedPriceLine";

interface OptimizedMiniChartProps {
  store: FeedStore;
  id: number;
  symbol: string;
  decimals: number;
  prevClose: number;
  /** The same refresh interval and Freeze as the quotes and the big chart. */
  refreshMs: number;
  frozen: boolean;
}

/**
 * A watchlist mini chart drawn from the store, not from React state: the canvas is drawn directly, at most once per
 * refresh interval, so a tick causes no React render of the chart. The price above it is a tiny component of its own.
 */
export function OptimizedMiniChart({ store, id, symbol, decimals, prevClose, refreshMs, frozen }: OptimizedMiniChartProps) {
  const t = useT();
  const { locale } = useIntl();
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef<Float64Array | undefined>(undefined); // what was last drawn: a frozen chart redraws this, not newer data
  const size = useCanvasSize(canvas);
  const themeVersion = useThemeVersion();
  const [painted, setPainted] = useState(false); // the skeleton stays until the chart has really been drawn once

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drawnAt = -Infinity;
    const draw = () => {
      frame = 0;
      const context = canvas.current?.getContext("2d");
      const data = frozen ? shown.current : store.chart(id); // frozen: hold the view, even through a resize or a new theme
      if (!context || !data || size.width === 0) return;
      shown.current = data;
      drawSparkline(context, data, size, readChartColors(), prevClose);
      drawnAt = performance.now();
      setPainted(true);
      canvas.current?.setAttribute("aria-label", chartLabel(t, symbol, data, decimals, locale));
    };
    const scheduleNow = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (refreshMs <= 0) {
        scheduleNow();
      } else if (timer === undefined && frame === 0) {
        timer = setTimeout(() => {
          timer = undefined;
          scheduleNow();
        }, Math.max(0, drawnAt + refreshMs - performance.now()));
      }
    };
    const unsubscribe = store.subscribeCharts((ids) => {
      if (!ids.includes(id)) return;
      if (!frozen) schedule();
    });
    scheduleNow(); // what is already there: after a resize, a theme change, a new language, or unfreezing
    return () => {
      unsubscribe();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [store, id, size, decimals, prevClose, locale, themeVersion, symbol, t, refreshMs, frozen]);

  return (
    <div className="mini-chart">
      <OptimizedPriceLine store={store} id={id} decimals={decimals} prevClose={prevClose} variant="small" refreshMs={refreshMs} frozen={frozen} />
      <div className="mini-area">
        <canvas ref={canvas} className="mini-canvas" role="img" aria-label={symbol} data-ready={painted} />
        {!painted && (
          <div className="chart-overlay" role="status">
            <span className="visually-hidden">{t("chart.loading")}</span>
            <MiniChartSkeleton />
          </div>
        )}
      </div>
    </div>
  );
}
