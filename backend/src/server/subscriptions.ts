/** What happened to a request to subscribe. */
type SubscribeResult = "subscribed" | "already-subscribed" | "limit" | "unknown-instrument";

/**
 * Who is watching which instrument. A client subscribes to the instruments it wants detail for (up to a limit), and
 * the server needs two answers fast: which instruments does anyone watch (checked for every update), and who
 * watches this one (to send it to them). It knows nothing about sockets beyond using them as keys.
 */
export class Subscriptions<Client extends object> {
  private readonly byClient = new Map<Client, Set<number>>();
  private readonly byInstrument = new Map<number, Set<Client>>();

  constructor(
    private readonly instrumentCount: number,
    private readonly maxPerClient: number,
  ) {}

  subscribe(client: Client, id: number): SubscribeResult {
    if (id < 0 || id >= this.instrumentCount) return "unknown-instrument";
    const mine = this.byClient.get(client) ?? new Set<number>();
    if (mine.has(id)) return "already-subscribed";
    if (mine.size >= this.maxPerClient) return "limit";
    mine.add(id);
    this.byClient.set(client, mine);
    const watchers = this.byInstrument.get(id) ?? new Set<Client>();
    watchers.add(client);
    this.byInstrument.set(id, watchers);
    return "subscribed";
  }

  /** Returns true if the client was subscribed to it. */
  unsubscribe(client: Client, id: number): boolean {
    const mine = this.byClient.get(client);
    if (!mine?.delete(id)) return false;
    if (mine.size === 0) this.byClient.delete(client);
    const watchers = this.byInstrument.get(id);
    watchers?.delete(client);
    if (watchers?.size === 0) this.byInstrument.delete(id);
    return true;
  }

  /** Remove everything a client watched (it disconnected). Returns those instruments, some of which nobody watches any more. */
  release(client: Client): number[] {
    const ids = [...(this.byClient.get(client) ?? [])];
    for (const id of ids) this.unsubscribe(client, id);
    return ids;
  }

  /** Does anyone watch this instrument? */
  isWatched(id: number): boolean {
    return this.byInstrument.has(id);
  }

  /** Does anyone watch anything? */
  get any(): boolean {
    return this.byInstrument.size > 0;
  }

  /** The clients watching this instrument. */
  watchers(id: number): ReadonlySet<Client> {
    return this.byInstrument.get(id) ?? new Set<Client>();
  }
}
