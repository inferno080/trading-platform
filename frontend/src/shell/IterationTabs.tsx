import { useRef, type KeyboardEvent } from "react";
import { useT } from "../i18n/useT";
import type { Iteration } from "../iterations";

interface IterationTabsProps {
  iterations: Iteration[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Accessible tab bar (WAI-ARIA tabs pattern): arrow keys, Home and End move between tabs. */
export function IterationTabs({ iterations, activeId, onSelect }: IterationTabsProps) {
  const t = useT();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const ids = iterations.map((i) => i.id);
    const index = ids.indexOf(activeId);
    // In right-to-left layouts the arrow directions are mirrored.
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    let next = -1;
    if (event.key === forward) next = (index + 1) % ids.length;
    else if (event.key === backward) next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next < 0) return;

    event.preventDefault();
    const id = ids[next]!;
    onSelect(id);
    tabRefs.current.get(id)?.focus();
  };

  return (
    // The key handler lives on the tablist, as the pattern prescribes; the tabs themselves are buttons.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div className="tabs" role="tablist" aria-label={t("tabs.label")} onKeyDown={onKeyDown}>
      {iterations.map((iteration) => {
        const selected = iteration.id === activeId;
        return (
          <button
            key={iteration.id}
            ref={(el) => {
              if (el) tabRefs.current.set(iteration.id, el);
              else tabRefs.current.delete(iteration.id);
            }}
            id={`tab-${iteration.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${iteration.id}`}
            tabIndex={selected ? 0 : -1} // only the active tab is in the Tab order; arrows move between tabs
            onClick={() => onSelect(iteration.id)}
          >
            {t(iteration.labelId)}
          </button>
        );
      })}
    </div>
  );
}
