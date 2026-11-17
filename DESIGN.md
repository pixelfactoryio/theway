---
name: theway dashboard
description: The local web view of a theway home, built as a dark-first desktop app after Conductor.
colors:
  # Dark theme (designed first): `:root[data-theme="dark"]` and `prefers-color-scheme: dark`.
  window-dark: "#131314"
  document-dark: "#141415"
  sidebar-panel-dark: "#18181a"
  card-dark: "#1c1c1f"
  popover-dark: "#1f1f22"
  muted-dark: "#222225"
  selection-dark: "#252528"
  rule-dark: "#262628"
  canvas-dot-dark: "#2c2c30"
  input-rule-dark: "#343438"
  dim-ink-dark: "#8d8d93"
  ink-dark: "#ececee"
  link-blue-dark: "#6aa7ff"
  done-green-dark: "#45b97c"
  progress-amber-dark: "#e3a43f"
  invalid-red-dark: "#ef6a5b"
  brand-amber-dark: "#f5a74b"
  code-keyword-dark: "#ff7b72"
  code-string-dark: "#a5d6ff"
  code-constant-dark: "#79c0ff"
  code-property-dark: "#7ee787"
  tone-inputs-dark: "oklch(74.6% 0.16 232.661)"
  tone-session-dark: "oklch(77.7% 0.152 181.912)"
  tone-agents-dark: "oklch(78.5% 0.115 274.713)"
  tone-on-fail-dark: "oklch(71.2% 0.194 13.428)"
  # Light theme: `:root`, the same roles on a near-white ground.
  document-light: "#ffffff"
  window-light: "#f1f1f2"
  sidebar-panel-light: "#f6f6f7"
  muted-light: "#f0f0f2"
  secondary-light: "#ececee"
  selection-light: "#e9e9ec"
  rule-light: "#e4e4e7"
  input-rule-light: "#d4d4d8"
  dim-ink-light: "#63636b"
  ink-light: "#18181b"
  link-blue-light: "#2563c9"
  info-ink-light: "#1f55ad"
  done-green-light: "#1a7044"
  progress-amber-light: "#8f5407"
  invalid-red-light: "#c2392c"
  invalid-ink-light: "#b02f23"
  brand-amber-light: "#b4650f"
  code-keyword-light: "#b0322a"
  code-string-light: "#0a3d75"
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
  heading:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  editor-heading:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  reading:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  task-lead:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.3125rem"
  grid-header:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  button-small:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.8rem"
    fontWeight: 500
  small:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  label:
    fontFamily: '"SF Pro", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.025em"
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
  "10": "40px"
  "12": "48px"
  "14": "56px"
  "40": "160px"
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
    padding: "8px 8px 8px 12px"
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
  workflow-card:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
    padding: "12px"
    width: "320px"
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

It is built for Operate: dense, quiet chrome, neutral near-black greys, hierarchy from weight and ink before size. Colour carries state (amber In progress, green Ready or Valid, red Invalid or errors) and the one blue goes to links, focus and the text caret. The stock shadcn card dashboard is the anti-reference: no cards on the page ground, no shadows on panels, no decorative colour.

Dark is designed first and light is the same system on a near-white ground. The theme follows the system setting unless the user picks Light or Dark in Settings (`data-theme` on `html`).

**Key Characteristics:**

- Three columns: a 272px sidebar, the document, a 420px panel (320 to 640px, resizable) docked from 1280px.
- A 44px top row on every page; the panel's header is level with it.
- Conductor's type scale: 14/20 body, 12/16 small, a 21/29 semibold title; system font for the interface, Geist Mono for code.
- Hairline rules separate regions; shadows only on things that float.
- An 8px CSS square marks status everywhere it appears.

## Colors

Neutral near-black greys in dark, near-white greys in light, three state colours and one blue. Values live as CSS custom properties in `src/dashboard/client/styles/globals.css` (`:root` for light, the dark block twice: under `prefers-color-scheme: dark` and under `:root[data-theme="dark"]`), mapped to Tailwind colours by `@theme inline`.

### Primary

- **Link Blue** (dark `#6aa7ff`, light `#2563c9`): `--link`, `--ring`, `--info`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1`. Links in Markdown, focus rings and outlines, the text caret, the text selection (`--link` at 32% through `color-mix`), the code view's selection and matches (`--ring` at 30 to 35%). Light `--info-foreground` is the darker `#1f55ad` (also `--code-constant`).

### Secondary

State colours, used for state only:

- **Progress Amber** (dark `#e3a43f`, light `#8f5407`): `--warning`, `--warning-foreground`, `--chart-3`. In progress, the Next task (its number label, its 2px inset edge, a 5% tint), warnings.
- **Done Green** (dark `#45b97c`, light `#1a7044`): `--success`, `--success-foreground`, `--chart-2`. Ready to archive, Valid.
- **Invalid Red** (dark `#ef6a5b`, light `#c2392c`): `--destructive`, `--chart-4`. Invalid, errors, destructive actions. Light `--destructive-foreground` is `#b02f23` for red text; in dark it equals `--destructive`.

### Tertiary

- **Brand Amber** (dark `#f5a74b`, light `#b4650f`): `--brand`, only the logo's route mark, on a 15% tint of itself.
- **Step tones**: `--tone-inputs`, `--tone-session`, `--tone-agents`, `--tone-on-fail`, the icon tints of the workflow canvas's card kinds. Identity, not state, and none of them amber. Light uses Tailwind's `sky-700`, `teal-700`, `indigo-600`, `rose-700`; dark uses `sky-400`, `teal-400`, `indigo-300`, `rose-400` (the oklch values in the frontmatter).
- **Code syntax** (`--code-*`, the YAML code view): keyword dark `#ff7b72` / light `#b0322a`, string `#a5d6ff` / `#0a3d75`, constant `#79c0ff` / `#1f55ad`, property `#7ee787` / `#1a6640`, comment `#8d8d93` / `#63636b` (the dim ink).

### Neutral

| Role | Token | Dark | Light |
|---|---|---|---|
| Window ground (`body`) | `--ground` | `#131314` | `#f1f1f2` |
| Document | `--background` | `#141415` | `#ffffff` |
| Sidebar and panel | `--sidebar` | `#18181a` | `#f6f6f7` |
| Workflow canvas | `--canvas` | `#141415` | `#f6f6f7` |
| Canvas dots | `--canvas-dot` | `#2c2c30` | `#d4d4d8` |
| Cards | `--card` | `#1c1c1f` | `#ffffff` |
| Menus, dialogs, palette | `--popover` | `#1f1f22` | `#ffffff` |
| Muted fill (kbd, table heads, code) | `--muted` | `#222225` | `#f0f0f2` |
| Secondary fill | `--secondary` | `#252528` | `#ececee` |
| Hover and selection | `--accent`, `--sidebar-accent` | `#252528` | `#e9e9ec` |
| Rules | `--border`, `--sidebar-border` | `#262628` | `#e4e4e7` |
| Input rules, scrollbar thumb | `--input` | `#343438` | `#d4d4d8` |
| Dim ink | `--muted-foreground`, `--chart-5` | `#8d8d93` | `#63636b` |
| Ink | `--foreground`, `--primary` | `#ececee` | `#18181b` |
| On ink | `--primary-foreground`, `--invert-foreground` | `#131314` | `#ffffff` |

`--primary` is the ink, not a colour: a default button, a checked checkbox, radio and switch, and the active tab's underline are all ink.

Fixed values shared by both themes:

- `#000` at 10% (`bg-black/10`): the dim behind dialogs, alert dialogs and sheets.
- `#fff` (`text-white`): text on the vendored solid badge variants (`info`, `success`, `warning`, `destructive`); the dashboard uses the `-light` and `outline` variants instead.
- Shadow inks: `#000` at 3% to 28% in the shadow scale and the data grid's sticky edges (`rgba(0,0,0,0.03)`), `#fff` at 6% for those edges in dark, `#0008` as the drop shadow of the number field's scrub cursor, `rgb(0 0 0 / 0.14)` under the vendored elevated icon tile, and `shadow-black/5` / `shadow-white/5` inside the vendored frame.
- The data grid's row states: `amber-500` and `green-500` at 5% (dirty, new) and `--destructive` at 5% (deleted).

### Named Rules

**The State Is Colour Rule.** Amber, green and red mean In progress, Ready or Valid, and Invalid or error. Nothing decorative takes them, and the pinned star is ink, not amber.

**The Ink Is Primary Rule.** Primary actions, checked controls and the active tab are drawn in the ink. The blue is kept for links, focus and the caret.

## Typography

**Interface Font:** `"SF Pro", system-ui, sans-serif` (`--font-sans`, also `--font-heading`): SF Pro on macOS, the system font elsewhere. Nothing is downloaded for it.
**Code Font:** `"Geist Mono Variable", ui-monospace, monospace` (`--font-mono`), served by the dashboard at `/fonts/geist-mono.woff2` (weights 100 to 900, embedded by `scripts/embed-fonts.ts`).

**Character:** a native app's system face for everything you read and click, and a monospace for what you would type: IDs, paths, counts beside a row, code, YAML.

Base: 16px root (`text-base` 1rem). Text inputs are `text-base` below 768px and `text-sm` from 768px.

### Hierarchy

- **Title** (600, `text-title` 1.3125rem/1.8125rem, 21/29px, tracking -0.025em): a change's description, a workflow's or prompt's name. The change title is at most 40rem wide.
- **Heading** (600, `text-heading` 0.875rem/1.25rem): a list page's title in its top row, set apart by weight, not size.
- **Editor heading** (600, 1rem): a Markdown `#` in the live editor, and `prose-h2` (`text-base`) in the read view, where `#` reads one level down. `##` and `###` are 600 at 0.875rem; `####` and deeper are 0.875rem in the dim ink.
- **Body** (400 or 500, `text-sm` 0.875rem/1.25rem): every row, tab, button, menu item, panel line and field.
- **Reading** (400, 0.875rem/1.5rem): the Markdown live editor, at most 40rem (`.cm-content`, 640px) wide; Markdown tables are 0.875rem/1.25rem.
- **Task lead** (500, `text-md` 0.875rem/1.3125rem, 14/21): the lead of each task in the panel; its detail is `text-sm` 14/20 in the dim ink.
- **Small** (400 or 500, `text-xs` 0.75rem/1rem): counts and ages beside rows, tooltips, kbd, badges, secondary lines.
- **Label** (500, `text-xs`, tracking 0.025em, uppercase): the month headings of a project's archive.
- **Grid header** (400, 0.8125rem, line height 1.125/0.8125): the vendored data grid's column headers on the Workflows and Prompts lists.
- **Small button** (500, 0.8rem): the vendored `sm` button and toggle size.
- **Badge micro and tiny** (500, 0.6rem and 0.625rem, line height 1): the vendored badge's `xs` and `sm` sizes. The dashboard's badges use the default size (`text-xs`).
- **Code** (Geist Mono, 0.875rem/1.5rem): the YAML code view. Inline code and IDs are Geist Mono `text-xs` (0.75rem); a code span in the Markdown editor, the read view and task text sits on `--muted` with a 4px radius and 4px side padding.

Weights: 400, 500, 600 in the interface; the code view's headings use `bold`. Numbers that line up (counts, progress, line counts, task numbers) use `tabular-nums`. The logo's "theway" is 600 `text-sm` with tracking -0.025em.

### Named Rules

**The Weight Before Size Rule.** Hierarchy comes from 600 against 400 and ink against dim ink, inside two sizes (14 and 12). Only the document title is larger.

## Layout

The window is three columns at full height (`h-svh`) with no page scroll; each region scrolls itself.

- **Sidebar:** 17rem (272px) on `--sidebar`, open by default from 1024px (kept per browser after a toggle), a sheet below 768px (`use-mobile`). Rows are 32px (`h-8`) with 2px gaps; group labels are 28px.
- **Centre:** the document on `--background`. Every page starts with a 44px top row (`h-11`, rule below) holding the page title or the document's tabs, and the sidebar button when the sidebar is hidden.
- **Panel:** docked at the right from 1280px, 420px by default, resizable from 320 to 640px by its left edge or the arrow keys (16px a step), its width and hidden state kept per browser. Below 1280px it opens over the page as a sheet, `min(420px, 90vw)` wide. Its header row is 44px; under it two panes, each with a 40px tab row.
- **List pages** (Now, All projects, a project, Workflows, Prompts): a column at most 65rem wide with 28px gutters (`px-7`) and 20px top padding. Below 1280px the Prompts grid hides Model and Used by.
- **Document pages:** content with 56px gutters (`px-14`); the reading column is `max-w-[47rem] px-14`, so text runs at most 40rem (640px). Change titles sit `pt-6 pb-4`.
- **Workflow canvas:** a column of 320px cards (`w-80`) on a 16px dot grid. It opens fitted, never below 80%; manual zoom runs 50 to 200% in 10% steps. The zoom toolbar sits in its own band under the cards.

Breakpoints: 768px (sidebar becomes a sheet), 1024px (sidebar open by default), 1280px (panel docks, Prompts shows all columns). The build is checked at 768, 1440 and 1920px.

Spacing is Tailwind's 4px scale (`--spacing` 0.25rem). Padding, margins and gaps mostly use 4, 8, 12, 16, 20, 24, 28 and 32px; larger steps are 40px (archived page foot), 48px (empty grid states, the canvas's top and side padding), 56px (document gutters) and 160px (the canvas's bottom padding). 2px appears only as a hairline offset (`gap-0.5` between sidebar rows). Panel rows are `px-4 py-2`; task rows `px-3 py-4` with a rule between them.

## Elevation & Depth

Flat by default: regions are told apart by ground tone (window, document, sidebar/panel) and 1px rules (`--border`). Shadows appear only on what floats over the page.

### Shadow Vocabulary

- **xs** (`0 1px 2px 0 rgb(0 0 0 / 0.06)`): workflow cards, icon tiles, the data grid's column-resize indicator.
- **sm** (`0 1px 2px 0 rgb(0 0 0 / 0.08), 0 1px 3px 0 rgb(0 0 0 / 0.1)`): the canvas zoom toolbar, the active segmented tab, the floating sidebar variant.
- **md** (`0 2px 4px -1px rgb(0 0 0 / 0.12), 0 8px 16px -4px rgb(0 0 0 / 0.18)`): popovers, menus, select lists.
- **lg** (`0 4px 8px -2px rgb(0 0 0 / 0.14), 0 16px 40px -8px rgb(0 0 0 / 0.28)`): sheets and submenus.
- **Next-task edge** (`inset 2px 0 0 var(--warning)`): not a shadow but a 2px amber edge on the next task.

Dialogs dim the page with `#000` at 10% and a 4px backdrop blur where supported.

### Named Rules

**The Flat Panel Rule.** The sidebar, the document and the panel never cast shadows; a rule and a tone step separate them.

## Shapes

Conductor's radius scale (`@theme inline`, `--radius` 0.5rem):

- **sm 4px** (`rounded-sm`, also bare `rounded`): kbd, inline code, the copy button, avatar-letter tiles, the logo tile, focusable links, the checkbox (`rounded-[4px]`).
- **md 6px** (`rounded-md`, `calc(var(--radius) - 2px)`): sidebar rows, tooltips, segmented tab triggers; `sm` buttons and toggles use `min(var(--radius-md), 10px)` or `min(var(--radius-md), 12px)`, which both resolve to 6px; icon tiles use `min(var(--radius-md), size / 3)`.
- **lg 8px** (`rounded-lg`, `var(--radius)`): buttons, inputs, workflow cards, the canvas's add-step placeholder, segmented tab lists.
- **xl 12px** (`rounded-xl`): dialogs, the command palette, empty states.
- **2px** (`rounded-[2px]`): the status mark, the Problems dot, the tooltip arrow.
- **3px and 5px**: kbd and buttons inside an input group (`calc(var(--radius) - 5px)`, `calc(var(--radius) - 3px)`).
- **full**: switches, avatars, canvas connector dots, the sidebar row's state bar.
- `--radius-2xl`, `-3xl`, `-4xl` (1.8, 2.2 and 2.6 times `--radius`) are defined by the shadcn theme and unused.

Rows in lists, the top row, panel panes and document tabs are square: they sit edge to edge on rules. Borders are 1px; the status mark's is 1.5px.

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

- **Style:** the ReUI badge, 20px tall, `text-xs` 500, 4px radius. The dashboard uses `outline` (a rule, no fill), `secondary`, and the tinted `destructive-light` and `success-light` (the state colour at 10% with a 15% rule; dark 15% and 25%).
- **Status pill** (panel header): no fill, the status mark then its label in the state colour, `text-sm` 500.

### Cards / Containers

- **Workflow card:** the only card. 320px wide, `--card` fill, 1px rule, 8px radius, 12px padding, shadow xs. Hover tints with the accent at 50%; selected adds an ink border and a 1px ink ring; a card with errors has a red border. Its kind shows as a tinted icon tile in its `--tone-*`.
- **Everything else is not a card:** lists, panels and documents sit on their ground with rules.

### Inputs / Fields

- **Style:** 32px tall, transparent fill, `--input` rule, 8px radius, `text-sm` text (`text-base` below 768px), dim placeholder.
- **Focus:** `--ring` border and a 3px ring of `--ring` at 50%.
- **Error:** red border and a red ring at 20% (dark 40%).
- **Checkbox:** 16px, 4px radius, a dim-ink rule; checked fills with the ink and shows a check in the document colour. Radios and switches fill with the ink when on.

### Navigation

- **Sidebar rows:** 32px, `text-sm`, 6px radius, hover on `--sidebar-accent`; the active row is `--sidebar-accent` and 500. A row's value (a count) sits at the right in `text-xs` dim ink, in Geist Mono on the Now, project and group rows. A 2px rounded bar at the row's left edge carries state (red when a project has broken files).
- **Document tabs** (the centre's top row): `text-sm`, 16px side padding, full row height. Inactive tabs are dim and turn to ink on hover; the active tab is ink, 500, with a 2px ink underline. Focus shows a 2px inset ring.
- **Panel tabs:** the same underlined style in a 40px row, 8px side padding, with a count in dim ink.
- **Command palette** (⌘K / Ctrl+K): a 12px-radius dialog on `--popover`, opened a third of the way down.
- **Mobile:** below 768px the sidebar is a sheet and the panel is always a sheet.

### Status mark

The signature element. An 8px square (`size-2`) with a 2px radius and a 1.5px border, drawn in CSS:

- **Not started:** hollow, dim ink rule.
- **In progress:** amber rule, left half filled amber (`linear-gradient(90deg, var(--warning) 50%, transparent 50%)`).
- **Ready to archive:** filled green.
- **Invalid:** filled red.
- **Archived:** filled dim ink at 60%.

It appears in rows, the panel's status pill and the file status pill (Valid or N errors).

### Task row

The panel's Tasks list: a 12px mono number line (with "Next" in amber 500), the lead in `text-md` 500 ink, the detail in `text-sm` dim ink, clamped to 3 lines with Show more. The next task is shown in full with a 2px amber inset edge and an amber 5% tint. The checkbox and the drag grip sit level with the lead's first line; the grip shows on hover or focus. Done tasks fold to "N done".

### Motion

- Hover and state changes: 150ms `cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind's default), mostly `transition-colors`.
- Overlays: fade and zoom from `tw-animate-css`, 100ms for dialogs, 150ms for sheet opacity; the sidebar's width 200ms linear. Chevrons turn 90° when a group opens.
- Reduced motion: transitions are limited to opacity and colours, and overlays no longer scale, slide or rotate.

## Do's and Don'ts

### Do

- **Do** take colours from the tokens (`bg-background`, `text-muted-foreground`, `border-border`), never literal hex, so both themes follow.
- **Do** keep amber, green and red for state, and draw the status mark with `StatusMark`.
- **Do** set hierarchy with 600 against 400 and ink against dim ink, inside `text-sm` and `text-xs`; only document titles use `text-title`.
- **Do** keep every page's top row at 44px so it lines up with the panel's header.
- **Do** put a document's facts in the panel header and its Details tab, not above the title.
- **Do** keep text columns at most 40rem and list columns at most 65rem.
- **Do** show focus with `--ring`: a 2px ring on custom rows and tabs, the component's 3px ring at 50% on buttons and fields.
- **Do** use Geist Mono `text-xs` with `tabular-nums` for IDs, counts and ages.

### Don't

- **Don't** use the blue for primary buttons, active tabs or checked controls; those are ink.
- **Don't** put cards, frames or shadows on the page ground; the workflow card is the only card.
- **Don't** add a size between 14 and 21px for interface text, or go under 12px outside the vendored badge sizes.
- **Don't** show the command to run next; the user removed it from every page.
- **Don't** use the brand amber anywhere but the logo.
- **Don't** load fonts, scripts or images from another host; the CSP allows only the dashboard's own.
