import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TaskList } from "../src/dashboard/client/components/task-list"

test("a read-only task list shows every task in order, each with its disabled box, and nothing to edit", () => {
  const html = renderToStaticMarkup(
    <TaskList
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

test("an active change's list marks its first task not done as Next", () => {
  const html = renderToStaticMarkup(
    <TaskList
      markNext
      rows={[
        { text: "Write the spec", done: true },
        { text: "Ship it", done: false },
        { text: "Document it", done: false },
      ]}
    />,
  )
  expect(html.match(/>Next</g)?.length).toBe(1)
  expect(html.indexOf("Next")).toBeGreaterThan(html.indexOf("Write the spec"))
  expect(html.indexOf("Next")).toBeLessThan(html.indexOf("Ship it"))
})
