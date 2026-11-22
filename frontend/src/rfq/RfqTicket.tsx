import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useIntl } from "react-intl";
import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";
import { decimalFormatter, integerFormatter } from "../lib/format";
import type { Side } from "../protocol/messages";
import type { RfqPort } from "./bridge";
import { CountdownRing } from "./CountdownRing";
import { MAX_QUANTITY, canRequest, type RfqState } from "./machine";
import { announcementText, bodyText, parseQuantity, worseBy, type Formats } from "./ticketText";
import { useRfq } from "./useRfq";

/** The last seconds of a quote, when the countdown warns and a screen reader is told once. */
const LOW_MS = 3000;

export interface TicketProps {
  port: RfqPort;
  instrumentId: number;
  symbol: string;
  decimals: number;
}

interface QuoteProps {
  state: Extract<RfqState, { status: "quoted" }>;
  remainingMs: number;
  low: boolean;
  seconds: number;
  f: Formats;
  onAccept: () => void;
  onReject: () => void;
}

/** What is shown while a quote can be taken: how it compares with the screen, the countdown, and the two answers. */
function QuoteDetails({ state, remainingMs, low, seconds, f, onAccept, onReject }: QuoteProps) {
  const t = useT();
  const worse = worseBy(state.request, state.quote);
  return (
    <>
      <p className="rfq-detail">{worse > 0 ? t("rfq.worse", { amount: f.price(worse) }) : t("rfq.atScreen")}</p>
      <div className="rfq-countdown" data-low={low}>
        <CountdownRing remaining={remainingMs} total={state.quote.validForMs} />
        <span>{t("rfq.secondsLeft", { seconds })}</span>
      </div>
      <div className="rfq-actions">
        <button type="button" className="rfq-accept" onClick={onAccept}>
          <Icon name="plus" />
          {t("rfq.accept")}
        </button>
        <button type="button" onClick={onReject}>
          <Icon name="x" />
          {t("rfq.reject")}
        </button>
      </div>
    </>
  );
}

/** Moves focus to the status when something happens (back to the quantity once the ticket is cleared). */
function useStatusFocus(status: RfqState["status"], statusRef: RefObject<HTMLDivElement | null>, quantityRef: RefObject<HTMLInputElement | null>) {
  const previous = useRef<RfqState["status"]>("idle");
  useEffect(() => {
    if (status !== "idle") statusRef.current?.focus();
    else if (previous.current !== "idle") quantityRef.current?.focus();
    previous.current = status;
  }, [status, statusRef, quantityRef]);
}

/**
 * Asks a dealer for a price for a size (a request for quote), and lets you take it or leave it before it runs out. What
 * it shows follows one small state machine (see rfq/machine.ts), so each state has exactly the buttons that make sense.
 * The whole thing works with the keyboard: Enter sends the request, Escape turns a quote down. Focus moves to the
 * status when something happens (never onto Accept, so a stray Enter cannot trade), and the quote is read out once.
 */
export function RfqTicket({ port, instrumentId, symbol, decimals }: TicketProps) {
  const t = useT();
  const { locale } = useIntl();
  const rfq = useRfq(port, instrumentId);
  const { state } = rfq;
  const [side, setSide] = useState<Side>("buy");
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  useStatusFocus(state.status, status, quantityInput);

  // Escape turns an open quote down. It is marked as used (preventDefault), so what is around the ticket, a dialog or the
  // chart panel, does not also act on it. (A listener on the element itself, which runs before any handler further out.)
  const section = useRef<HTMLElement>(null);
  const latest = useRef(rfq);
  useEffect(() => {
    latest.current = rfq;
  });
  useEffect(() => {
    const element = section.current;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && latest.current.state.status === "quoted") {
        event.preventDefault();
        latest.current.reject();
      }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const quantity = parseQuantity(text);
    setInvalid(quantity === null);
    if (quantity !== null) rfq.request(side, quantity);
  };

  const f: Formats = {
    price: (wire) => decimalFormatter(locale, decimals).format(wire / 10 ** decimals),
    quantity: (quantity) => integerFormatter(locale).format(quantity),
  };
  const seconds = Math.ceil(rfq.remainingMs / 1000);
  const low = state.status === "quoted" && rfq.remainingMs <= LOW_MS;
  const body = bodyText(state, t, f, symbol);
  const open = canRequest(state);

  return (
    <section ref={section} className="rfq" aria-labelledby="rfq-title">
      <h3 id="rfq-title">{t("rfq.title")}</h3>
      <form className="rfq-form" onSubmit={submit} noValidate>
        <fieldset className="rfq-side" disabled={!open}>
          <legend className="visually-hidden">{t("rfq.side")}</legend>
          {(["buy", "sell"] as const).map((option) => (
            <label key={option} className={side === option ? "rfq-side-chosen" : undefined}>
              <input type="radio" name="rfq-side" value={option} checked={side === option} onChange={() => setSide(option)} />
              {t(`rfq.${option}`)}
            </label>
          ))}
        </fieldset>
        <div className="rfq-quantity">
          <label htmlFor="rfq-quantity">{t("rfq.quantity")}</label>
          <input
            id="rfq-quantity"
            ref={quantityInput}
            type="number"
            min={1}
            max={MAX_QUANTITY}
            step={1}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            disabled={!open}
            aria-invalid={invalid}
            aria-describedby={invalid ? "rfq-quantity-error" : "rfq-quantity-hint"}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <button type="submit" className="rfq-submit" disabled={!open}>
          {t("rfq.submit")}
        </button>
      </form>
      {invalid ? (
        <p id="rfq-quantity-error" className="rfq-error" role="alert">
          {t("rfq.quantityError", { max: MAX_QUANTITY })}
        </p>
      ) : (
        <p id="rfq-quantity-hint" className="rfq-hint">
          {t("rfq.quantityHint", { max: MAX_QUANTITY })}
        </p>
      )}

      {/* Where the request stands. Focus comes here when something happens; the live region below is what is read out. */}
      <div ref={status} className="rfq-status" tabIndex={-1} data-status={state.status}>
        {body && <p className="rfq-message">{body}</p>}
        {state.status === "quoted" && <QuoteDetails state={state} remainingMs={rfq.remainingMs} low={low} seconds={seconds} f={f} onAccept={rfq.accept} onReject={rfq.reject} />}
        {state.status === "accepted" && <p className="rfq-detail">{t("rfq.reference", { tradeId: state.tradeId })}</p>}
        {open && state.status !== "idle" && (
          <button type="button" className="rfq-again" onClick={rfq.reset}>
            {t(state.status === "expired" || state.status === "failed" ? "rfq.again" : "rfq.newRequest")}
          </button>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcementText(state, body, low, seconds, t, f, symbol)}
      </p>
    </section>
  );
}
