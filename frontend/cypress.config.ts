import { defineConfig } from "cypress";
import codeCoverageTask from "@cypress/code-coverage/task";

export default defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  defaultCommandTimeout: 8000,

  // End-to-end tests: the real built app talking to the real backend (run with a light feed, see cypress/e2e).
  e2e: {
    baseUrl: "http://localhost:4173",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 800,
    setupNodeEvents(on) {
      // Lets tests print to the terminal, for example the details of accessibility violations.
      on("task", {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },

  // Component tests: components, hooks and helpers mounted in isolation. Coverage is measured here.
  component: {
    specPattern: "cypress/component/**/*.cy.{ts,tsx}",
    supportFile: "cypress/support/component.ts",
    indexHtmlFile: "cypress/support/component-index.html",
    viewportWidth: 1280,
    viewportHeight: 800,
    devServer: { framework: "react", bundler: "vite" },
    setupNodeEvents(on, config) {
      codeCoverageTask(on, config);
      return config;
    },
  },
});
