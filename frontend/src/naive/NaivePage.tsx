import { useState } from "react";
import { SymbolDetail } from "../chart/SymbolDetail";
import { Hud } from "../hud/Hud";
import { useT } from "../i18n/useT";
import { PROTOCOL_VERSION } from "../protocol/messages";
import { NaiveChart } from "./NaiveChart";
import { QuotesTable } from "./QuotesTable";
import { useNaiveFeed } from "./useNaiveFeed";

/** The naive iteration: owns its own feed, so it only holds a socket open while its tab is active. */
export function NaivePage() {
  const t = useT();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { status, session, quotes, reference, referenceMissing, badVersion, chart, chartUnavailable } = useNaiveFeed(selectedId);
  const selectedQuote = selectedId === null ? undefined : quotes[selectedId];
  const selectedInstrument = selectedId === null ? undefined : reference?.get(selectedId);

  return (
    <>
      {/* Status is text plus a dot, so it never relies on color alone. */}
      <span className="status" data-status={status} role="status">
        {t(`status.${status}`)}
      </span>
      {badVersion !== null && (
        <p role="alert">{t("error.protocol", { version: badVersion, expected: PROTOCOL_VERSION })}</p>
      )}
      {referenceMissing && <p role="alert">{t("error.referenceTimeout")}</p>}
      <Hud session={session} mode="naive" />
      {selectedQuote && selectedInstrument && (
        <SymbolDetail
          symbol={selectedQuote.sym}
          name={selectedInstrument.name}
          currency={selectedInstrument.currency}
          tickSize={selectedInstrument.tickSize}
          decimals={selectedInstrument.decimals}
          onClose={() => setSelectedId(null)}
        >
          <NaiveChart
            symbol={selectedQuote.sym}
            decimals={selectedInstrument.decimals}
            data={chart && chart.id === selectedId ? chart.data : null}
            unavailable={chartUnavailable}
          />
        </SymbolDetail>
      )}
      <QuotesTable quotes={quotes} reference={reference} selectedId={selectedId} onSelect={setSelectedId} />
    </>
  );
}
