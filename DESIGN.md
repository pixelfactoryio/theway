---
name: theway dashboard
description: The local web view of a theway home, built as a dark-first desktop app after Conductor.
colors:
  # Dark theme (designed first): `:root[data-theme="dark"]` and `prefers-color-scheme: dark`.
  window-dark: "#151311"
  document-dark: "#161412"
  sidebar-panel-dark: "#1a1816"
  card-dark: "#1e1c1b"
  band-dark: "#1e1c1b"
  popover-dark: "#211f1d"
  muted-dark: "#242220"
  selection-dark: "#272523"
  rule-dark: "#302e2c"
  canvas-dot-dark: "#2e2c2a"
  input-rule-dark: "#363432"
  dim-ink-dark: "#a6a4a1"
  third-ink-dark: "#918d8a"
  ink-dark: "#eeecea"
  doc-ink-dark: "#f0efed"
  doc-code-tint-dark: "rgb(255 255 255 / 0.055)"
  code-surface-dark: "rgb(255 255 255 / 0.03)"
  link-blue-dark: "#6aa7ff"
  done-green-dark: "#45b97c"
  progress-amber-dark: "#e3a43f"
  invalid-red-dark: "#ef6a5b"
  brand-amber-dark: "#f5a74b"
  code-keyword-dark: "#ff7b72"
  code-string-dark: "#a5d6ff"
  code-constant-dark: "#79c0ff"
  code-function-dark: "#d2a8ff"
  code-type-dark: "#ffa657"
  code-property-dark: "#7ee787"
  tone-inputs-dark: "oklch(74.6% 0.16 232.661)"
  tone-session-dark: "oklch(77.7% 0.152 181.912)"
  tone-agents-dark: "oklch(78.5% 0.115 274.713)"
  tone-on-fail-dark: "oklch(71.2% 0.194 13.428)"
  # Light theme: `:root`, the same roles on a near-white ground.
  document-light: "#ffffff"
  window-light: "#f3f1ef"
  sidebar-panel-light: "#f8f6f4"
  band-light: "#f6f4f2"
  muted-light: "#f2f0ee"
  secondary-light: "#eeecea"
  selection-light: "#ebe9e7"
  rule-light: "#e6e4e2"
  input-rule-light: "#d7d4d1"
  dim-ink-light: "#67635f"
  third-ink-light: "#6f6b67"
  ink-light: "#1a1816"
  doc-ink-light: "#37352f"
  doc-code-tint-light: "rgb(135 131 120 / 0.15)"
  code-surface-light: "rgb(135 131 120 / 0.07)"
  link-blue-light: "#2563c9"
  info-ink-light: "#1f55ad"
  done-green-light: "#1a7044"
  progress-amber-light: "#ca7a00"
  progress-amber-ink-light: "#8f5407"
  invalid-red-light: "#c2392c"
  invalid-ink-light: "#b02f23"
  brand-amber-light: "#b4650f"
  code-keyword-light: "#b0322a"
  code-string-light: "#0a3d75"
  code-function-light: "#6639ba"
  code-type-light: "#953800"
  code-property-light: "#1a6640"
  tone-inputs-light: "oklch(50% 0.134 242.749)"
  tone-session-light: "oklch(51.1% 0.096 186.391)"
  tone-agents-light: "oklch(51.1% 0.262 276.966)"
  tone-on-fail-light: "oklch(51.4% 0.222 16.935)"
  # Fixed values both themes share.
  white: "#fff"
  black: "#000"
  grid-dirty-amber: "oklch(76.9% 0.188 70.08)"
  grid-new-green: "oklch(72.3% 0.219 149.579)"
typography:
  document-title:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: "1.8125rem"
    letterSpacing: "-0.025em"
  doc-h1:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.4375rem"
  doc-h2:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.9375rem"
  doc-h3:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.625rem"
  doc-body:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  doc-id:
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  doc-code:
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace'
    fontSize: "0.85em"
    fontWeight: 400
    lineHeight: 1.5
  workflow-title:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: "1.8125rem"
    letterSpacing: "-0.025em"
  heading:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  body:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  row-id:
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  task-lead:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.3125rem"
  grid-header:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  button-small:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.8rem"
    fontWeight: 500
  small:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  badge-tiny:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1
  badge-micro:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.6rem"
    fontWeight: 500
    lineHeight: 1
  code:
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  mono-small:
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  mark: "2px"
  inset-kbd: "3px"
  sm: "4px"
  inset-button: "5px"
  md: "6px"
  lg: "8px"
  doc-code: "10px"
  xl: "12px"
  2xl: "14.4px"
  3xl: "17.6px"
  4xl: "20.8px"
  full: "9999px"
spacing:
  "0.5": "2px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "9": "36px"
  "10": "40px"
  "12": "48px"
  "14": "56px"
  "16": "64px"
components:
  button-default:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.window-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.document-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.muted-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
  button-small:
    typography: "{typography.button-small}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.document-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  sidebar-row:
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px"
    height: "32px"
  sidebar-row-active:
    backgroundColor: "{colors.selection-dark}"
    textColor: "{colors.ink-dark}"
  document-tab:
    textColor: "{colors.dim-ink-dark}"
    typography: "{typography.body}"
    padding: "0 16px"
    height: "44px"
  document-tab-active:
    textColor: "{colors.ink-dark}"
  panel:
    backgroundColor: "{colors.sidebar-panel-dark}"
    width: "420px"
  group-band:
    backgroundColor: "{colors.band-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    padding: "0 24px"
    height: "36px"
  list-row:
    textColor: "{colors.ink-dark}"
    typography: "{typography.row-id}"
    padding: "8px 24px"
    height: "36px"
  filter-chip:
    backgroundColor: "{colors.document-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "28px"
  workflow-card:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    width: "300px"
    height: "72px"
  canvas-controls:
    backgroundColor: "{colors.card-dark}"
    rounded: "{rounded.lg}"
    padding: "0 4px"
    height: "36px"
  code-block:
    backgroundColor: "{colors.code-surface-dark}"
    textColor: "{colors.doc-ink-dark}"
    typography: "{typography.doc-code}"
    rounded: "{rounded.doc-code}"
    padding: "16px 20px"
  tooltip:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.document-dark}"
    typography: "{typography.small}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  kbd:
    backgroundColor: "{colors.muted-dark}"
    textColor: "{colors.dim-ink-dark}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    height: "20px"
  status-mark:
    rounded: "{rounded.mark}"
    size: "8px"
---

# Design System: theway dashboard

## Overview

**Creative North Star: "The Title Block"**

The dashboard is a desktop app in Conductor's mould, opened in a browser beside Claude Code sessions. A sidebar on the left, a document in the centre, and a full-height panel on the right that holds the document's facts and its working lists (Tasks, Details, Series, the selected step, Problems, Used by). The name comes from the engineering drawing's title block, the world the user chose: every document states its facts in one fixed place, the panel header and its Details tab, so the centre stays free for reading and editing.

It is built for Operate: dense, quiet chrome, warm near-black greys, hierarchy from weight and ink before size. Colour carries state (amber In progress, green Ready or Valid, red Invalid or errors) and the one blue goes to links, focus and the text caret. The stock shadcn card dashboard is the anti-reference: no cards on the page ground, no shadows on panels, no decorative colour. Documents are the one place the scale opens up: a spec, notes or a prompt reads at Notion's size in a warm ink, while the interface around it stays at 14px.

Dark is designed first and light is the same system on a near-white ground. The theme follows the system setting unless the user picks Light or Dark in Settings (`data-theme` on `html`).

**Key Characteristics:**

- Three columns: a 272px sidebar (a 48px rail of icons when collapsed), the document, a 420px panel (320 to 640px, resizable) docked from 1280px.
- A 44px top row on every page; the panel's header is level with it.
- Conductor's type scale for the interface: 14/20 body, 12/16 small; system font, Geist Mono for IDs and code.
- Notion's scale for documents: 16/24 text in a 708px column, headings 30, 24 and 20, under a 21/29 title block; code blocks and tables break out to 64rem.
- Lists capped at 64rem (80rem for the lists of files), on the left; grouped lists separated by sticky, collapsible bands one surface step above the page, not by gaps or dividers.
- Hairline rules separate regions; shadows only on things that float.
- An 8px CSS square marks status everywhere it appears.

## Colors

Warm near-black greys in dark, warm near-white greys in light (hue about 65, after Conductor's), three state colours and one blue. Values live as CSS custom properties in `src/dashboard/client/styles/globals.css` (`:root` for light, the dark block twice: under `prefers-color-scheme: dark` and under `:root[data-theme="dark"]`), mapped to Tailwind colours by `@theme inline`. The band and document tokens (`--band`, `--doc-foreground`, `--doc-code-tint`, `--read-width`, `--read-wide`, `--doc-code-radius`) sit in their own `:root` / dark triplets further down the same file.

### Primary

- **Link Blue** (dark `#6aa7ff`, light `#2563c9`): `--link`, `--ring`, `--info`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1`. Links in the interface, focus rings and outlines, the text caret, the text selection (`--link` at 32% through `color-mix`), the code view's selection and matches (`--ring` at 30 to 35%), the live editor's task boxes (`accent-color`). Light `--info-foreground` is the darker `#1f55ad` (also `--code-constant`). Links inside a document are not blue (see Document ink).

### Secondary

State colours, used for state only:

- **Progress Amber** (dark `#e3a43f`; light `#ca7a00` for fills and `#8f5407` for text): `--warning` fills (the progress bar, the status mark, the Next task's 2px inset edge, 5% tint and checkbox rule, a warning's icon and tint), and `--warning-foreground` is amber text (the In progress status pill, "Next", the In progress count on All projects). In dark the two are one colour; in light the fill is the brighter one, which would not pass as text. `--chart-3` is the text amber.
- **Done Green** (dark `#45b97c`, light `#1a7044`): `--success`, `--success-foreground`, `--chart-2`. Ready to archive, Valid, a full progress bar, the counts on Now's Ready to archive chips.
- **Invalid Red** (dark `#ef6a5b`, light `#c2392c`): `--destructive`, `--chart-4`. Invalid, errors, destructive actions, the on-fail edge (60%) and its pill's rule (40%). Light `--destructive-foreground` is `#b02f23` for red text; in dark it equals `--destructive`.

### Tertiary

- **Brand Amber** (dark `#f5a74b`, light `#b4650f`): `--brand`, only the logo's route mark, on a 15% tint of itself.
- **Step tones**: `--tone-inputs`, `--tone-session`, `--tone-agents`, `--tone-on-fail`, the icon tints of the workflow canvas's card kinds. Identity, not state, and none of them amber. Light uses Tailwind's `sky-700`, `teal-700`, `indigo-600`, `rose-700`; dark uses `sky-400`, `teal-400`, `indigo-300`, `rose-400` (the oklch values in the frontmatter).
- **Code syntax** (`--code-*`, after GitHub's): keyword `--code-keyword`, string `--code-string`, constant `--code-constant`, function `--code-function`, type `--code-type`, property `--code-property`, and comment `--code-comment` (the dim ink, `#a6a4a1` / `#67635f`, in italic). Each colours a fixed class (`.code-keyword` … `.code-comment`) that `src/dashboard/client/lib/code-languages.ts` gives to groups of syntax tags, so the read view's code blocks, the live editor's fenced code and the YAML code view share one palette. Fenced code is coloured for Go, TypeScript, TSX, JavaScript, JSX, JSON, YAML, Shell and Diff; YAML's plain values stay in the text colour (the YAML parser gives them no colour tag).

### Neutral

| Role                                                       | Token                                         | Dark      | Light     |
| ---------------------------------------------------------- | --------------------------------------------- | --------- | --------- |
| Window ground (`body`)                                     | `--ground`                                    | `#151311` | `#f3f1ef` |
| Document                                                   | `--background`                                | `#161412` | `#ffffff` |
| Sidebar and panel                                          | `--sidebar`                                   | `#1a1816` | `#f8f6f4` |
| Workflow canvas                                            | `--canvas`                                    | `#161412` | `#f8f6f4` |
| Canvas dots                                                | `--canvas-dot`                                | `#2e2c2a` | `#d7d4d1` |
| Cards, canvas controls, minimap                            | `--card`                                      | `#1e1c1b` | `#ffffff` |
| Group bands                                                | `--band`                                      | `#1e1c1b` | `#f6f4f2` |
| Menus, dialogs, palette                                    | `--popover`                                   | `#211f1d` | `#ffffff` |
| Muted fill (kbd, table heads, chip labels)                 | `--muted`                                     | `#242220` | `#f2f0ee` |
| Secondary fill                                             | `--secondary`                                 | `#272523` | `#eeecea` |
| Hover and selection                                        | `--accent`, `--sidebar-accent`                | `#272523` | `#ebe9e7` |
| Rules                                                      | `--border`, `--sidebar-border`                | `#302e2c` | `#e6e4e2` |
| Input rules, scrollbar thumb, split lines, link underlines | `--input`                                     | `#363432` | `#d7d4d1` |
| Third ink                                                  | `--subtle-foreground`                         | `#918d8a` | `#6f6b67` |
| Dim ink                                                    | `--muted-foreground`, `--chart-5`             | `#a6a4a1` | `#67635f` |
| Ink                                                        | `--foreground`, `--primary`                   | `#eeecea` | `#1a1816` |
| On ink                                                     | `--primary-foreground`, `--invert-foreground` | `#151311` | `#ffffff` |

`--primary` is the ink, not a colour: a default button, a checked checkbox, radio and switch, and the active tab's underline are all ink.

**Three inks.** The ink is what is read first (IDs, names, values); the dim ink is the text under and beside it (a row's description, its project, its counts, inactive tabs); the third ink is what labels the page without being read each time: the sidebar's group labels, the lists' column headers, the collapse hint and placeholders. The third ink is at least 4.5:1 on every ground it stands on (4.69:1 on the light window ground, the least).

**Document ink.** A document's text, headings, bold and table cells use `--doc-foreground`, a warm off-white in dark (`#f0efed`) and a warm ink in light (`#37352f`), after Notion. Inline code sits on `--doc-code-tint` (white at 5.5% in dark, warm grey `rgb(135 131 120)` at 15% in light); code blocks on the fainter `--code-surface` (white at 3%, the same warm grey at 7%). Links in a document are the text colour at 500 with a `--input` underline.

Fixed values shared by both themes:

- `#000` at 10% (`bg-black/10`): the dim behind dialogs, alert dialogs and sheets.
- `#fff` (`text-white`): text on the vendored solid badge variants (`info`, `success`, `warning`, `destructive`); the dashboard uses the `-light` and `outline` variants instead.
- Shadow inks: `#000` at 3% to 28% in the shadow scale and the data grid's sticky edges (`rgba(0,0,0,0.03)`), `#fff` at 6% for those edges in dark, `#0008` as the drop shadow of the number field's scrub cursor, `rgb(0 0 0 / 0.14)` under the vendored elevated icon tile, and `shadow-black/5` / `shadow-white/5` inside the vendored frame.
- The data grid's row states: `amber-500` and `green-500` at 5% (dirty, new) and `--destructive` at 5% (deleted).
- Canvas mixes: edges are `--muted-foreground` at 50%; the minimap's mask is `--background` at 55%.

### Named Rules

**The State Is Colour Rule.** Amber, green and red mean In progress, Ready or Valid, and Invalid or error. Nothing decorative takes them, and the pinned star is ink, not amber.

**The Ink Is Primary Rule.** Primary actions, checked controls and the active tab are drawn in the ink. The blue is kept for links, focus and the caret.

## Typography

**Interface Font:** `"SF Pro", system-ui, sans-serif` (`--font-sans`, also `--font-heading`): SF Pro on macOS, the system font elsewhere. Nothing is downloaded for it.
**Code Font:** `"Geist Mono Variable", ui-monospace, monospace` (`--font-mono`), served by the dashboard at `/fonts/geist-mono.woff2` (weights 100 to 900, embedded by `scripts/embed-fonts.ts`).

**Character:** a native app's system face for everything you read and click, and a monospace for what you would type: IDs, paths, counts beside a row, code, YAML.

Base: 16px root (`text-base` 1rem). Text inputs are `text-base` below 768px and `text-sm` from 768px.

### Hierarchy

The interface:

- **Title** (600, `text-title` 1.3125rem/1.8125rem, 21/29px, tracking -0.025em): a workflow's name, above its canvas, and a document's title (below).
- **Heading** (600, `text-heading` 0.875rem/1.25rem): a list page's title in its top row, set apart by weight, not size. A dialog's title is the same size and weight (`text-sm` 600, in place of the vendored 16px).
- **Body** (400 or 500, `text-sm` 0.875rem/1.25rem): every tab, button, menu item, panel line, field, band label and row text.
- **Row ID** (400, Geist Mono `text-sm`): the first line of every row of the five lists: a change's, a series' or a project's ID, a group's name, a workflow's or a prompt's name. The row's text (description, "series of N", the project's path) sits under it in body dim ink, on one line.
- **Task lead** (500, `text-md` 0.875rem/1.3125rem, 14/21): the lead of each task in the panel; its detail is `text-sm` 14/20 in the dim ink.
- **Small** (400 or 500, `text-xs` 0.75rem/1rem): ages beside rows, the result line, the collapse hint (third ink), tooltips, kbd, badges, the zoom percentage, secondary lines.
- **Mono small** (Geist Mono `text-xs`, `tabular-nums`): `done/total` on change rows, the counts and Last archived date on All projects, every count of the sidebar, per-value counts in filter menus, the version tag, the step prompt's file name.
- **Grid header** (400, `text-xs`, the third ink): the column headers of every list's data grid. A column that sorts keeps the vendored header button and its arrow; a column that does not shows its title as text, not as a button.
- **Small button** (500, 0.8rem): the vendored `sm` button and toggle size, used by the filter bar's Filter button.
- **Badge micro and tiny** (500, 0.6rem and 0.625rem, line height 1): the vendored badge's `xs` and `sm` sizes. The dashboard's badges use the default size (`text-xs`). The vendored ReUI filters also carry a 10px "+" on the drag copy of their advanced builder, which the dashboard's filter bar does not use.
- **Code** (Geist Mono, 0.875rem/1.5rem): the YAML code view. Inline code in task text is Geist Mono `text-xs` on `--muted` with a 4px radius and 4px side padding.

Documents (the read view, the live editor, the step prompt's preview), from `--text-doc*` in `globals.css`:

- **Document title** (the interface's Title: 600, `text-title` 21/29, tracking -0.025em, in `--doc-foreground`): a change's description and a prompt's name, above the document. It is smaller than the document's own h1, which it does not compete with.
- **Document ID** (Geist Mono `text-sm`, dim ink): a change's ID 8px under its title.
- **h1** (600, 1.875rem/2.4375rem, 30/39), **h2** (600, 1.5rem/1.9375rem, 24/31, no rule), **h3** (600, 1.25rem/1.625rem, 20/26); h4 is the body size at 600, h5 and h6 the same in dim ink.
- **Body** (400, `text-doc` 1rem/1.5rem, 16/24): paragraphs, lists, quotes, table cells. Bold is 600.
- **Code** (Geist Mono at 85% of the text, 13.6px): inline code, code blocks (line height 1.5, tab size 4) and the live editor's table source lines; a code block's language label is Geist Mono `text-xs` dim ink.

Weights: 400, 500 and 600, in the interface and in documents; the code view's Markdown headings use `bold`. Numbers that line up (counts, progress, line counts, task numbers, table cells) use `tabular-nums`. The logo's "theway" is 600 `text-sm` with tracking -0.025em.

### Named Rules

**The Weight Before Size Rule.** In the interface, hierarchy comes from 600 against 400 and ink against dim ink, inside two sizes (14 and 12). The workflow's and the document's titles are the interface's one larger size (21px).

**The Document Scale Rule.** Documents read at Notion's scale (16, 20, 24 and 30) and nothing else does; the chrome around a document stays at 14px. A document's title, like a workflow's, is the interface's one larger size, not a size of the document scale.

## Layout

The window is three columns at full height (`h-svh`) with no page scroll; each region scrolls itself.

- **Sidebar:** 17rem (272px) on `--sidebar`, open by default from 1024px (kept per browser after a toggle). Collapsed, it folds to a 3rem (48px) rail of icons (`collapsible="icon"`) that keeps its own toggle; labels, counts, the logo and the version tag hide. Below 768px (`use-mobile`) it is a sheet, opened from a button at the left of the top row. Rows are 32px (`h-8`) with 2px gaps; group labels are 28px.
- **Centre:** the document on `--background`. Every page starts with a 44px top row (`h-11`, rule below) holding the page title or the document's tabs.
- **Panel:** docked at the right from 1280px, 420px by default, resizable from 320 to 640px by its left edge or the arrow keys (16px a step), its width (in pixels, the same in a window of any size) and hidden state kept per browser. Below 1280px it opens over the page as a sheet, `min(420px, 90vw)` wide, on `--sidebar` as when docked. Its header row is 44px; under it a top and a bottom pane in a vertical split (see Components), each with a 40px tab row.
- **List pages** (Now, a project or group page, All projects, Workflows, Prompts): 24px gutters (`px-6`), which the top row's title and actions, the filter bar, the rows and a document's footer all keep. The filter bar sits under the top row (`px-6 py-3`), the result line under it, then the list. Every list is a data grid whose columns resize by their header's edge (`columnsResizable`, at least 72px), under one 32px header row per page, which scrolls with the list: above the first band on Now and a project or group page, where the page's grids share their column widths, and at the top of the grid on All projects, Workflows and Prompts.
- **List width:** a list's columns are capped, the cap on the left, against the 24px gutter: `--read-wide` (64rem) between the gutters on Now, a project or group page and All projects, 80rem on Workflows and Prompts. The first column takes the room the others leave up to the cap; the room past it stays empty (an empty last column of the grid), and band fills, the header's rule and a row's hover fill cross it to the page's edge. Change rows keep their other columns at the right of the cap: the project 200px from 1280px and 140px below (shown from 768px), the progress 172px (12px of left padding, a 96px bar from 640px, then `done/total` in 56px; 84px below 640px), the age or archive date 96px under "Updated". A list that shows no open change has no progress column (see Header row): the first column takes its room, and the project and the date keep their widths and their place against the cap. All projects' columns are In progress 96px, Not started 96px, Last archived 112px and the actions 108px. On the Workflows and Prompts grids the name is at least 200px, and the grid scrolls sideways when the columns are wider than the page.
- **Document pages:** the reading column is the whole width between 24px gutters (`px-6`). Prose keeps its measure, at most `--read-width` (44.25rem, 708px, Notion's text column), centred; code blocks and tables take up to `--read-wide` (64rem), also centred, so hiding the sidebar or the panel gives them room. Above a Markdown view (a change's spec, notes and other Markdown files, an archived change, a prompt's Preview tab) the page's title block is the document's title, one component (`ColumnTitle` in `components/doc-title.tsx`): in the prose measure, 40px under the top row (`pt-10`), inside the scroll root so it scrolls with the document, which starts 24px under it (`pt-6 pb-10`). A change's block is its description and ID; a prompt's is its caption, name and description, so its name stands one caption line lower. The live editor uses the same widths per line, with 24px padding and 64px at the foot.
- **Code tabs:** a file shown as code (a workflow's YAML tab, a prompt's Prompt tab, a change's `change.yaml` tab) has one layout, one component (`components/code-tab.tsx`): the page's title block on the 24px gutter, 16px under the top row and 12px over a 1px rule (`px-6 pt-4 pb-3`, one component, `GutterTitle` in `components/doc-title.tsx`), not in the document column and never scrolling; under the rule the page's notices, each a full-width strip with its own rule below; then the code view on the whole width, its line numbers against the centre's left edge; then the footer with the file's name and its line count. Only the title block differs between the pages: a workflow's and a prompt's caption, name and description, a change's description and ID. Markdown tabs (a change's spec and notes, a prompt's Preview, an archived change) keep the document column and its title.
- **History tabs:** a workflow's and a prompt's History tab is one component (`HistoryTab` in `components/history.tsx`): the same gutter title block without the rule, the page's notices, the toolbar and the version's code or diff on the whole width, then the footer with the file's name. So the gutter title stands on a workflow's Editor (floating on the canvas, or above a file that cannot be drawn), YAML and History tabs, a prompt's Prompt and History tabs and a change's `change.yaml` tab; the document-column title on a prompt's Preview tab, a change's Markdown tabs and an archived change. No page pads a title block of its own.
- **Workflow canvas:** the whole centre, with the workflow's heading floating at its top-left (`px-6 pt-4`) and the drawing 24px under it. Cards are one column, 64px apart; an on-fail card stands 160px to the right of its step and 40px higher. The canvas opens at 100%, so its text is read at its size: the drawing's top 24px under the heading, centred across the canvas when it fits between 16px margins; a drawing too tall or too wide shows its top and left and is panned. Fit scales it down in 10% steps until it stands between the heading, the 16px side margins and a 68px band kept free at the bottom for the controls, no further than 50%; manual zoom runs 50 to 200% in 10% steps.

Breakpoints: 640px (progress bars on rows), 768px (sidebar becomes a sheet, the project column shows), 1024px (sidebar open by default), 1280px (panel docks, the project column widens). The build is checked at 768, 1280, 1440 and 1920px.

Spacing is Tailwind's 4px scale (`--spacing` 0.25rem). Padding, margins and gaps mostly use 4, 8, 12, 16, 20, 24, 28 and 32px; larger steps are 36px (band and row height), 40px (a document title's top padding, a member row's indent, the archived page foot), 48px (empty grid states), 64px (between canvas cards). 2px appears only as a hairline offset or inside a control (`gap-0.5` between sidebar rows, in the canvas controls, between a chip value's marks). Panel rows are `px-4 py-2`; task rows `px-3 py-4` with a rule between them. A document's rhythm is Notion's: 8px under a paragraph, 12px between list items, 32, 24 and 16px above an h1, h2 and h3 and 8px under them, 24px list indent.

## Elevation & Depth

Flat by default: regions are told apart by ground tone (window, document, sidebar/panel, band) and 1px rules (`--border`). Shadows appear only on what floats over the page.

### Shadow Vocabulary

- **xs** (`0 1px 2px 0 rgb(0 0 0 / 0.06)`): the canvas's round "+" buttons, icon tiles, the data grid's column-resize indicator.
- **sm** (`0 1px 2px 0 rgb(0 0 0 / 0.08), 0 1px 3px 0 rgb(0 0 0 / 0.1)`): the active segmented tab, the floating sidebar variant.
- **md** (`0 2px 4px -1px rgb(0 0 0 / 0.12), 0 8px 16px -4px rgb(0 0 0 / 0.18)`): popovers, menus, select lists, the canvas's controls pill and minimap.
- **lg** (`0 4px 8px -2px rgb(0 0 0 / 0.14), 0 16px 40px -8px rgb(0 0 0 / 0.28)`): sheets and submenus.
- **Next-task edge** (`inset 2px 0 0 var(--warning)`): not a shadow but a 2px amber edge on the next task.

Dialogs dim the page with `#000` at 10% and a 4px backdrop blur where supported. Menus, popovers and dialogs carry a 1px ring of the ink at 10% (`ring-foreground/10`) with their shadow.

### Named Rules

**The Flat Panel Rule.** The sidebar, the document, the panel, the bands and the workflow cards never cast shadows; a rule and a tone step separate them.

## Shapes

Conductor's radius scale (`@theme inline`, `--radius` 0.5rem):

- **sm 4px** (`rounded-sm`, also bare `rounded`): kbd, inline code (task text and documents), the copy button, avatar-letter tiles, the logo tile, focusable links, the checkbox (`rounded-[4px]`).
- **md 6px** (`rounded-md`, `calc(var(--radius) - 2px)`): sidebar rows, tooltips, segmented tab triggers, filter menu items, Now's Ready to archive chips; `sm` buttons and toggles use `min(var(--radius-md), 10px)` or `min(var(--radius-md), 12px)`, which both resolve to 6px; icon tiles use `min(var(--radius-md), size / 3)`.
- **lg 8px** (`rounded-lg`, `var(--radius)`): buttons, inputs, workflow cards, the canvas's add-step placeholder, the canvas controls and minimap, the outer corners of a filter chip, segmented tab lists, the split grips.
- **Document code 10px** (`--doc-code-radius` 0.625rem): code blocks in a document, after Notion; the one radius off the scale, kept to documents.
- **xl 12px** (`rounded-xl`): dialogs, the command palette, empty states.
- **2px** (`rounded-[2px]`): the status mark, the Problems dot, the tooltip arrow, minimap nodes.
- **3px and 5px**: kbd and buttons inside an input group (`calc(var(--radius) - 5px)`, `calc(var(--radius) - 3px)`).
- **full**: switches, avatars, the canvas's round "+" and on-fail pill, progress bars, the sidebar row's state bar.
- `--radius-2xl`, `-3xl`, `-4xl` (1.8, 2.2 and 2.6 times `--radius`) are defined by the shadcn theme and unused.

Rows in lists, bands, the top row, panel panes and document tabs are square: they sit edge to edge. Borders are 1px; the status mark's is 1.5px; a blockquote's left rule is 3px (`--input`).

## Components

### Buttons

Quiet, compact, ink on neutral.

- **Shape:** 8px radius; heights 32px (default), 28px (`sm`, 0.8rem text), 24px (`xs`, `text-xs`), square icon sizes 24, 28, 32 and 36px.
- **Default:** ink fill with the on-ink text, 80% on hover.
- **Outline:** a `--border` rule on the document ground (dark: `--input` rule on `--input` at 30%), muted on hover. The most used variant with Ghost.
- **Ghost:** no fill; muted on hover (dark: muted at 50%).
- **Destructive:** red text on red at 10% (dark 20%), 20% (dark 30%) on hover.
- **Focus:** `--ring` border and a 3px ring of `--ring` at 50%. Press nudges the button down 1px.

### Chips and badges

- **Style:** the ReUI badge, 20px tall, `text-xs` 500, 4px radius. The dashboard uses `outline` (a rule, no fill), `secondary`, and the tinted `destructive-light` (the state colour at 10% with a 15% rule; dark 15% and 25%).
- **Status pill** (panel header): no fill, the status mark then its label in the state colour, `text-sm` 500.
- **Ready to archive chips** (Now): a project's name and its count in green 500, `text-sm`, 1px rule, 6px radius, `px-3 py-1`, accent on hover.

### Filter bar

The ReUI `filters` bar, the same on every list page.

- **Row:** the search field (28px tall, 208px from 640px), then the chips, then an outline `sm` **Filter** button that opens a searchable menu of fields, then **Clear**, which removes the chips and keeps the search.
- **Chip** (`Field is value ×`): a button group of joined 28px segments on the document ground (dark: `--input` at 30%) with 1px rules and 8px outer corners: the field's icon and label at 500, the condition ("is", "is not") in dim ink, the values with their marks, and a remove button in dim ink. Segments take the accent on hover.
- **Value menu:** 256px wide, a search, then one checkbox per value with its count in Geist Mono `text-xs` dim ink at the right; at most 288px tall, scrolling.
- **Result line:** `N of M <nouns>` in `text-xs` dim ink, in a `role="status"` region, only while the list is narrowed.
- **Empty state:** one alert row naming the search and the filters in use, with an outline **Clear filters** button.

### Grouped lists

- **Band:** each status group (and each archive month) opens with a full-width 36px band on `--band`, sticky under the top row. One button holds a 16px chevron in dim ink (turned 90° while open), the status mark, the label in `text-sm` 500 and its count in 400 dim ink. Hover takes the accent at 50%; focus shows a 2px inset ring. Collapsed state is kept per page and group in this browser; Alt-click (⌥ on macOS) toggles every group, and a `text-xs` hint under the list says so. Ready to archive and older archive months start collapsed. An archive month counts the month: `12 of 98` when the page lists only its newest.
- **Header row:** one per list page, 32px with a 1px rule below, above the first band (or the first row), not sticky: the columns' titles in the grid header style (`text-xs`, third ink), each on the edge its cells keep (a right-aligned title ends where its values end), and the columns' resize lines. Change lists title their columns Change, Project, Progress and Updated, archive bands included (an archived change shows its archive date under Updated, and nothing under Progress). A list that shows no open change as a row (a project or group with only archived changes, the whole archive with `?archive`, Now filtered to Archived or holding only Ready to archive, which it counts by project) has no Progress column at all: no title, no cells, no resize line. The column comes back with the first open row. On a page of bands the header row is a grid of its own that shares the bands' column sizes; each band's grid keeps its column headers for assistive technology only.
- **Row:** a grid row, at least 36px tall, with the 24px gutters and no divider; its head (the ID over the text) is the link, and a click elsewhere in the row follows it. Hover fills with the accent at 40%, focus with the accent and a 2px inset ring, both to the page's edge. The ID in Geist Mono `text-sm` ink over the text in `text-sm` dim ink, each on one line, truncating, then the right-hand columns (Layout). Actions (pin, menu) stay visible at rest. Workflows and Prompts rows are the same row: the file's name in mono (the `default` badge beside it) over its description.
- **Opening row:** a series on Now or a group on All projects is one row with a 14px chevron (right when closed, down when open) hanging in the 24px gutter, 5px before its ID, so every row's ID starts on the gutter's edge, opening or not. Its members are indented 40px from that edge, along a 1px `--border` guide line under the chevron, 12px from the left.
- **Progress:** a 96px × 4px bar on `--border`, filled amber while in progress (`--warning`, the brighter fill amber in light), green when every task is done, red while invalid; `done/total` after it in mono. The column stands 12px off the rule at its left.

### Cards / Containers

- **Workflow card:** the only card. 300 × 72px (an on-fail card 232px wide), `--card` fill, 1px rule, 8px radius, 12px side padding, no shadow. A 24px first row holds a 24px icon tile tinted in its `--tone-*` and the name in `text-sm` 500 (mono for a code step) on the row's whole width; a 20px second row holds the `N errors` badge, one muted `text-xs` description line from the card's left edge, and the outline badges (`agents · opus`, `matrix · 5`) at its right end. Hover fills with the accent; selected has a border of the ink at 60% and a 4px ring of the ink at 10%; a card with errors has a red border (its selected ring red at 20%); an on-fail card has a dashed `--input` border. Focus shows a 2px `--ring` outline offset 2px. Its accessible name is its label and badges, described by its second row.
- **Add-step placeholder:** the card's size, a dashed ink border, `--card` at 50%, a 16px plus in dim ink.
- **Everything else is not a card:** lists, panels and documents sit on their ground with rules.

### Workflow canvas

Built on React Flow (`@xyflow/react`), its base styles in their own CSS layer.

- **Ground:** `--canvas` with a dot grid, 16px apart, 1.5px dots in `--canvas-dot`.
- **Edges:** smooth-step lines, 1.5px, `--muted-foreground` at 50%, with small closed arrowheads. Connection handles are hidden: steps are not joined by hand.
- **Add a step:** a round 20px outline "+" on `--card` (dark: on the accent) with shadow xs, shown at rest on every line between two cards and under the last one, centred between the card above and the arrowhead.
- **On-fail:** a dashed (5 5) edge in red at 60% to the on-fail card, with a 20px pill at its bend: `on fail · tries N` in `text-xs` red on `--card`, a red rule at 40%, fully rounded.
- **Controls:** a floating 36px pill at the bottom centre, 16px from the edge: `--card`, 1px rule, 8px radius, shadow md, holding undo, redo, zoom out, the percentage (`text-xs` tabular, 48px), zoom in and Fit (down to 50%), with 16px vertical separators.
- **Minimap:** shown when the drawing overflows the view, at the bottom right: 160 × 100px, `--card`, 1px rule, 8px radius, shadow md; nodes in `--input` (the selected one in the dim ink) with 2px corners, the area outside the view masked by `--background` at 55%. On a canvas narrower than 640px it sits above the controls.
- **Attribution:** React Flow's link at the bottom left, on the 24px gutter, `text-xs` in the dim ink on no background.

### Documents

- **Read view:** the live editor, read-only: Markdown at the document scale (Typography) and widths (Layout), in `--doc-foreground`. A heading is exposed as a heading of its level. List markers are dim ink; a blockquote is dim ink with a 3px `--input` left rule and 16px padding; a horizontal rule is `--border`.
- **Inline code:** 85% Geist Mono on `--doc-code-tint`, `0.2em 0.4em` padding, 4px radius, in the text colour.
- **Code block:** on `--code-surface`, 10px radius, `16px 20px` padding, 85% mono at line height 1.5, syntax colours from `--code-*`. Its lines wrap, in the read view and the live editor alike: nothing scrolls sideways, and a wrapped line continues 2ch further in than it starts (a hanging indent, as a list item's later lines hang past its marker), so a continuation never reads as a new line. Its fence lines stay, in dim ink; the language is named at the right of the first one, in mono `text-xs` dim ink.
- **Table:** in a wrapper that scrolls sideways (focusable in the read view, so it scrolls from the keyboard); full width of its room, a 1px `--border` around and between cells, cells `0.5em 0.75em` aligned to the top, the header row on `--muted` at 600, tabular numbers. In the live editor, inline code in a cell may break anywhere.
- **Live editor:** CodeMirror with the same scale, colours, widths and blocks as the read view; a blank line is 8px; task boxes are 13px in `--link`; fence lines are dim ink. A paragraph flows as one, its source line breaks joined, except the paragraph the cursor is in while the editor has the focus, which shows as written.
- **Footer:** a 28px bar under a document (`h-7`, rule above, `px-6`), `text-xs` dim ink: the file's name in mono, its details after a `·`, the save state at the right. A code tab and a change's Markdown file give the draft's line count (`121 lines`, `tabular-nums`), an archived change its archive date.

### Inputs / Fields

- **Style:** 32px tall, transparent fill, `--input` rule, 8px radius, `text-sm` text (`text-base` below 768px), the placeholder in the third ink (a select's too). The filter bar's search is 28px tall.
- **Focus:** `--ring` border and a 3px ring of `--ring` at 50%.
- **Error:** red border and a red ring at 20% (dark 40%).
- **Checkbox:** 16px, 4px radius, a dim-ink rule; checked fills with the ink and shows a check in the document colour. Radios and switches fill with the ink when on.

### Navigation

- **Sidebar rows:** 32px, `text-sm`, 6px radius, 8px padding, hover on `--sidebar-accent`; the active row is `--sidebar-accent` and 500. A row's 16px icon stands in a 20px slot, the size of a project's letter tile, so every icon shares one centre line and every label one edge. Group labels (Pinned, Recent, Library) are `text-xs` 500 in the third ink. A row's count is Geist Mono `text-xs` dim ink with tabular numbers, right-aligned in a slot at least 24px wide that ends on one edge for every row, a group's projects included; a group's chevron stands in the 24px slot left of its count. A 2px rounded bar at the row's left edge carries state (red when a project has broken files). In the icon rail, rows show only their icon.
- **Document tabs** (the centre's top row): `text-sm`, 16px side padding, full row height. Inactive tabs are dim and turn to ink on hover; the active tab is ink, 500, with a 2px ink underline. Focus shows a 2px inset ring.
- **Panel tabs:** the same underlined style in a 40px row, 8px side padding, the underline on the row's rule; a tab may carry a count in dim ink (Series, Problems), never one the panel's header already shows. A pane's content shows a 2px `--ring` outline inside its edge when it takes the keyboard focus.
- **Command palette** (⌘K / Ctrl+K): a 12px-radius dialog on `--popover`, opened a third of the way down.
- **Mobile:** below 768px the sidebar is a sheet and the panel is always a sheet.

### Panel split and resize edges

- **Split:** the panel's top and bottom panes are a vertical react-resizable-panels split. The separator is a 1px `--input` line with a 4 × 24px grip in the dim ink, seen at rest; it tints to the ink at 40% on hover and 60% while dragged, and shows a 1px `--ring` ring on focus. It resizes by pointer or keyboard and resets on double-click. The top pane keeps at least 20%; the bottom pane collapses to its 40px tab row, by dragging or by a chevron at its right, and a tab chosen there opens it again. The layout is kept per kind of panel (change, change details, workflow, workflow step, prompt). The top pane's default share is 60% (a workflow: 70%, or 50% while a step's prompt shows).
- **Panel edge:** the panel's left edge carries the same 1px `--input` line and 4 × 24px grip at rest, tinting to the ink at 40% on hover.
- **Markdown editor split:** the source and preview columns are split by the same visible grip.
- **Step prompt pane:** a 40px row with the prompt's `<name>.md` in mono `text-xs` dim ink, "Shared by N workflows" when it is, and **Open prompt** at the right; under it, the prompt's front matter as fields and its body read-only at the document scale.

### Status mark

The signature element. An 8px square (`size-2`) with a 2px radius and a 1.5px border, drawn in CSS:

- **Not started:** hollow, dim ink rule.
- **In progress:** amber rule, left half filled amber (`linear-gradient(90deg, var(--warning) 50%, transparent 50%)`).
- **Ready to archive:** filled green.
- **Invalid:** filled red.
- **Archived:** filled dim ink at 60%.

It appears on group bands, in the Status filter's values, in the panel's status pill, in the file status pill (Valid or N errors) and, before `Valid`, in the Status cells of the Workflows and Prompts lists (a file with errors shows the `N errors` badge there).

### Task row

The panel's Tasks list: a 12px mono number line (with "Next" in the text amber at 500), the lead in `text-md` 500 ink, the detail in `text-sm` dim ink, clamped to 3 lines with Show more. The next task is shown in full with a 2px amber inset edge and an amber 5% tint. The checkbox and the drag grip sit level with the lead's first line; the grip and the row's menu are visible at rest. Done tasks fold to "N done".

### Motion

- Hover and state changes: 150ms `cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind's default), mostly `transition-colors`, including the split grips.
- Overlays: fade and zoom from `tw-animate-css`, 100ms for dialogs, menus and popovers, 150ms for sheet opacity; the sidebar's width 200ms linear.
- Bands: the chevron turns 90° (`transition-transform`) when a group opens. Row chevrons swap between right and down without motion.
- Canvas: fit, zoom and pan change the viewport at once, with no animation.
- Reduced motion: transitions are limited to opacity and colours, and overlays no longer scale, slide or rotate.

## Do's and Don'ts

### Do

- **Do** take colours from the tokens (`bg-background`, `text-muted-foreground`, `border-border`), never literal hex, so both themes follow.
- **Do** keep amber, green and red for state, and draw the status mark with `StatusMark`.
- **Do** set interface hierarchy with 600 against 400 and ink against dim ink, inside `text-sm` and `text-xs`; only a workflow's title and a document's title use `text-title`.
- **Do** keep the third ink (`text-subtle-foreground`) for what labels the page (group labels, column headers, hints, placeholders), and the dim ink for a row's own text.
- **Do** fill with `--warning` and write amber text with `--warning-foreground`.
- **Do** set documents with the `--text-doc*` scale and `--doc-foreground`, prose at most `--read-width` (708px) and code blocks and tables up to `--read-wide` (64rem).
- **Do** keep every page's top row at 44px so it lines up with the panel's header.
- **Do** put a document's facts in the panel header and its Details tab, not above the title.
- **Do** separate groups of a list with one sticky `--band` band, not with gaps or dividers, and keep its collapsed state per page.
- **Do** start every list row with its ID or name in Geist Mono `text-sm` on the gutter's edge, over its text in dim ink, and use the shared filter bar on every list page.
- **Do** cap a list's columns (`LIST_CAP`) and let its bands, its header's rule and its rows' hover run to the page's edge.
- **Do** show focus with `--ring`: a 2px ring on custom rows and tabs, the component's 3px ring at 50% on buttons and fields.
- **Do** use Geist Mono `text-xs` with `tabular-nums` for counts and `done/total`.

### Don't

- **Don't** use the blue for primary buttons, active tabs, checked controls or document links; those are ink.
- **Don't** put cards, frames or shadows on the page ground; the workflow card is the only card.
- **Don't** add interface text sizes beyond 12, 14 and the 21px title, or document sizes beyond 16, 20, 24 and 30; never go under 12px outside the vendored badge sizes.
- **Don't** hide IDs, actions, grips or the canvas's "+" behind hover; they are visible at rest.
- **Don't** show counts that repeat what the page already shows.
- **Don't** show the command to run next; the user removed it from every page.
- **Don't** use the brand amber anywhere but the logo.
- **Don't** load fonts, scripts or images from another host; the CSP allows only the dashboard's own.
