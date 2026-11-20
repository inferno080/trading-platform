import { useState } from "react";
import { TableSkeleton } from "../components/skeletons";
import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { QuotesGrid } from "./QuotesGrid";
import { DEFAULT_REFRESH_SECONDS, MAX_REFRESH_SECONDS, parseRefreshSeconds } from "./refresh";
import { useFeedWorker } from "./useFeedWorker";

/** The number box for how often the grid redraws. It keeps what is typed, and only passes on a valid number. */
function RefreshControl({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const t = useT();
  const [text, setText] = useState(String(seconds));

  const type = (value: string) => {
    setText(value);
    const parsed = parseRefreshSeconds(value);
    if (parsed !== null) onChange(parsed);
  };

  return (
    <div className="refresh-control">
      <label htmlFor="refresh-seconds">{t("optimized.refresh")}</label>
      <input
        id="refresh-seconds"
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_REFRESH_SECONDS}
        step={0.5}
        value={text}
        aria-describedby="refresh-hint"
        onChange={(event) => type(event.target.value)}
        onBlur={() => setText(String(seconds))} // leaving the box with something invalid puts the real value back
      />
      <span id="refresh-hint" className="refresh-hint">
        {t("optimized.refresh.hint", { max: MAX_REFRESH_SECONDS })}
      </span>
    </div>
  );
}

/**
 * The optimized iteration: a Web Worker owns the connection and conflates updates, the page pulls them once per
 * animation frame into a store, and AG Grid draws only the rows on screen, at a rate a person can read.
 */
export function OptimizedPage() {
  const t = useT();
  const [frozen, setFrozen] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_REFRESH_SECONDS);
  const { state, store } = useFeedWorker();
  const { status, session, scope, referenceCount, referenceMissing, badVersion, hasSnapshot } = state;
  const ready = hasSnapshot && referenceCount !== null;

  return (
    // The scope name proves, to the tests, that the connection runs in a worker and not in the page.
    <section className="optimized-page" aria-label={t("optimized.region")} data-worker-scope={scope ?? undefined}>
      <div className="toolbar">
        {/* Status is text plus a dot, so it never relies on color alone. */}
        <span className="status" data-status={status} role="status">
          {t(`status.${status}`)}
        </span>
        <RefreshControl seconds={refreshSeconds} onChange={setRefreshSeconds} />
        <button type="button" className="toggle-button" aria-pressed={frozen} onClick={() => setFrozen((f) => !f)}>
          {t("optimized.freeze")}
        </button>
        <span className="frozen-note" role="status">
          {frozen && t("optimized.frozen")}
        </span>
      </div>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}

      <Hud session={session} mode="optimized" refreshSeconds={refreshSeconds} />

      {ready ? (
        <QuotesGrid store={store} frozen={frozen} refreshMs={refreshSeconds * 1000} />
      ) : (
        <div role="status">
          <span className="visually-hidden">{t("table.waiting")}</span>
          <TableSkeleton />
        </div>
      )}
    </section>
  );
}
