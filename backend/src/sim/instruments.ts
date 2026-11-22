/**
 * The simulated instruments: four groups that differ in currency, decimals and tick size, so the feed needs
 * per-instrument price scaling, like a real multi-asset market.
 */

/** One group of instruments and how its prices look. */
interface InstrumentClass {
  currency: string;
  decimals: number; // decimal places of a price; a wire price is an integer counting units of 10^-decimals
  tickSize: number; // smallest allowed price move, in real price units
  minPrice: number; // starting prices are drawn between these two (real prices, not wire integers)
  maxPrice: number;
}

export const INSTRUMENT_CLASSES: readonly InstrumentClass[] = [
  { currency: "USD", decimals: 2, tickSize: 0.01, minPrice: 5, maxPrice: 500 }, // USD equities
  { currency: "EUR", decimals: 3, tickSize: 0.005, minPrice: 5, maxPrice: 500 }, // EUR equities
  { currency: "JPY", decimals: 0, tickSize: 1, minPrice: 500, maxPrice: 50_000 }, // JPY equities
  { currency: "USD", decimals: 4, tickSize: 0.0001, minPrice: 0.5, maxPrice: 2 }, // FX-style, quoted in USD
];

/**
 * Which group an instrument belongs to, from the last digit of its id: 60% USD equities (0-5), 10% EUR (6),
 * 20% JPY (7-8), 10% FX (9). The most active instruments have the lowest ids, so they are USD equities.
 */
export const classIndexFor = (id: number): number => {
  const digit = id % 10;
  if (digit <= 5) return 0;
  if (digit === 6) return 1;
  if (digit <= 8) return 2;
  return 3;
};

// Fictional company names: a word from each list plus a legal suffix. They repeat across instruments on purpose;
// the symbol, not the name, identifies an instrument.
const FIRST_WORDS = [
  "Apex", "Beacon", "Cobalt", "Delta", "Ember", "Falcon", "Granite", "Harbor", "Ion", "Juniper", "Keystone", "Lumen",
  "Meridian", "Nimbus", "Orion", "Pioneer", "Quartz", "Redwood", "Summit", "Titan", "Umbra", "Vertex", "Willow", "Zenith",
];
const SECOND_WORDS = [
  "Systems", "Energy", "Capital", "Therapeutics", "Logistics", "Materials", "Networks", "Foods", "Mining", "Software",
  "Motors", "Holdings",
];
const EQUITY_SUFFIX: Record<number, string> = { 0: "Inc.", 1: "SE", 2: "K.K." };
const FX_PAIRS = ["EUR/USD", "GBP/USD", "AUD/USD", "NZD/USD"];
const FX_TENORS = ["Spot", "1W", "1M", "3M", "6M", "1Y"];

/** A readable name for the instrument, the same every run. */
export const nameFor = (id: number, classIndex: number): string => {
  if (classIndex === 3) {
    const n = Math.floor(id / 10); // FX instruments are every tenth id, so this counts them
    return `${FX_PAIRS[n % FX_PAIRS.length]} ${FX_TENORS[Math.floor(n / FX_PAIRS.length) % FX_TENORS.length]}`;
  }
  const first = FIRST_WORDS[(id * 7) % FIRST_WORDS.length];
  const second = SECOND_WORDS[(id * 13) % SECOND_WORDS.length];
  return `${first} ${second} ${EQUITY_SUFFIX[classIndex]}`;
};
