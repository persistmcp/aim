import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "test-results", "playwright-report", "blob-report"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Just the two well-established hook rules -- react-hooks v7's packaged "recommended"
      // configs pull in the full React Compiler readiness rule set (immutability, purity,
      // static-components, ...), which is a separate adoption decision this project hasn't made.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Deliberate: catalog/query/webhook payloads are genuinely untyped at the boundary
      // (external MCP/API JSON), and the codebase relies on `any` there rather than modeling
      // every payload shape. Revisit if payload types firm up.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-context config files: no browser globals, no React rules.
    files: ["*.config.{js,ts,mjs}", "scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettierConfig,
);
