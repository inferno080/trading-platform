// Intl.NumberFormat is slow to construct, so build each distinct formatter once and reuse it. The key is a short
// string (locale plus a kind and its settings) because a table asks for a formatter thousands of times per render.
const cache = new Map<string, Intl.NumberFormat>();

const cached = (key: string, create: () => Intl.NumberFormat): Intl.NumberFormat => {
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = create();
    cache.set(key, formatter);
  }
  return formatter;
};

/** Formats a number with a fixed count of decimals, for example a metric or a price. */
export const decimalFormatter = (locale: string, decimals: number): Intl.NumberFormat =>
  cached(
    `${locale}|decimal|${decimals}`,
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  );

/** Formats a real price (already divided by 10^decimals) with that instrument's number of decimals. */
export const priceFormatter = (locale: string, decimals: number): Intl.NumberFormat => decimalFormatter(locale, decimals);

/** Formats whole numbers such as sizes and volume. */
export const integerFormatter = (locale: string): Intl.NumberFormat =>
  cached(`${locale}|integer`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }));

/** Formats a duration in milliseconds with a localized unit, such as "4.2 ms". */
export const millisecondFormatter = (locale: string): Intl.NumberFormat =>
  cached(
    `${locale}|millisecond`,
    () => new Intl.NumberFormat(locale, { style: "unit", unit: "millisecond", maximumFractionDigits: 1 }),
  );

/** Formats a fraction as a signed percentage with two decimals: 0.0042 becomes "+0.42%", and zero has no sign. */
export const percentFormatter = (locale: string): Intl.NumberFormat =>
  cached(
    `${locale}|percent`,
    () => new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }),
  );
