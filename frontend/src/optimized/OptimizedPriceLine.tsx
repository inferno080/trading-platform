import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { priceSummary } from "../chart/price";
import { PriceLine } from "../components/PriceLine";
import type { FeedStore } from "./feedStore";

interface OptimizedPriceLineProps {
  store: FeedStore;
  id: number;
  decimals: number;
  prevClose: number;
  variant: "big" | "small";
  /** The same refresh interval as everything else on screen. */
  refreshMs: number;
}

/**
 * The price and its move, read from the store. Only this tiny component re-renders, at most once per refresh interval
 * (every change at 0).
 */
export function OptimizedPriceLine({ store, id, decimals, prevClose, variant, refreshMs }: OptimizedPriceLineProps) {
  const { locale } = useIntl();
  const [data, setData] = useState(store.chart(id));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shownAt = -Infinity;
    const show = () => {
      timer = undefined;
      shownAt = performance.now();
      setData(store.chart(id));
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
  }, [store, id, refreshMs]);

  return <PriceLine summary={priceSummary(data, decimals, prevClose, locale)} variant={variant} />;
}
