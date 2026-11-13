import { Children, isValidElement, type ComponentProps, type ReactNode } from "react"
import Markdown, { type Components, type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Checkbox } from "@/components/ui/checkbox"
import { headingTag, isLinkTarget } from "@/lib/changes"

/** The first source line of a block, from react-markdown's node position. */
const line = (props: ExtraProps): number | undefined => props.node?.position?.start.line

/** A GFM task item's box: the shipped checkbox, read-only. */
function TaskBox({ checked }: ComponentProps<"input">) {
  const done = checked === true
  return <Checkbox checked={done} disabled aria-label={done ? "Done" : "Not done"} className="mt-1 shrink-0" />
}

/** An `input` of the Markdown: GFM's task boxes only. */
function TaskInput({ node: _node, ...props }: ComponentProps<"input"> & ExtraProps) {
  return props.type === "checkbox" ? <TaskBox {...props} /> : <input {...props} />
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
  const items = Children.toArray(children)
  const box = items.findIndex((c) => isValidElement(c) && c.type === TaskInput)
  const content: ReactNode[] = box === -1 ? items : items.filter((_, i) => i !== box)
  return (
    <li {...props} className="flex list-none items-start gap-2" data-line={line({ node })}>
      {box === -1 ? null : items[box]}
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
  "prose prose-sm prose-neutral dark:prose-invert max-w-[80ch]",
  "prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-h5:text-sm prose-h6:text-sm",
  "prose-pre:bg-muted prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "prose-code:font-mono prose-code:font-normal prose-code:text-xs prose-code:bg-muted prose-code:rounded-sm prose-code:px-1",
  "prose-code:before:content-none prose-code:after:content-none",
].join(" ")

/** A Markdown file, rendered read-only: GFM tables and task lists, raw HTML dropped, headings one level down. */
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className={PROSE}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
