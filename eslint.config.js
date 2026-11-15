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
  // react-hooks rules turned off where satisfying them means rewriting how a component renders or when its effects run.
  {
    files: ["src/dashboard/client/components/code-view.tsx"],
    rules: {
      // The editable view registers its EditorView on the draft store it is given (`draft.view`), a store kept
      // outside React that the draft's commands read.
      "react-hooks/immutability": "off",
    },
  },
  {
    files: ["src/dashboard/client/components/draft.tsx"],
    rules: {
      // The text memo and the check timer are keyed on the document (`doc`): a selection-only change neither slices
      // the text again nor restarts the check delay.
      "react-hooks/exhaustive-deps": "off",
      // `refs.current` is written during render so the callbacks read the latest store, result and dirty state
      // without being recreated.
      "react-hooks/refs": "off",
      // A draft equal to the file again clears the draft's details from an effect.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/dashboard/client/components/workflow-forms.tsx"],
    rules: {
      // The typed-key effect runs when `value` changes, not when the parent passes a new `onTyped`.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["src/dashboard/client/pages/change.tsx"],
    rules: {
      // The check memos depend on text read from the drafts' store, kept outside React.
      "react-hooks/preserve-manual-memoization": "off",
      // Task row ids, the list-action flag and the latest field and tasks live in refs read and written during
      // render, so a row keeps its id across edits.
      "react-hooks/refs": "off",
      // A draft that fails the check opens the text view from an effect.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/dashboard/client/pages/prompt.tsx"],
    rules: {
      // A line clicked on the Preview tab is applied, then cleared, from an effect once the code view is mounted.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/dashboard/client/pages/workflow.tsx"],
    rules: {
      // A gone selection and an open picker are cleared from effects after an edit, Undo, Redo or a tab change.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  eslintConfigPrettier,
])
