import enUS from "../../../src/i18n/messages/en-US.json";
import jaJP from "../../../src/i18n/messages/ja-JP.json";
import { DEFAULT_ITERATION_ID, ITERATIONS, ITERATION_IDS } from "../../../src/iterations";

describe("the iteration registry", () => {
  it("lists every iteration once, in tab order, with the first as the default", () => {
    expect(ITERATIONS.length).to.be.greaterThan(0);
    expect(ITERATION_IDS).to.deep.equal(ITERATIONS.map((i) => i.id));
    expect(new Set(ITERATION_IDS).size).to.equal(ITERATION_IDS.length);
    expect(DEFAULT_ITERATION_ID).to.equal(ITERATIONS[0]?.id);
  });

  it("uses URL-safe ids", () => {
    for (const id of ITERATION_IDS) expect(id).to.match(/^[a-z0-9-]+$/);
  });

  it("has a translated label and description for every iteration", () => {
    for (const { labelId, descriptionId } of ITERATIONS) {
      for (const id of [labelId, descriptionId]) {
        expect(enUS, id).to.have.property(id);
        expect(jaJP, id).to.have.property(id);
      }
    }
  });

  it("loads each page lazily, so its code is only downloaded when its tab is opened", () => {
    for (const { Page } of ITERATIONS) expect(String(Page.$$typeof)).to.equal("Symbol(react.lazy)");
  });
});
