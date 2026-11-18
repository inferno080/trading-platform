import "@cypress/code-coverage/support";
import { mount } from "cypress/react";
import "cypress-real-events";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { restoreWebSocket } from "./fakeWebSocket";
import { installMatchMedia, restoreMatchMedia } from "./matchMedia";
import { restoreLocalStorage } from "./storage";

Cypress.Commands.add("mount", mount);

declare global {
  // Cypress's own extension point for custom commands.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}

// Every test starts from a clean browser: no saved settings, a light OS with no special preferences
// (the real setting depends on the machine running the tests), and the real WebSocket afterwards.
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.lang = "en-US";
  window.location.hash = "";
  installMatchMedia();
});

afterEach(() => {
  restoreWebSocket();
  restoreMatchMedia();
  restoreLocalStorage();
});
