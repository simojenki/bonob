import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Turn off rules that duplicate strict tsc checks or clash with project style
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-empty-object-type": ["error", { allowObjectTypes: "always" }],
      "@typescript-eslint/no-wrapper-object-types": "warn",
      "@typescript-eslint/no-extra-non-null-assertion": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-unused-expressions": "off",
      // Style / project conventions
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
  },
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "web/**",
      ".ignore/**",
      "coverage/**",
      "jest.config.js",
      "tests/setup.js",
    ],
  }
);
