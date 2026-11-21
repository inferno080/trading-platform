import type { RfqAccept, RfqQuote, RfqReject, RfqRequest, RfqResult, Side } from "../protocol/messages.js";

/** Every this many shares in a request make the dealer's price one tick worse than the screen's: a big size costs more. */
const QUANTITY_PER_TICK = 5000;
/** The most ticks a size can add to the price. */
const MAX_IMPACT_TICKS = 50;
/** How many finished requests are remembered per client, so asking about one again gets the same answer. */
const REMEMBERED = 20;

export interface RfqSettings {
  validMs: number;
  maxQuantity: number;
  thinkMs: number;
  maxOpen: number;
}

/** What the desk needs to know about the market: the best bid, ask and tick of an instrument, or null if there is none. */
export type ScreenOf = (id: number) => { bid: number; ask: number; tick: number } | null;

interface OpenQuote {
  quote: RfqQuote;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

/** The price a dealer asks for a size: the screen price, moved against the client by one tick per 5,000 shares. */
export function priceFor(side: Side, screen: { bid: number; ask: number; tick: number }, quantity: number): number {
  const impact = Math.min(MAX_IMPACT_TICKS, Math.floor(quantity / QUANTITY_PER_TICK)) * screen.tick;
  return side === "buy" ? screen.ask + impact : Math.max(screen.tick, screen.bid - impact);
}

/**
 * A simulated dealer, who answers requests for quotes. For each client it tracks the requests it is thinking about, the
 * quotes it is holding open, and the ones that have ended, and it guarantees that a request ends exactly once: a quote can
 * be accepted once (the trade), and asking again about an ended request just repeats its result.
 *
 * It knows nothing about sockets: the way to send a message to a client is handed to it, and a client is just a key.
 */
export class RfqDesk<Client extends object> {
  private readonly open = new Map<Client, Map<number, OpenQuote>>(); // quotes being held, by request
  private readonly thinking = new Map<Client, Map<number, ReturnType<typeof setTimeout>>>(); // requests waiting for a quote
  private readonly ended = new Map<Client, Map<number, RfqResult>>(); // how finished requests ended
  private tradeCount = 0;

  constructor(
    private readonly settings: RfqSettings,
    private readonly screenOf: ScreenOf,
    private readonly send: (client: Client, message: RfqQuote | RfqResult) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** A client asks for a price. Bad requests are declined at once; otherwise the dealer "thinks" for a moment, then quotes. */
  request(client: Client, request: RfqRequest): void {
    const { ref, id, side, quantity } = request;
    const known = this.knownResult(client, ref);
    if (known) return this.send(client, known); // the same request again: the same answer
    if (this.open.get(client)?.has(ref) || this.thinking.get(client)?.has(ref)) return; // already on it

    if (!this.screenOf(id)) return this.end(client, { t: "rfqResult", ref, outcome: "declined", id, side, quantity, reason: "unknown-instrument" });
    if (quantity < 1 || quantity > this.settings.maxQuantity) {
      return this.end(client, { t: "rfqResult", ref, outcome: "declined", id, side, quantity, reason: "quantity" });
    }
    const busy = (this.open.get(client)?.size ?? 0) + (this.thinking.get(client)?.size ?? 0);
    if (busy >= this.settings.maxOpen) return this.end(client, { t: "rfqResult", ref, outcome: "declined", id, side, quantity, reason: "busy" });

    // The answer takes a little while, a different amount for each request, as a person or a pricing engine would.
    const delay = this.settings.thinkMs + ((ref * 137) % 800);
    const timer = setTimeout(() => this.quote(client, request), delay);
    this.of(this.thinking, client).set(ref, timer);
  }

  /** A client accepts a quote: the trade, once, if the quote is still good. */
  accept(client: Client, { ref }: RfqAccept): void {
    const held = this.open.get(client)?.get(ref);
    if (!held) return this.repeatOrUnknown(client, ref);
    this.forget(client, ref);
    const { quote } = held;
    if (this.now() > held.expiresAt) {
      return this.end(client, { t: "rfqResult", ref, outcome: "expired", id: quote.id, side: quote.side, quantity: quote.quantity });
    }
    this.end(client, {
      t: "rfqResult",
      ref,
      outcome: "filled",
      id: quote.id,
      side: quote.side,
      quantity: quote.quantity,
      price: quote.price,
      tradeId: ++this.tradeCount,
    });
  }

  /** A client turns a quote down. */
  reject(client: Client, { ref }: RfqReject): void {
    const held = this.open.get(client)?.get(ref);
    if (!held) return this.repeatOrUnknown(client, ref);
    this.forget(client, ref);
    this.end(client, { t: "rfqResult", ref, outcome: "rejected", id: held.quote.id, side: held.quote.side, quantity: held.quote.quantity });
  }

  /** A client has gone: nothing it was waiting for or holding matters any more, and no timer may outlive it. */
  release(client: Client): void {
    for (const held of this.open.get(client)?.values() ?? []) clearTimeout(held.timer);
    for (const timer of this.thinking.get(client)?.values() ?? []) clearTimeout(timer);
    this.open.delete(client);
    this.thinking.delete(client);
    this.ended.delete(client);
  }

  private quote(client: Client, { ref, id, side, quantity }: RfqRequest): void {
    this.thinking.get(client)?.delete(ref);
    const screen = this.screenOf(id);
    if (!screen) return this.end(client, { t: "rfqResult", ref, outcome: "declined", id, side, quantity, reason: "unknown-instrument" });
    const quote: RfqQuote = {
      t: "rfqQuote",
      ref,
      id,
      side,
      quantity,
      price: priceFor(side, screen, quantity),
      screenPrice: side === "buy" ? screen.ask : screen.bid,
      validForMs: this.settings.validMs,
    };
    const timer = setTimeout(() => this.expire(client, ref), this.settings.validMs);
    this.of(this.open, client).set(ref, { quote, expiresAt: this.now() + this.settings.validMs, timer });
    this.send(client, quote);
  }

  private expire(client: Client, ref: number): void {
    const held = this.open.get(client)?.get(ref);
    if (!held) return;
    this.forget(client, ref);
    this.end(client, { t: "rfqResult", ref, outcome: "expired", id: held.quote.id, side: held.quote.side, quantity: held.quote.quantity });
  }

  /** The request is over: remember how, and tell the client. */
  private end(client: Client, result: RfqResult): void {
    const ended = this.of(this.ended, client);
    ended.set(result.ref, result);
    if (ended.size > REMEMBERED) ended.delete(ended.keys().next().value!); // the oldest goes
    this.send(client, result);
  }

  private forget(client: Client, ref: number): void {
    const held = this.open.get(client)?.get(ref);
    if (held) clearTimeout(held.timer);
    this.open.get(client)?.delete(ref);
  }

  private knownResult(client: Client, ref: number): RfqResult | undefined {
    return this.ended.get(client)?.get(ref);
  }

  private repeatOrUnknown(client: Client, ref: number): void {
    this.send(client, this.knownResult(client, ref) ?? { t: "rfqResult", ref, outcome: "unknown" });
  }

  private of<Value>(map: Map<Client, Map<number, Value>>, client: Client): Map<number, Value> {
    let inner = map.get(client);
    if (!inner) {
      inner = new Map();
      map.set(client, inner);
    }
    return inner;
  }
}
