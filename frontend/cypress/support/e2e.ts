import "cypress-axe";
import "cypress-real-events";

/** The Naive tab, which has the live table. The default address (/) is the Optimized tab. */
export const NAIVE = "/#/naive";

// Every test starts on a light OS with no motion preference, whatever machine runs the tests (the real
// setting varies, and a dark-mode Mac would otherwise change the starting theme). Tests that need a
// different setting emulate it themselves, and the emulation is cleared again afterwards.
beforeEach(() => {
  emulateMedia([
    { name: "prefers-color-scheme", value: "light" },
    { name: "prefers-reduced-motion", value: "no-preference" },
  ]);
});

afterEach(() => {
  emulateMedia([]);
});

/** Emulate OS-level media features such as dark mode or reduced motion (Chromium-based browsers only). */
export function emulateMedia(features: { name: string; value: string }[]): void {
  cy.wrap(
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setEmulatedMedia",
      params: { features },
    }),
    { log: false },
  );
}

/** Wait until the app is live and the table has rows. */
export function waitForLiveTable(): void {
  // Checks the status attribute, not the word "Live", so it works in every language.
  cy.get(".status", { timeout: 20000 }).should("have.attr", "data-status", "live");
  cy.get("tbody tr", { timeout: 20000 }).should("have.length.greaterThan", 10);
}

/** Wait until the Optimized tab is live and its grid has rows. */
export function waitForLiveGrid(): void {
  cy.get(".status", { timeout: 20000 }).should("have.attr", "data-status", "live");
  cy.get(".ag-row[row-id]", { timeout: 20000 }).should("have.length.greaterThan", 5);
}
