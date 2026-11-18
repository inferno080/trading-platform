import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { QuotesTable } from "./QuotesTable";
import { useNaiveFeed } from "./useNaiveFeed";

/** The naive iteration: owns its own feed, so it only holds a socket open while its tab is active. */
export function NaivePage() {
  const t = useT();
  const { status, session, quotes, badVersion } = useNaiveFeed();

  return (
    <>
      {/* Status is text plus a dot, so it never relies on color alone. */}
      <span className="status" data-status={status} role="status">
        {t(`status.${status}`)}
      </span>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      <Hud session={session} mode="naive" />
      <QuotesTable quotes={quotes} pxScale={session?.pxScale ?? 100} />
    </>
  );
}
