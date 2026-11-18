import { useT } from "../i18n/useT";
import { useTheme } from "../theme/useTheme";

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** Light/dark switch. The thumb position and the sun or moon icon show the state, so color is not the only cue. */
export function ThemeSwitch() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
      className="theme-switch"
      onClick={toggle}
    >
      <span className="theme-switch-thumb">{dark ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  );
}
