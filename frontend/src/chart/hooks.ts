import { useEffect, useMemo, useState, useSyncExternalStore, type RefObject } from "react";
import { readChartColors, type ChartColors } from "./drawChart";

interface CanvasSize {
  width: number; // CSS pixels
  height: number;
  dpr: number;
}

/**
 * The size of a canvas on the page, kept up to date, and the canvas's pixel buffer sized to match (a sharp picture on
 * high-density screens needs more pixels than CSS pixels). Setting the buffer size clears the canvas, so a redraw
 * must follow whenever the returned size changes.
 */
export function useCanvasSize(canvas: RefObject<HTMLCanvasElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const update = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: width, clientHeight: height } = element;
      // Assigning a canvas's size clears it, even to the same value, so only touch it when the size really changed. A
      // page that is resized for another reason (a scrollbar appearing, say) must not wipe a chart that was drawn.
      if (element.width !== Math.round(width * dpr)) element.width = Math.round(width * dpr);
      if (element.height !== Math.round(height * dpr)) element.height = Math.round(height * dpr);
      setSize((previous) => (previous.width === width && previous.height === height && previous.dpr === dpr ? previous : { width, height, dpr }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvas]);

  return size;
}

let themeVersion = 0;
const subscribeToTheme = (onChange: () => void) => {
  const changed = () => {
    themeVersion++;
    onChange();
  };
  const observer = new MutationObserver(changed); // the theme switch sets data-theme on <html>
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)"); // or the OS changes while no choice is saved
  media.addEventListener("change", changed);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", changed);
  };
};

/** A number that changes whenever the theme changes, so a canvas (which does not restyle itself) knows to redraw. */
export const useThemeVersion = (): number =>
  useSyncExternalStore(subscribeToTheme, () => themeVersion, () => 0);

/**
 * The colours a chart is drawn in, read from the design tokens once and again only when the theme changes, not on every
 * drawing (reading them asks the browser to work out styles, which a chart redrawn every frame should not do). The object
 * is new whenever the theme changes, so a chart that lists it in its effect redraws then.
 */
export const useChartColors = (): ChartColors => {
  const version = useThemeVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is what says the tokens changed: reading them is not a function of it
  return useMemo(() => readChartColors(), [version]);
};
