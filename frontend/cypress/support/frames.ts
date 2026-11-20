/** Wait until the page has drawn this many animation frames. Unlike a fixed wait, it ends when something observable has happened. */
export const afterFrames = (count: number): Cypress.Chainable<void> =>
  cy.window().then(
    (win) =>
      new Promise<void>((resolve) => {
        let remaining = count;
        const tick = () => {
          remaining--;
          if (remaining <= 0) resolve();
          else win.requestAnimationFrame(tick);
        };
        win.requestAnimationFrame(tick);
      }),
  );
