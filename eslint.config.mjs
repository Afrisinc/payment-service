import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default defineConfig([
  {
    ignores: ["dist", "node_modules", "build", "coverage"],
  },
  {
    files: ["src/**/*.ts"],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
    },

    plugins: {
      "@typescript-eslint": typescriptEslint,
      prettier,
    },

    rules: {
      ...prettierConfig.rules,

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-var": "error",
      "no-unused-vars": "off",

      // Prettier rules
      "prettier/prettier": [
        "error",
        {
          singleQuote: true,
          semi: true,
          endOfLine: "lf",
          trailingComma: "all",
          printWidth: 120,
          tabWidth: 2,
        },
      ],
    },
  },
]);
