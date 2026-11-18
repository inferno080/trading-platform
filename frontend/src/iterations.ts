import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** One version of the frontend, shown as a tab. */
export interface Iteration {
  id: string; // used in the URL hash, e.g. #/naive
  labelId: string; // i18n message id for the tab label
  descriptionId: string; // i18n message id for the one-line description under the tabs
  Page: LazyExoticComponent<ComponentType>;
}

/**
 * All iterations, in tab order. To add one, build its page and add an entry here.
 * Pages are loaded with dynamic imports, so each iteration's code (and heavy libraries such as a
 * grid) is only downloaded when its tab is opened, and never inflates another iteration's bundle.
 */
export const ITERATIONS: Iteration[] = [
  {
    id: "naive",
    labelId: "tab.naive",
    descriptionId: "tab.naive.description",
    Page: lazy(() => import("./naive/NaivePage").then((m) => ({ default: m.NaivePage }))),
  },
];

export const ITERATION_IDS: readonly string[] = ITERATIONS.map((i) => i.id);
export const DEFAULT_ITERATION_ID = ITERATIONS[0]!.id;
