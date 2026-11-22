import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { priceSummary } from "../chart/price";
import { baselineFor, LIVE_RANGE, type HistoryRange } from "../chart/range";
import { PriceLine } from "../components/PriceLine";
import type { FeedStore } from "./feedStore";

interface OptimizedPriceLineProps {
  store: FeedStore;
  id: number;
  decimals: number;
  prevClose: number;
  variant: "big" | "small";
  /** How far back the change is measured (since the previous close when absent). */
  range?: HistoryRange;
  /** The same refresh interval as everything else on screen. */
  refreshMs: number;
}

/**
 * The price and its move, read from the store. Only this tiny component re-renders, at most once per refresh interval
 * (every change at 0).
 */
export function OptimizedPriceLine({ store, id, decimals, prevClose, variant, range = LIVE_RANGE, refreshMs }: OptimizedPriceLineProps) {
  const { locale } = useIntl();
  const [data, setData] = useState(store.chart(id, range));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shownAt = -Infinity;
    const show = () => {
      timer = undefined;
      shownAt = performance.now();
      setData(store.chart(id, range));
    };
    const soon = (delay: number) => {
      if (timer === undefined) timer = setTimeout(show, delay);
    };
    const unsubscribe = store.subscribeCharts((ids) => {
      if (ids.includes(id)) soon(refreshMs <= 0 ? 0 : Math.max(0, shownAt + refreshMs - performance.now()));
    });
    soon(0); // what is already there, when it first appears
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [store, id, range, refreshMs]);

  return <PriceLine summary={priceSummary(data, decimals, baselineFor(range, data, prevClose), locale)} variant={variant} range={range} />;
}
