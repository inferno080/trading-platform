import { Suspense } from "react";
import { PageSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import type { Iteration } from "../iterations";
import { ErrorBoundary } from "./ErrorBoundary";

// Shown when an iteration's code cannot be downloaded or fails while rendering.
function LoadError({ onReload }: { onReload: () => void }) {
  const t = useT();
  return (
    <div role="alert">
      <p>{t("error.loadView")}</p>
      <button type="button" onClick={onReload}>
        {t("error.reload")}
      </button>
    </div>
  );
}

interface IterationPanelProps {
  iteration: Iteration;
  /** Called by the Reload button; defaults to reloading the browser page. */
  onReload?: () => void;
}

/**
 * The tab panel for one iteration: its description, then its page. While the page's code downloads a
 * skeleton is shown, and if that fails an error with a Reload button, so there is never a blank page.
 */
export function IterationPanel({ iteration, onReload = () => window.location.reload() }: IterationPanelProps) {
  const t = useT();
  const { Page } = iteration;
  return (
    <div className="panel" role="tabpanel" id={`panel-${iteration.id}`} aria-labelledby={`tab-${iteration.id}`}>
      <p className="iteration-description">{t(iteration.descriptionId)}</p>
      {/* Keyed by iteration, so switching tabs clears any load error from the previous one. */}
      <ErrorBoundary key={iteration.id} fallback={<LoadError onReload={onReload} />}>
        <Suspense fallback={<PageSkeleton />}>
          <Page />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
