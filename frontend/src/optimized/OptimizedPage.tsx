import { useIntl } from "react-intl";
import { TableSkeleton } from "../components/skeletons";
import { useT } from "../i18n/useT";
import { integerFormatter } from "../lib/format";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { useFeedWorker } from "./useFeedWorker";

const NO_VALUE = "–"; // shown until the worker has reported the fact

/** One labelled fact. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The optimized iteration, built step by step. So far a Web Worker owns the connection: this page shows its
 * status and a few facts it reported. The grid that will show the prices is still a placeholder.
 */
export function OptimizedPage() {
  const t = useT();
  const { locale } = useIntl();
  const { status, session, scope, referenceCount, referenceMissing, badVersion } = useFeedWorker();
  const integer = integerFormatter(locale);

  const reference =
    referenceCount === null ? t("optimized.reference.waiting") : t("optimized.reference.loaded", { count: referenceCount });

  return (
    <section className="optimized-page" aria-label={t("optimized.region")}>
      {/* Status is text plus a dot, so it never relies on color alone. */}
      <span className="status" data-status={status} role="status">
        {t(`status.${status}`)}
      </span>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}

      <dl className="facts">
        <Fact label={t("optimized.fact.thread")} value={scope ?? NO_VALUE} />
        <Fact label={t("optimized.fact.protocol")} value={session ? String(session.v) : NO_VALUE} />
        <Fact label={t("optimized.fact.instruments")} value={session ? integer.format(session.instruments) : NO_VALUE} />
        <Fact label={t("optimized.fact.updates")} value={session ? integer.format(session.updatesPerSecond) : NO_VALUE} />
        <Fact label={t("optimized.fact.reference")} value={reference} />
      </dl>

      <p className="hint">{t("optimized.gridSoon")}</p>
      <TableSkeleton />
    </section>
  );
}
