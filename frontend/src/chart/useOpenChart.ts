import { useCallback, useState } from "react";
import { DEFAULT_RANGE, type HistoryRange } from "./range";
import { FIRST_INSTRUMENT } from "./series";

/**
 * Which instrument's chart is open and how far back it goes, for a page. The chart of the first instrument (AAA, the most
 * active) is open from the start; `userChose` is false until the person picks one, so a chart that opened by itself does
 * not take keyboard focus.
 */
export function useOpenChart() {
  const [selectedId, setSelectedId] = useState<number | null>(FIRST_INSTRUMENT);
  const [userChose, setUserChose] = useState(false);
  const [range, setRange] = useState<HistoryRange>(DEFAULT_RANGE);
  const choose = useCallback((id: number | null) => {
    setUserChose(true);
    setSelectedId(id);
  }, []);
  return { selectedId, userChose, range, setRange, choose };
}
