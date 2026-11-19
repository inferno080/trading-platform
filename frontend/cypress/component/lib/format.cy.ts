import {
  decimalFormatter,
  integerFormatter,
  millisecondFormatter,
  percentFormatter,
  priceFormatter,
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
});
