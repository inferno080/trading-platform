import { useId } from "react";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

/** One placeholder bar. Numbers are pixels; strings can be percentages of the SVG width. */
export interface Bar {
  x: number | string;
  y: number;
  width: number | string;
  height: number;
  rx?: number; // corner radius, default 4
}

interface SkeletonSvgProps {
  height: number;
  bars: Bar[];
}

/**
 * Placeholder shapes with a shimmer sweep: each bar is filled with a gradient whose bright band
 * slides across it. Purely decorative, so it is hidden from assistive technology; the parent
 * provides the accessible "Loading" text. The sweep is switched off for users who prefer reduced motion.
 */
export function SkeletonSvg({ height, bars }: SkeletonSvgProps) {
  const reduceMotion = usePrefersReducedMotion();
  // useId returns ids with colons, which are awkward inside url(#...), so strip them.
  const gradientId = `skeleton-${useId().replace(/:/g, "")}`;

  return (
    <svg className="skeleton" width="100%" height={height} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--skeleton-base)" }} />
          <stop offset="0.4" style={{ stopColor: "var(--skeleton-base)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--skeleton-highlight)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--skeleton-base)" }} />
          <stop offset="1" style={{ stopColor: "var(--skeleton-base)" }} />
          {/* Slides the gradient across each bar, from off the left edge to off the right edge. */}
          {!reduceMotion && (
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1 0"
              to="1 0"
              dur="1.5s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
      </defs>
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={bar.rx ?? 4}
          fill={`url(#${gradientId})`}
        />
      ))}
    </svg>
  );
}
