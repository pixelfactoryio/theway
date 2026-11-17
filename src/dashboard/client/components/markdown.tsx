import {
  Children,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react"
import Markdown, { type Components, type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Checkbox } from "@/components/ui/checkbox"
import { headingTag, isLinkTarget } from "@/lib/changes"
import { codeLabel, codeTokens } from "@/lib/code-languages"

/** The first source line of a block, from react-markdown's node position. */
const line = (props: ExtraProps): number | undefined => props.node?.position?.start.line

/** What ticking a task item's box does: edit the source line `line` (from 1); `null` keeps the boxes read-only. */
const ToggleContext = createContext<((line: number, checked: boolean) => void) | null>(null)

/** A GFM task item's box: the shipped checkbox, enabled when the view takes `onToggle` and the item's line is known. */
function TaskBox({ checked, line: at }: { checked?: boolean; line?: number }) {
  const onToggle = useContext(ToggleContext)
  const done = checked === true
  const enabled = onToggle !== null && at !== undefined
  return (
    <Checkbox
      checked={done}
      disabled={!enabled}
      onCheckedChange={enabled ? (next) => onToggle(at, next === true) : undefined}
      aria-label={done ? "Done" : "Not done"}
      className="mt-1 shrink-0"
    />
  )
}

/** An `input` of the Markdown: GFM's task boxes only. */
function TaskInput(props: ComponentProps<"input"> & ExtraProps) {
  const input = { ...props }
  delete input.node
  return input.type === "checkbox" ? <TaskBox checked={input.checked} /> : <input {...input} />
}

function heading(depth: number) {
  const Tag = headingTag(depth) as "h2"
  return function Heading({ node, children, ...props }: ComponentProps<"h1"> & ExtraProps) {
    return (
      <Tag {...props} data-line={line({ node })} data-level={depth}>
        {children}
      </Tag>
    )
  }
}

const isBox = (c: ReactNode): c is ReactElement<{ checked?: boolean }> => isValidElement(c) && c.type === TaskInput

/**
 * A task item's box and the rest of its content. A tight list puts the box among the item's children; a loose one (items
 * separated by blank lines) puts it first in the item's first paragraph, from which it is taken out.
 */
function takeBox(children: ReactNode): { box: ReactElement<{ checked?: boolean }> | undefined; content: ReactNode[] } {
  const items = Children.toArray(children)
  const at = items.findIndex(isBox)
  if (at !== -1)
    return { box: items[at] as ReactElement<{ checked?: boolean }>, content: items.filter((_, i) => i !== at) }
  const first = items.findIndex(isValidElement)
  const paragraph = items[first] as ReactElement<{ children?: ReactNode }> | undefined
  if (paragraph === undefined) return { box: undefined, content: items }
  const inner = Children.toArray(paragraph.props.children)
  const inside = inner.findIndex(isBox)
  if (inside === -1) return { box: undefined, content: items }
  const rest = cloneElement(paragraph, undefined, ...inner.filter((_, i) => i !== inside))
  return {
    box: inner[inside] as ReactElement<{ checked?: boolean }>,
    content: items.map((c, i) => (i === first ? rest : c)),
  }
}

/** A list item; a GFM task item puts its box before its content, with no bullet. */
function ListItem({ node, children, className, ...props }: ComponentProps<"li"> & ExtraProps) {
  const task = typeof className === "string" && className.split(" ").includes("task-list-item")
  if (!task) {
    return (
      <li {...props} className={className} data-line={line({ node })}>
        {children}
      </li>
    )
  }
  const { box: boxElement, content } = takeBox(children)
  return (
    <li {...props} className="flex list-none items-start gap-2" data-line={line({ node })}>
      {boxElement === undefined ? null : <TaskBox checked={boxElement.props.checked} line={line({ node })} />}
      <div className="min-w-0 flex-1">{content}</div>
    </li>
  )
}

/** A node of the rendered tree (hast), as react-markdown passes it. */
type Node = NonNullable<ExtraProps["node"]>
type Child = Node["children"][number]

/** The text of a node: its text descendants' values, joined. */
function textOf(node: Node | Child | undefined): string {
  if (node === undefined) return ""
  if (node.type === "text") return node.value
  return "children" in node ? node.children.map(textOf).join("") : ""
}

/** The info word of a fenced block, from its `code` element's `language-*` class; empty without one. */
function infoOf(code: Child | undefined): string {
  if (code === undefined || code.type !== "element") return ""
  const classes = code.properties.className
  const names = Array.isArray(classes) ? classes.map(String) : []
  return names.find((c) => c.startsWith("language-"))?.slice("language-".length) ?? ""
}

/**
 * A code block: on a faint tint of the page, scrolling sideways rather than wrapping, coloured when its info word names
 * a language of the list, that word as a muted label at the right.
 */
function CodeBlock({ node }: ComponentProps<"pre"> & ExtraProps) {
  const code = node?.children[0]
  const info = infoOf(code)
  const label = codeLabel(info)
  const lines = codeTokens(textOf(code), info)
  return (
    <div className="doc-code" data-line={line({ node })}>
      {label !== "" ? (
        <span className="doc-code-label" aria-hidden="true">
          {label}
        </span>
      ) : null}
      {/* Focusable, so a block wider than the column scrolls from the keyboard. */}
      <pre role="group" tabIndex={0} aria-label={label !== "" ? `${label} code` : "Code"}>
        <code>
          {lines.map((runs, i) => (
            <Fragment key={i}>
              {i > 0 ? "\n" : null}
              {runs.map((run, j) =>
                run.classes === "" ? (
                  <Fragment key={j}>{run.text}</Fragment>
                ) : (
                  <span key={j} className={run.classes}>
                    {run.text}
                  </span>
                ),
              )}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  )
}

const COMPONENTS: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  p: ({ node, ...props }) => <p {...props} data-line={line({ node })} />,
  li: ListItem,
  pre: CodeBlock,
  blockquote: ({ node, ...props }) => <blockquote {...props} data-line={line({ node })} />,
  // Focusable, so a table wider than the column scrolls from the keyboard.
  table: ({ node, ...props }) => (
    <div className="doc-table" data-line={line({ node })} role="group" tabIndex={0} aria-label="Table">
      <table {...props} />
    </div>
  ),
  a: ({ href, children, ...props }) => {
    delete props.node
    return isLinkTarget(href) ? (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    )
  },
  img: ({ alt }) => <>{alt ?? ""}</>,
  input: TaskInput,
}

/** The typography plugin's prose, its colours from the theme, Notion's scale and the widths from `.doc-prose`. */
const PROSE = "prose prose-theway doc-prose"

/**
 * A Markdown file, rendered read-only: GFM tables and task lists, raw HTML dropped, headings one level down, fenced
 * code coloured; prose at most `--read-width` wide, code blocks and tables up to `--read-wide`, centred. With
 * `onToggle`, a task item's box can be ticked, and gives the item's first source line.
 */
export function MarkdownView({
  text,
  onToggle = null,
}: {
  text: string
  onToggle?: ((line: number, checked: boolean) => void) | null
}) {
  return (
    <ToggleContext.Provider value={onToggle}>
      <div className={PROSE}>
        <Markdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
          {text}
        </Markdown>
      </div>
    </ToggleContext.Provider>
  )
}
