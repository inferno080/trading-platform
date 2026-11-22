import { useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import type { ReconnectInfo } from "../feed/reconnect";

interface ConnectionStatusProps {
  status: "connecting" | "live" | "reconnecting" | "closed" | "error";
  /** While the connection is down: which attempt is next and when it is made. */
  reconnect: ReconnectInfo | null;
  /** Try again now, without waiting for the countdown. */
  onRetry: () => void;
}

/** Whole seconds until a time, counted down while it is in the future. */
function useSecondsUntil(time: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (time === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [time]);
  return time === null ? 0 : Math.max(0, Math.ceil((time - now) / 1000));
}

/**
 * The connection's state as text plus a dot (never colour alone). While it is down, it says which attempt is next, counts
 * down to it, and offers to try at once. A screen reader hears the state and the attempt number when they change; the
 * ticking countdown is for the eyes only, so it is not read out every second.
 */
export function ConnectionStatus({ status, reconnect, onRetry }: ConnectionStatusProps) {
  const t = useT();
  const waiting = status === "reconnecting" && reconnect !== null;
  const seconds = useSecondsUntil(waiting ? reconnect.retryAt : null);
  return (
    <>
      <span className="status" data-status={status} role="status">
        {t(`status.${status}`)}
        {waiting && ` (${t("reconnect.attempt", { attempt: reconnect.attempt })})`}
      </span>
      {waiting && (
        <>
          <span className="reconnect-countdown" aria-hidden="true">
            {t("reconnect.countdown", { seconds })}
          </span>
          <button type="button" onClick={onRetry}>
            {t("reconnect.retryNow")}
          </button>
        </>
      )}
    </>
  );
}
