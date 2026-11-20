import { NAIVE, waitForLiveTable } from "../support/e2e";

// The real thing, in real time: about 37 seconds, so this test is deliberately a single flow.
describe("recording a benchmark run", () => {
  it("warms up, counts down, and downloads a valid result file", { defaultCommandTimeout: 60000 }, () => {
    cy.visit(NAIVE);
    waitForLiveTable();

    cy.get(".record-button").should("have.text", "Record 30-second run").click();
    cy.get(".record-button").should("have.attr", "data-phase", "warmup").and("be.disabled").and("contain.text", "Warming up");
    cy.get(".record-button", { timeout: 10000 }).should("have.attr", "data-phase", "measuring").and("contain.text", "Recording");

    // The note announces the saved file once the run finishes.
    cy.get(".hud-note[role=status]", { timeout: 60000 }).should("contain.text", "Saved");
    cy.get(".record-button").should("be.enabled").and("have.text", "Record 30-second run");

    cy.get(".hud-note[role=status]")
      .invoke("text")
      .then((note) => {
        const fileName = /Saved (\S+\.json)/.exec(note)?.[1] ?? "";
        expect(fileName).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}_naive_\d+k\.json$/);
        return cy.readFile(`${Cypress.config("downloadsFolder")}/${fileName}`, { timeout: 15000 });
      })
      .then((result) => {
        expect(result.schema).to.equal(2);
        expect(result.mode).to.equal("naive");
        expect(result.build).to.equal("production");
        expect(result.warmupSeconds).to.equal(3);
        expect(result.durationSeconds).to.equal(30);
        expect(result.samples).to.have.length(30);
        expect(result.tabHidden).to.equal(false);
        expect(result.settings).to.deep.equal({ refreshSeconds: null, changedDuringRun: false }); // Naive has no refresh interval
        expect(result.load.instruments).to.be.greaterThan(0);
        expect(result.summary.fpsAvg).to.be.a("number");
        expect(result.summary.latencyMs.p99).to.be.at.least(result.summary.latencyMs.p50);
        expect(result.environment.userAgent).to.be.a("string");
      });
  });
});
