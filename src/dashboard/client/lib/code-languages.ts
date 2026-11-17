import { goLanguage } from "@codemirror/lang-go"
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from "@codemirror/lang-javascript"
import { jsonLanguage } from "@codemirror/lang-json"
import { yamlLanguage } from "@codemirror/lang-yaml"
import {
  HighlightStyle,
  type Language,
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type TagStyle,
} from "@codemirror/language"
import { diff } from "@codemirror/legacy-modes/mode/diff"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { highlightCode, tagHighlighter, tags } from "@lezer/highlight"

/** A language of the list, its support already loaded: fenced code parses at once, with no lazy import. */
const of = (name: string, alias: string[], language: Language): LanguageDescription =>
  LanguageDescription.of({ name, alias, support: new LanguageSupport(language) })

/**
 * The languages fenced code is coloured in: Go, TypeScript, TSX, JavaScript, JSX, JSON, YAML, shell and diff. A fence's
 * info string picks one by name or alias, as `@codemirror/lang-markdown` does with `codeLanguages`.
 */
export const CODE_LANGUAGES: readonly LanguageDescription[] = [
  of("Go", ["golang"], goLanguage),
  of("TypeScript", ["ts", "mts", "cts"], typescriptLanguage),
  of("TSX", [], tsxLanguage),
  of("JavaScript", ["js", "mjs", "cjs", "node"], javascriptLanguage),
  of("JSX", [], jsxLanguage),
  of("JSON", ["jsonc", "json5"], jsonLanguage),
  of("YAML", ["yml"], yamlLanguage),
  of("Shell", ["sh", "bash", "zsh", "shellscript", "console"], StreamLanguage.define(shell)),
  of("Diff", ["patch"], StreamLanguage.define(diff)),
]

/** The label a code block shows for its info string: the string's first word, as written. */
export const codeLabel = (info: string): string => /\S*/.exec(info.trim())?.[0] ?? ""

/**
 * The language of a fence's info string (`go`, `ts title="x"`), matched as `@codemirror/lang-markdown` matches it: its
 * first word, by name or alias, then by a name or alias within that word; `null` for none of the list.
 */
export function codeLanguage(info: string): LanguageDescription | null {
  const word = codeLabel(info)
  return word === "" ? null : LanguageDescription.matchLanguageName(CODE_LANGUAGES, word, true)
}

/**
 * The syntax colours, after GitHub's: each group of tags to a fixed class, which `styles/globals.css` colours from the
 * `--code-*` tokens (keyword, string, constant, function, type, property, comment). Fixed classes need no injected
 * style, so the read view's static spans and the editors share them.
 */
export const CODE_TAG_STYLES: readonly TagStyle[] = [
  {
    tag: [
      tags.keyword,
      tags.arithmeticOperator,
      tags.logicOperator,
      tags.compareOperator,
      tags.bitwiseOperator,
      tags.updateOperator,
      tags.deleted,
    ],
    class: "code-keyword",
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], class: "code-string" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.url, tags.link, tags.constant(tags.variableName)],
    class: "code-constant",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName, tags.meta],
    class: "code-function",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.special(tags.variableName), tags.self],
    class: "code-type",
  },
  {
    tag: [tags.propertyName, tags.tagName, tags.attributeName, tags.labelName, tags.inserted],
    class: "code-property",
  },
  { tag: tags.comment, class: "code-comment" },
]

/**
 * The highlight styles of fenced code in a Markdown editor: the colours above, one style per language of the list,
 * each scoped to its language (`HighlightStyle.define`'s `scope`), so Markdown's own tags (headings, emphasis, links)
 * stay unstyled. The JavaScript dialects share their language data, so one style serves them all.
 */
export const CODE_BLOCK_STYLES: readonly HighlightStyle[] = CODE_LANGUAGES.flatMap((d) =>
  d.support === undefined ? [] : [d.support.language],
)
  .filter((language, i, all) => all.findIndex((l) => l.data === language.data) === i)
  .map((language) => HighlightStyle.define(CODE_TAG_STYLES, { scope: language }))

const highlighter = tagHighlighter(CODE_TAG_STYLES.map(({ tag, class: c }) => ({ tag, class: c as string })))

/** A run of a code line: its text and the classes of its colour, empty for plain text. */
export type CodeToken = { text: string; classes: string }

/**
 * The lines of `code`, each a list of runs coloured for the language of `info`, parsed with that language's own parser
 * (`highlightCode` of `@lezer/highlight`); plain runs for a language off the list.
 */
export function codeTokens(code: string, info: string): CodeToken[][] {
  const text = code.endsWith("\n") ? code.slice(0, -1) : code
  const language = codeLanguage(info)?.support?.language
  if (language === undefined) return text.split("\n").map((line) => (line === "" ? [] : [{ text: line, classes: "" }]))
  const lines: CodeToken[][] = [[]]
  highlightCode(
    text,
    language.parser.parse(text),
    highlighter,
    (run, classes) => (lines[lines.length - 1] as CodeToken[]).push({ text: run, classes }),
    () => lines.push([]),
  )
  return lines
}
