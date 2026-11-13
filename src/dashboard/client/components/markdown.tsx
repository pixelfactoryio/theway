import { Children, cloneElement, createContext, isValidElement, useContext, type ComponentProps, type ReactElement, type ReactNode } from "react"
import Markdown, { type Components, type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Checkbox } from "@/components/ui/checkbox"
import { headingTag, isLinkTarget } from "@/lib/changes"

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
function TaskInput({ node: _node, ...props }: ComponentProps<"input"> & ExtraProps) {
  return props.type === "checkbox" ? <TaskBox checked={props.checked} /> : <input {...props} />
}

function heading(depth: number) {
  const Tag = headingTag(depth) as "h2"
  return function Heading({ node, children, ...props }: ComponentProps<"h1"> & ExtraProps) {
    return (
      <Tag {...props} data-line={line({ node })}>
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
  if (at !== -1) return { box: items[at] as ReactElement<{ checked?: boolean }>, content: items.filter((_, i) => i !== at) }
  const first = items.findIndex(isValidElement)
  const paragraph = items[first] as ReactElement<{ children?: ReactNode }> | undefined
  if (paragraph === undefined) return { box: undefined, content: items }
  const inner = Children.toArray(paragraph.props.children)
  const inside = inner.findIndex(isBox)
  if (inside === -1) return { box: undefined, content: items }
  const rest = cloneElement(paragraph, undefined, ...inner.filter((_, i) => i !== inside))
  return { box: inner[inside] as ReactElement<{ checked?: boolean }>, content: items.map((c, i) => (i === first ? rest : c)) }
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

const COMPONENTS: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  p: ({ node, ...props }) => <p {...props} data-line={line({ node })} />,
  li: ListItem,
  pre: ({ node, ...props }) => <pre {...props} data-line={line({ node })} />,
  blockquote: ({ node, ...props }) => <blockquote {...props} data-line={line({ node })} />,
  table: ({ node, ...props }) => <table {...props} data-line={line({ node })} />,
  a: ({ node: _node, href, children, ...props }) =>
    isLinkTarget(href) ? (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ alt }) => <>{alt ?? ""}</>,
  input: TaskInput,
}

const PROSE = [
  "prose prose-sm prose-theway max-w-[80ch]",
  "prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-h5:text-sm prose-h6:text-sm",
  "prose-pre:bg-muted prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "prose-code:font-mono prose-code:font-normal prose-code:text-xs prose-code:bg-muted prose-code:rounded-sm prose-code:px-1",
  "prose-code:before:content-none prose-code:after:content-none",
].join(" ")

/**
 * A Markdown file, rendered read-only: GFM tables and task lists, raw HTML dropped, headings one level down. With
 * `onToggle`, a task item's box can be ticked, and gives the item's first source line.
 */
export function MarkdownView({ text, onToggle = null }: { text: string; onToggle?: ((line: number, checked: boolean) => void) | null }) {
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
