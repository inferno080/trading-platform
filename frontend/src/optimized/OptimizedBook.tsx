import { useEffect, useState } from "react";
import { BookPanel } from "../book/BookPanel";
import type { FeedStore } from "./feedStore";

interface OptimizedBookProps {
  store: FeedStore;
  decimals: number;
  /** The same refresh interval and Freeze as the quotes and the charts. */
  refreshMs: number;
}

/**
 * The order book and trades tape, read from the store. Only this small component re-renders, and at most once per refresh
 * interval (every change when it is 0): the page, the quotes and the charts do not render because of a tick. 
 */
export function OptimizedBook({ store, decimals, refreshMs }: OptimizedBookProps) {
  const [view, setView] = useState({ depth: store.book, tape: store.tape });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shownAt = -Infinity;
    const show = () => {
      timer = undefined;
      shownAt = performance.now();
      setView({ depth: store.book, tape: store.tape });
    };
    const soon = (delay: number) => {
      if (timer === undefined) timer = setTimeout(show, delay);
    };
    const unsubscribe = store.subscribeBook(() => {
      soon(refreshMs <= 0 ? 0 : Math.max(0, shownAt + refreshMs - performance.now()));
    });
    soon(0); // what is already there, when it first appears
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [store, refreshMs]);

  return <BookPanel depth={view.depth} tape={view.tape} decimals={decimals} />;
}
