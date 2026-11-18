import { useEffect, useRef } from "react";
import { collector, percentile } from "./collector";
import type { HudSample } from "./recorder";

/**
 * Samples the page once a second: frame rate from animation frames, feed statistics from the collector.
 * Calls `onSample` with each sample and that second's latencies (sorted, ascending).
 */
export function useHudSampler(onSample: (sample: HudSample, sortedLatencies: number[]) => void): void {
  // The timer below lives as long as the component, so it reads the newest callback through a ref.
  const latest = useRef(onSample);
  useEffect(() => {
    latest.current = onSample;
  }, [onSample]);

  useEffect(() => {
    collector.reset(); // start clean: counters from a previously active tab must not leak in
    let frames = 0;
    let worstFrame = 0;
    let lastFrame = performance.now();
    let windowStart = lastFrame;

    // Count every animation frame and track the longest gap between two of them.
    let raf = requestAnimationFrame(function onFrame(now) {
      frames++;
      worstFrame = Math.max(worstFrame, now - lastFrame);
      lastFrame = now;
      raf = requestAnimationFrame(onFrame);
    });

    // Once a second, turn the counters into a sample. Rates use the real elapsed time,
    // because a busy page can delay this timer.
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = (now - windowStart) / 1000;
      const feed = collector.drain();
      const sorted = feed.latencies.slice().sort((a, b) => a - b);
      const sample: HudSample = {
        fps: frames / seconds,
        worstFrameMs: worstFrame,
        messagesPerSec: feed.messages / seconds,
        updatesPerSec: feed.updates / seconds,
        latencyP50: percentile(sorted, 0.5),
        latencyP99: percentile(sorted, 0.99),
        gaps: feed.gaps,
        gapsTotal: collector.totalGaps,
      };
      frames = 0;
      worstFrame = 0;
      windowStart = now;
      latest.current(sample, sorted);
    }, 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);
}
