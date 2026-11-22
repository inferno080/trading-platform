import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";

/** What to tell the person when the feed cannot be read: a server speaking another protocol, or reference data that never came. */
export function FeedAlerts({ badVersion, referenceMissing }: { badVersion: number | null; referenceMissing: boolean }) {
  const t = useT();
  return (
    <>
      {badVersion !== null && <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}
    </>
  );
}
