import type { useT } from "../i18n/useT";
import type { Side } from "../protocol/messages";
import { MAX_QUANTITY, type RfqState } from "./machine";

/*
 * What the ticket says, as plain functions of its state: the quantity typed, the sentence for each state, how much worse than
 * the screen a quote is, and what a screen reader is told. Kept apart from the component so that it is only layout and focus.
 */

/** The quantity typed, as a whole number from 1 to the largest the dealer quotes; null if it is not one. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null; // the number input hands over plain digits (or an empty string for anything else)
  const quantity = Number(trimmed);
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

export type Translate = ReturnType<typeof useT>;
export interface Formats {
  price: (wire: number) => string;
  quantity: (quantity: number) => string;
}

/** How much worse than the screen price a quote is (zero or less means it is not worse). */
export function worseBy(request: { side: Side }, quote: { price: number; screenPrice: number }): number {
  return request.side === "buy" ? quote.price - quote.screenPrice : quote.screenPrice - quote.price;
}

function quotedText(state: Extract<RfqState, { status: "quoted" }>, t: Translate, f: Formats, symbol: string): string {
  const key = state.request.side === "buy" ? "rfq.youBuy" : "rfq.youSell";
  return t(key, { quantity: f.quantity(state.request.quantity), symbol, price: f.price(state.quote.price) });
}

function acceptedText(state: Extract<RfqState, { status: "accepted" }>, t: Translate, f: Formats, symbol: string): string {
  const key = state.request.side === "buy" ? "rfq.boughtDone" : "rfq.soldDone";
  return t(key, { quantity: f.quantity(state.request.quantity), symbol, price: f.price(state.price) });
}

/** The sentence that says where the request stands, or null when there is nothing to say yet. */
export function bodyText(state: RfqState, t: Translate, f: Formats, symbol: string): string | null {
  switch (state.status) {
    case "idle":
      return null;
    case "requesting":
      return t("rfq.requesting", { quantity: f.quantity(state.request.quantity), symbol });
    case "quoted":
      return quotedText(state, t, f, symbol);
    case "accepting":
      return t("rfq.accepting");
    case "accepted":
      return acceptedText(state, t, f, symbol);
    case "rejected":
      return t("rfq.rejected");
    case "expired":
      return t("rfq.expired");
    case "declined":
      return t(`rfq.declined.${state.reason}`, { max: MAX_QUANTITY });
    case "failed":
      return t(state.whileAccepting ? "rfq.failedAccepting" : "rfq.failed");
  }
}

/** What a screen reader is told: the whole quote when it arrives, a warning near the end, otherwise the status itself. */
export function announcementText(state: RfqState, body: string | null, low: boolean, seconds: number, t: Translate, f: Formats, symbol: string): string {
  if (state.status !== "quoted") return body ?? "";
  if (low) return t("rfq.announce.low", { seconds });
  return t(state.request.side === "buy" ? "rfq.announce.quotedBuy" : "rfq.announce.quotedSell", {
    quantity: f.quantity(state.request.quantity),
    symbol,
    price: f.price(state.quote.price),
    seconds: Math.round(state.quote.validForMs / 1000),
  });
}

