import { decimalFormatter, integerFormatter, millisecondFormatter, priceFormatter } from "../../../src/lib/format";

describe("format helpers", () => {
  it("formats prices with the decimals implied by the price scale", () => {
    expect(priceFormatter("en-US", 100).format(1234.5)).to.equal("1,234.50");
    expect(priceFormatter("en-US", 1000).format(1.5)).to.equal("1.500");
    expect(priceFormatter("en-US", 1).format(1234)).to.equal("1,234");
  });

  it("never uses negative decimals for a price scale below 1", () => {
    expect(priceFormatter("en-US", 0.1).format(5.4)).to.equal("5");
  });

  it("reuses the same formatter for the same locale and options", () => {
    expect(integerFormatter("en-US")).to.equal(integerFormatter("en-US"));
    expect(priceFormatter("en-US", 100)).to.equal(priceFormatter("en-US", 100));
  });

  it("builds separate formatters for different locales", () => {
    expect(integerFormatter("en-US")).not.to.equal(integerFormatter("de-DE"));
  });

  it("follows each locale's grouping and decimal marks", () => {
    expect(integerFormatter("en-US").format(1234567)).to.equal("1,234,567");
    expect(integerFormatter("de-DE").format(1234567)).to.equal("1.234.567");
    expect(decimalFormatter("de-DE", 2).format(1234.5)).to.equal("1.234,50");
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
});
