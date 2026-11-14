import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores([
    "dist/",
    "src/dashboard/generated/",
    "site/",
    "src/dashboard/client/components/ui/",
    "src/dashboard/client/components/reui/",
    "src/dashboard/client/hooks/",
    "plugin/workflows/run-pipeline.js",
  ]),
  {
    files: ["**/*.{ts,tsx,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["src/dashboard/client/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  eslintConfigPrettier,
])
