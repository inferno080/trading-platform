import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", ".nyc_output", "cypress/downloads", "cypress/screenshots"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      sonarjs.configs.recommended, // code-smell and complexity rules, in the spirit of a SonarCloud maintainability grade
    ],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Scrollable regions must be keyboard-focusable (axe: scrollable-region-focusable).
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["region"] }],
      complexity: ["error", 12],
    },
  },
  {
    // Tests repeat selectors and strings on purpose; keep them readable instead of DRY.
    files: ["**/*.cy.{ts,tsx}", "cypress/**/*.{ts,tsx}"],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      // Cypress .should() chains are real assertions, which this rule does not recognise.
      "sonarjs/assertions-in-tests": "off",
      // Prefer .to.equal(null) over the property form .to.be.null, which ESLint reports as an unused expression.
      "sonarjs/prefer-specific-assertions": "off",
    },
  },
);
