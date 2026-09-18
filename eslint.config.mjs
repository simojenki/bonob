import js from "@eslint/js";
import tseslint from "typescript-eslint";
import functional from "eslint-plugin-functional";

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  functional.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // ---------------------------------------------------------------------
      // Functional style
      // ---------------------------------------------------------------------

      // We use both OO and functional programming.
      "functional/no-classes": "off",

      // Don't force functional replacements for normal OO constructs.
      "functional/no-this-expressions": "off",

      // Mutation is acceptable inside objects/classes where it represents
      // encapsulated state. We don't want a blanket ban on mutation.
      "functional/immutable-data": "off",

      // Discourage mutable local variables, but don't make this an absolute
      // requirement while we're evaluating the style.
      "functional/no-let": "warn",

      // Prefer readonly types where practical.
      "functional/prefer-readonly-type": "warn",

      "functional/no-conditional-statements": "off",
      "functional/no-loop-statements": "off",
      "functional/no-expression-statements": "off",
      "functional/prefer-immutable-types": "warn",
      "functional/functional-parameters": "off",
      "functional/no-class-inheritance": "warn",
      // todo: would be good to enable this one at some point
      "functional/no-throw-statements": "off",
      "functional/no-return-void": "off",
      

      // ---------------------------------------------------------------------
      // TypeScript
      // ---------------------------------------------------------------------

      // Turn off rules that duplicate strict tsc checks or clash with
      // project style.
      "@typescript-eslint/no-explicit-any": "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",

      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowObjectTypes: "always",
        },
      ],

      "@typescript-eslint/no-wrapper-object-types": "warn",
      "@typescript-eslint/no-extra-non-null-assertion": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-unused-expressions": "off",

      // ---------------------------------------------------------------------
      // General style
      // ---------------------------------------------------------------------

      "prefer-const": "warn",
      "no-var": "warn",
    },
  },

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  {
    files: ["**/*.test.ts", "tests/**/*.ts"],

    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // -------------------------------------------------------------------------
  // JavaScript
  // -------------------------------------------------------------------------

  {
    files: ["**/*.js"],

    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Ignores
  // -------------------------------------------------------------------------

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
  },
);