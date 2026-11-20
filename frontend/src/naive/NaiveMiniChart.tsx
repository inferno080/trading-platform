import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";
import { readChartColors } from "../chart/drawChart";
import { useCanvasSize, useThemeVersion } from "../chart/hooks";
import { chartLabel } from "../chart/label";
import { drawSparkline, sparkCaption } from "../chart/sparkline";
import { MiniChartSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";

/**
 * DELIBERATELY NAIVE, like the big chart: the data is React state that changes on every update of the symbol, so this
 * re-renders and redraws for every tick, on the page's own thread.
 */
export function NaiveMiniChart({ symbol, decimals, data }: { symbol: string; decimals: number; data: number[] | undefined }) {
  const t = useT();
  const { locale } = useIntl();
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const themeVersion = useThemeVersion();

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !data || size.width === 0) return;
    drawSparkline(context, data, size, readChartColors());
  }, [data, size, themeVersion]);

  const caption = sparkCaption(data, decimals, locale);
  return (
    <div className="mini-chart">
      <span className="mini-caption" data-direction={caption?.direction ?? 0}>
        {caption?.text}
      </span>
      <div className="mini-area">
        <canvas ref={canvas} className="mini-canvas" role="img" aria-label={chartLabel(t, symbol, data ?? null, decimals, locale)} data-ready={data !== undefined} />
        {data === undefined && (
          <div className="chart-overlay" role="status">
            <span className="visually-hidden">{t("chart.loading")}</span>
            <MiniChartSkeleton />
          </div>
        )}
      </div>
    </div>
  );
}
