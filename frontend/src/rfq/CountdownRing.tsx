/** The ring that empties as a quote runs out. Decorative: the seconds are written beside it. */
export function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="rfq-ring" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, remaining / total)))}
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}

