import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TaskList } from "../src/dashboard/client/components/task-list"

test("a read-only task list shows every task in order, each with its disabled box, and nothing to edit", () => {
  const html = renderToStaticMarkup(
    <TaskList
      readOnly
      rows={[
        { text: "Write the spec", done: true },
        { text: "Ship it\n\nWith its detail", done: false },
      ]}
    />,
  )
  expect(html).toContain('<ol aria-label="Tasks"')
  expect(html.match(/<li /g)?.length).toBe(2)
  expect(html.indexOf("Write the spec")).toBeLessThan(html.indexOf("Ship it"))
  expect(html).toContain("With its detail")
  expect(html).toContain('aria-label="Task 1 done"')
  expect(html).toContain('aria-label="Task 2 done"')
  expect(html.match(/aria-disabled="true"/g)?.length).toBe(2)
  for (const absent of ["done</button>", "Add a task", "actions", "data-task-id", "Show more", "Next", "line-clamp"])
    expect([absent, html.includes(absent)]).toEqual([absent, false])
})

test("an active change's task rows each show a pencil at rest, before their menu; a read-only list has none", () => {
  const noop = () => undefined
  const html = renderToStaticMarkup(
    <TaskList
      rows={[
        { id: "a", text: "Write the spec", done: false },
        { id: "b", text: "Ship it", done: false },
      ]}
      field={null}
      actions={{
        toggle: noop,
        move: noop,
        remove: noop,
        open: () => true,
        change: noop,
        close: noop,
        enter: noop,
        cancel: noop,
      }}
      focus={null}
      onFocused={noop}
      focusRow={noop}
    />,
  )
  for (const n of [1, 2]) {
    const pencil = html.indexOf(`aria-label="Edit task ${n}"`)
    expect([n, pencil > 0, pencil < html.indexOf(`aria-label="Task ${n} actions"`)]).toEqual([n, true, true])
  }
  const read = renderToStaticMarkup(<TaskList readOnly rows={[{ text: "Write the spec", done: false }]} />)
  expect(read).not.toContain("Edit task")
})
