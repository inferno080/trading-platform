// Intl.NumberFormat is slow to construct, so build each distinct formatter once and reuse it.
const cache = new Map<string, Intl.NumberFormat>();

const getFormatter = (locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    cache.set(key, formatter);
  }
  return formatter;
};

/** Formats a real price (already divided by pxScale) with the decimals implied by pxScale. */
export const priceFormatter = (locale: string, pxScale: number): Intl.NumberFormat => {
  const decimals = Math.max(0, Math.round(Math.log10(pxScale))); // pxScale 100 -> 2 decimals
  return getFormatter(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/** Formats whole numbers such as sizes and volume. */
export const integerFormatter = (locale: string): Intl.NumberFormat =>
  getFormatter(locale, { maximumFractionDigits: 0 });

/** Formats a number with a fixed count of decimals, for metrics. */
export const decimalFormatter = (locale: string, decimals: number): Intl.NumberFormat =>
  getFormatter(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Formats a duration in milliseconds with a localized unit, such as "4.2 ms". */
export const millisecondFormatter = (locale: string): Intl.NumberFormat =>
  getFormatter(locale, { style: "unit", unit: "millisecond", maximumFractionDigits: 1 });
