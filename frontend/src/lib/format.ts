import type { HistoryRange } from "../protocol/messages";

// Intl.NumberFormat is slow to construct, so build each distinct formatter once and reuse it. The key is a short
// string (locale plus a kind and its settings) because a table asks for a formatter thousands of times per render.
const CLOCK: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" };
const DAY_MONTH: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const FULL_DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

/** What each range shows on its axis, and in its hover label (the hover is the more exact of the two). */
const RANGE_FORMATS: Record<HistoryRange, { axis: Intl.DateTimeFormatOptions; hover: Intl.DateTimeFormatOptions }> = {
  "5m": { axis: CLOCK, hover: CLOCK },
  "1d": { axis: { weekday: "short", hour: "2-digit", minute: "2-digit" }, hover: { ...DAY_MONTH, hour: "2-digit", minute: "2-digit" } },
  "1m": { axis: DAY_MONTH, hover: FULL_DATE },
  "1y": { axis: { month: "short", year: "numeric" }, hover: FULL_DATE },
  ytd: { axis: DAY_MONTH, hover: FULL_DATE },
  max: { axis: { year: "numeric" }, hover: FULL_DATE },
};

const cache = new Map<string, Intl.NumberFormat>();

const cached = (key: string, create: () => Intl.NumberFormat): Intl.NumberFormat => {
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = create();
    cache.set(key, formatter);
  }
  return formatter;
};

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** Formats a time of day with seconds, such as "03:51:06 PM" or "15:51:06", on the browser's clock or on a time zone's (a market's). */
export const timeFormatter = (locale: string, timeZone?: string): Intl.DateTimeFormat => {
  const key = `${locale}|${timeZone ?? ""}`;
  let format = timeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", ...(timeZone ? { timeZone } : {}) });
    timeFormats.set(key, format);
  }
  return format;
};

/** The short name of a time zone as the language writes it, such as "EST": what a clock written in that zone should say it is. */
export const timeZoneName = (locale: string, timeZone: string): string =>
  new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(Date.now()).find((part) => part.type === "timeZoneName")?.value ?? timeZone;

const rangeFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * The date or time format for a chart's time axis ("axis") or its hover label ("hover") over a range, in the language's own
 * order and style: the last five minutes by time of day, a day by time, a month by day and month, a year by month and
 * year, and the longest range by year. With a time zone (the market's own), they are written on that clock. Examples (en-US / en-GB / ja-JP): "Nov 21" / "21 Nov" / "11月21日".
 */
export const rangeTimeFormatter = (locale: string, range: HistoryRange, use: "axis" | "hover", timeZone?: string): Intl.DateTimeFormat => {
  const key = `${locale}|${range}|${use}|${timeZone ?? ""}`;
  let format = rangeFormats.get(key);
  if (!format) {
    const options = { ...RANGE_FORMATS[range][use], ...(timeZone ? { timeZone } : {}) };
    if (timeZone && range === "1d" && use === "hover") options.timeZoneName = "short"; // a time on an exchange's clock says which clock
    format = new Intl.DateTimeFormat(locale, options);
    rangeFormats.set(key, format);
  }
  return format;
};

/** Formats a number with a fixed count of decimals, for example a metric or a price. */
export const decimalFormatter = (locale: string, decimals: number): Intl.NumberFormat =>
  cached(
    `${locale}|decimal|${decimals}`,
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  );

/** Formats a real price (already divided by 10^decimals) with that instrument's number of decimals. */
export const priceFormatter = (locale: string, decimals: number): Intl.NumberFormat => decimalFormatter(locale, decimals);

/** Formats a change in price with a sign (+5.65 or -5.65, and no sign for zero) and the instrument's decimals. */
export const signedDecimalFormatter = (locale: string, decimals: number): Intl.NumberFormat =>
  cached(
    `${locale}|signed|${decimals}`,
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: "exceptZero" }),
  );

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
