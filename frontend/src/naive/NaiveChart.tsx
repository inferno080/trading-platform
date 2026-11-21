import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { drawChart, readChartColors } from "../chart/drawChart";
import { useCanvasSize, useThemeVersion } from "../chart/hooks";
import { chartLabel } from "../chart/label";
import { ChartSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";

interface NaiveChartProps {
  symbol: string;
  decimals: number;
  prevClose: number;
  /** The flat [time, price, ...] list, or null until the history arrives. */
  data: number[] | null;
  unavailable: boolean;
}

/**
 * DELIBERATELY NAIVE: the chart is drawn in an effect that depends on the data, and the data is React state that
 * changes on every update of the symbol, so the whole chart is redrawn for every tick on the page's own thread.
 */
export function NaiveChart({ symbol, decimals, prevClose, data, unavailable }: NaiveChartProps) {
  const t = useT();
  const { locale } = useIntl();
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const themeVersion = useThemeVersion();
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !data || size.width === 0) return;
    drawChart(context, data, { ...size, decimals, locale, hoverX, prevClose, prevCloseLabel: t("table.prevClose") }, readChartColors());
  }, [data, size, decimals, prevClose, locale, hoverX, themeVersion, t]);

  const label = chartLabel(t, symbol, data, decimals, locale); // rebuilt on every update, like everything else in this tab

  return (
    <div className="chart-area">
      <canvas
        ref={canvas}
        className="chart-canvas"
        role="img"
        aria-label={label}
        data-ready={data !== null}
        onPointerMove={(event) => setHoverX(event.clientX - event.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHoverX(null)}
      />
      {data === null && !unavailable && (
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
