// Loads every source module, so a file that no test exercises still shows up in the coverage report
// (as uncovered) instead of silently being left out of the percentages.
describe("coverage completeness", () => {
  it("loads every source module", () => {
    const modules = import.meta.glob(["../../src/**/*.{ts,tsx}", "!../../src/main.tsx", "!../../src/vite-env.d.ts"], {
      eager: true,
    });
    expect(Object.keys(modules).length).to.be.greaterThan(20);
  });
});
