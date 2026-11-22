import {
  decimalFormatter,
  integerFormatter,
  millisecondFormatter,
  percentFormatter,
  priceFormatter,
  rangeTimeFormatter,
  timeFormatter,
  timeZoneName,
} from "../../../src/lib/format";

describe("format helpers", () => {
  it("formats a price with exactly the decimals of its instrument", () => {
    expect(priceFormatter("en-US", 2).format(1234.5)).to.equal("1,234.50");
    expect(priceFormatter("en-US", 3).format(1.5)).to.equal("1.500");
    expect(priceFormatter("en-US", 4).format(1.28)).to.equal("1.2800");
    expect(priceFormatter("en-US", 0).format(47213)).to.equal("47,213");
  });

  it("reuses the same formatter for the same locale and settings", () => {
    expect(integerFormatter("en-US")).to.equal(integerFormatter("en-US"));
    expect(priceFormatter("en-US", 2)).to.equal(priceFormatter("en-US", 2));
    expect(percentFormatter("en-US")).to.equal(percentFormatter("en-US"));
    expect(millisecondFormatter("en-US")).to.equal(millisecondFormatter("en-US"));
  });

  it("builds separate formatters for different decimals and different locales", () => {
    expect(priceFormatter("en-US", 2)).not.to.equal(priceFormatter("en-US", 3));
    expect(integerFormatter("en-US")).not.to.equal(integerFormatter("de-DE"));
  });

  it("shares one formatter between prices and plain decimals, since they are the same thing", () => {
    expect(priceFormatter("en-US", 2)).to.equal(decimalFormatter("en-US", 2));
  });

  it("follows each locale's grouping and decimal marks", () => {
    expect(integerFormatter("en-US").format(1234567)).to.equal("1,234,567");
    expect(integerFormatter("de-DE").format(1234567)).to.equal("1.234.567");
    expect(decimalFormatter("de-DE", 2).format(1234.5)).to.equal("1.234,50");
    expect(priceFormatter("de-DE", 3).format(145.67)).to.equal("145,670");
  });

  it("rounds whole numbers", () => {
    expect(integerFormatter("en-US").format(1234.6)).to.equal("1,235");
  });

  it("formats a fixed number of decimals", () => {
    expect(decimalFormatter("en-US", 0).format(59.6)).to.equal("60");
    expect(decimalFormatter("en-US", 2).format(1)).to.equal("1.00");
  });

  it("formats milliseconds with a localized unit", () => {
    expect(millisecondFormatter("en-US").format(4.2)).to.equal("4.2 ms");
    expect(millisecondFormatter("de-DE").format(4.2)).to.equal("4,2 ms"); // decimal comma
  });

  it("formats a change as a signed percentage with two decimals", () => {
    expect(percentFormatter("en-US").format(0.0042)).to.equal("+0.42%");
    expect(percentFormatter("en-US").format(-0.0102)).to.equal("-1.02%");
    expect(percentFormatter("en-US").format(0.12345)).to.equal("+12.35%");
  });

  it("shows no sign for no change", () => {
    expect(percentFormatter("en-US").format(0)).to.equal("0.00%");
  });

  it("follows the locale for percentages too", () => {
    expect(percentFormatter("ja-JP").format(0.0042)).to.equal("+0.42%");
    expect(percentFormatter("de-DE").format(0.0042)).to.include("0,42");
  });

  describe("rangeTimeFormatter", () => {
    const noon = Date.UTC(2026, 10, 21, 12, 0, 0); // midday UTC: the same calendar day almost everywhere

    it("writes a month range as a day and month in the language's own order", () => {
      expect(rangeTimeFormatter("en-US", "1m", "axis").format(noon)).to.match(/^[A-Z][a-z]{2} \d{1,2}$/); // Nov 21
      expect(rangeTimeFormatter("en-GB", "1m", "axis").format(noon)).to.match(/^\d{1,2} [A-Z][a-z]{2}$/); // 21 Nov
      expect(rangeTimeFormatter("ja-JP", "1m", "axis").format(noon)).to.match(/^\d{1,2}月\d{1,2}日$/); // 11月21日
    });

    it("writes the year so far the same way, and a year by month and year", () => {
      expect(rangeTimeFormatter("en-US", "ytd", "axis").format(noon)).to.match(/^[A-Z][a-z]{2} \d{1,2}$/);
      expect(rangeTimeFormatter("en-US", "1y", "axis").format(noon)).to.match(/^[A-Z][a-z]{2} 2026$/);
      expect(rangeTimeFormatter("en-GB", "1y", "axis").format(noon)).to.match(/^[A-Z][a-z]{2} 2026$/);
      expect(rangeTimeFormatter("ja-JP", "1y", "axis").format(noon)).to.match(/^2026年\d{1,2}月$/);
    });

    it("writes the longest range by year alone", () => {
      expect(rangeTimeFormatter("en-US", "max", "axis").format(noon)).to.equal("2026");
      expect(rangeTimeFormatter("ja-JP", "max", "axis").format(noon)).to.equal("2026年");
    });

    it("writes a day by weekday and time, on a 12-hour clock in US English and a 24-hour clock in UK English and Japanese", () => {
      expect(rangeTimeFormatter("en-US", "1d", "axis").format(noon)).to.match(/\d{1,2}:\d{2}\s?(AM|PM)/);
      expect(rangeTimeFormatter("en-GB", "1d", "axis").format(noon)).to.match(/^[A-Z][a-z]{2} \d{2}:\d{2}$/);
      expect(rangeTimeFormatter("ja-JP", "1d", "axis").format(noon)).to.match(/\d{1,2}:\d{2}/); // the weekday follows the time in Japanese
      expect(rangeTimeFormatter("ja-JP", "1d", "axis").format(noon)).not.to.match(/AM|PM|午前|午後/);
    });

    it("writes the five-minute range with seconds, as before", () => {
      expect(rangeTimeFormatter("en-GB", "5m", "axis").format(noon)).to.match(/^\d{2}:\d{2}:\d{2}$/);
      expect(rangeTimeFormatter("en-GB", "5m", "hover").format(noon)).to.match(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("gives the hover label of a longer range the full date, with the year, in the language's order", () => {
      expect(rangeTimeFormatter("en-US", "1y", "hover").format(noon)).to.match(/^[A-Z][a-z]{2} \d{1,2}, 2026$/);
      expect(rangeTimeFormatter("en-GB", "1y", "hover").format(noon)).to.match(/^\d{1,2} [A-Z][a-z]{2} 2026$/);
      expect(rangeTimeFormatter("ja-JP", "max", "hover").format(noon)).to.match(/^2026\/\d{1,2}\/\d{1,2}$/); // Japanese writes a medium date year first, with slashes
    });

    it("gives the hover label of one day the date and the time", () => {
      expect(rangeTimeFormatter("en-US", "1d", "hover").format(noon)).to.match(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s?(AM|PM)$/);
    });

    it("reuses a formatter instead of building one each time", () => {
      expect(rangeTimeFormatter("en-US", "1m", "axis")).to.equal(rangeTimeFormatter("en-US", "1m", "axis"));
      expect(rangeTimeFormatter("en-US", "1m", "axis")).not.to.equal(rangeTimeFormatter("en-US", "1m", "hover"));
    });
  });

  describe("times on a market's own clock", () => {
    const wednesday = Date.UTC(2026, 10, 18, 15, 0, 0); // 10:00:00 in New York (winter time), midnight-plus-noon... 00:00 next day in Tokyo

    it("writes a time of day on the time zone given, not on the browser's", () => {
      expect(timeFormatter("en-US", "America/New_York").format(wednesday)).to.equal("10:00:00 AM");
      expect(timeFormatter("en-GB", "America/New_York").format(wednesday)).to.equal("10:00:00");
      expect(timeFormatter("en-US", "Asia/Tokyo").format(wednesday)).to.equal("12:00:00 AM");
      expect(timeFormatter("en-GB", "Europe/Berlin").format(wednesday)).to.equal("16:00:00");
    });

    it("keeps a formatter for a zone apart from the browser's and from other zones", () => {
      expect(timeFormatter("en-US", "America/New_York")).to.equal(timeFormatter("en-US", "America/New_York"));
      expect(timeFormatter("en-US", "America/New_York")).not.to.equal(timeFormatter("en-US", "Asia/Tokyo"));
      expect(timeFormatter("en-US", "America/New_York")).not.to.equal(timeFormatter("en-US"));
    });

    it("still writes the browser's own clock when no zone is given", () => {
      expect(timeFormatter("en-GB").format(wednesday)).to.match(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("names a time zone the way the language writes it", () => {
      expect(timeZoneName("en-US", "America/New_York")).to.match(/^E[SD]T$/);
      expect(timeZoneName("en-US", "UTC")).to.equal("UTC");
      expect(timeZoneName("en-US", "Asia/Tokyo").length).to.be.greaterThan(0);
    });

    it("writes a one-day axis and hover label on the market's clock, the hover naming the zone", () => {
      expect(rangeTimeFormatter("en-US", "1d", "axis", "America/New_York").format(wednesday)).to.match(/^Wed 10:00 AM$/);
      expect(rangeTimeFormatter("en-US", "1d", "axis", "Asia/Tokyo").format(wednesday)).to.match(/^Thu 12:00 AM$/);
      expect(rangeTimeFormatter("en-US", "1d", "hover", "America/New_York").format(wednesday)).to.match(/E[SD]T$/);
      expect(rangeTimeFormatter("en-US", "1d", "axis", "America/New_York").format(wednesday)).not.to.match(/E[SD]T/); // only the hover names it
    });

    it("keeps the same format for different zones apart", () => {
      expect(rangeTimeFormatter("en-US", "1d", "axis", "America/New_York")).not.to.equal(rangeTimeFormatter("en-US", "1d", "axis", "Asia/Tokyo"));
      expect(rangeTimeFormatter("en-US", "1d", "axis", "America/New_York")).to.equal(rangeTimeFormatter("en-US", "1d", "axis", "America/New_York"));
    });
  });
});
