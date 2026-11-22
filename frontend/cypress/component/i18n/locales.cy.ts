import enGB from "../../../src/i18n/messages/en-GB.json";
import enUS from "../../../src/i18n/messages/en-US.json";
import jaJP from "../../../src/i18n/messages/ja-JP.json";
import { DEFAULT_LOCALE, LOCALES, MESSAGES } from "../../../src/i18n/locales";

const english = enUS as Record<string, string>;
const japanese = jaJP as Record<string, string>;
const british = enGB as Record<string, string>;

// The names of the {placeholders} in a message, so translations can be checked against the English.
// A message without its {placeholders}, which may hold nested braces ({count, plural, one {...}}): the innermost go first.
const withoutPlaceholders = (text: string): string => {
  let rest = text;
  for (let before = ""; before !== rest; ) {
    before = rest;
    rest = rest.replace(/\{[^{}]*\}/g, "");
  }
  return rest;
};

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)/g)].map((match) => match[1] as string).sort();

describe("locales", () => {
  it("offers US English, UK English and Japanese, with US English as the default", () => {
    expect(LOCALES.map((l) => l.code)).to.deep.equal(["en-US", "en-GB", "ja-JP"]);
    expect(DEFAULT_LOCALE).to.equal("en-US");
  });

  it("has a message set for every offered locale", () => {
    for (const { code } of LOCALES) expect(MESSAGES[code]).to.be.an("object");
  });

  it("translates every English message into Japanese, and nothing extra", () => {
    expect(Object.keys(japanese).sort()).to.deep.equal(Object.keys(english).sort());
  });

  it("uses the same placeholders in Japanese as in English", () => {
    for (const [id, text] of Object.entries(english)) {
      expect(placeholders(japanese[id] as string), id).to.deep.equal(placeholders(text));
    }
  });

  it("has no Japanese message left in English: each has Japanese text, unless it is only placeholders, numbers and punctuation", () => {
    for (const [id, text] of Object.entries(japanese)) {
      const rest = withoutPlaceholders(text);
      if (/[A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff]/.test(rest)) expect(rest, id).to.match(/[\u3040-\u30ff\u4e00-\u9fff]/);
    }
  });

  it("writes Japanese messages with full-width punctuation, not an English comma, colon or brackets after a Japanese word", () => {
    for (const [id, text] of Object.entries(japanese)) expect(text, id).not.to.match(/[\u3040-\u30ff\u4e00-\u9fff][,:(]/);
  });

  it("only overrides messages that exist in US English for UK English", () => {
    for (const id of Object.keys(british)) expect(english, id).to.have.property(id);
  });

  it("falls back to US English for anything a locale does not override", () => {
    expect(Object.keys(MESSAGES["en-GB"]).sort()).to.deep.equal(Object.keys(english).sort());
    expect(MESSAGES["en-GB"]["app.title"]).to.equal(english["app.title"]);
  });

  it("spells Optimised with an s in UK English, and Optimized with a z in US English", () => {
    expect(MESSAGES["en-GB"]["tab.optimized"]).to.equal("Optimised");
    expect(MESSAGES["en-GB"]["optimized.region"]).to.equal("Optimised version");
    expect(MESSAGES["en-US"]["tab.optimized"]).to.equal("Optimized");
  });

  it("has no other common American spellings left in UK English", () => {
    for (const [id, text] of Object.entries(MESSAGES["en-GB"])) expect(text, id).not.to.match(/\b(colors?|behaviors?|centers?|gray|canceled|favorites?|license)\b/i);
  });

  it("has no American -ize spellings left in UK English", () => {
    for (const [id, text] of Object.entries(MESSAGES["en-GB"])) expect(text, id).not.to.match(/\b\w{3,}iz(e|ed|es|ing|ation)\b/i);
  });

  it("serves the Japanese translation for ja-JP", () => {
    expect(MESSAGES["ja-JP"]["app.title"]).to.equal(japanese["app.title"]);
    expect(MESSAGES["ja-JP"]["app.title"]).not.to.equal(english["app.title"]);
  });
});
