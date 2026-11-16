/** Where each check line of a workflow is shown: under a panel's field, in its alert, or in neither panel. Pure: no React, no DOM. */

// ---------------------------------------------------------------------------------------------------------------------
// Where each check line is shown

/**
 * Where a check line (read without its own file's prefix) is shown: under a field of step N's panel or of the workflow
 * panel, in that panel's alert, or in neither panel. Step fields: `uses`, `runs-on`, `model`, `matrix`, `with.<X>`,
 * `on-fail`, `on-fail.with.<X>`, `on-fail.model`, `tries`. Workflow fields: `description`, `runs-on`, `default`,
 * `inputs.<name>` (its name field) and `inputs.<name>.<key>`.
 */
export type Place =
  { panel: "step"; index: number; field: string } | { panel: "workflow"; field: string } | { panel: "none" }

const STEP = /^steps\[(\d+)\]/

/** The input name and rest of an `inputs.<name>: ` line, `inputs` naming the workflow's inputs. */
function inputLine(line: string, inputs: readonly string[]): { name: string; rest: string } | null {
  if (!line.startsWith("inputs.")) return null
  const tail = line.slice("inputs.".length)
  // A declared name first: a name may hold `: ` itself.
  const known = [...inputs].sort((a, b) => b.length - a.length).find((n) => tail.startsWith(`${n}: `))
  if (known !== undefined) return { name: known, rest: tail.slice(known.length + 2) }
  const at = tail.indexOf(": ")
  return at === -1 ? null : { name: tail.slice(0, at), rest: tail.slice(at + 2) }
}

/** Where `line` is shown: the first rule below that matches it. */
export function placeLine(line: string, inputs: readonly string[] = []): Place {
  const m = STEP.exec(line)
  if (m !== null) {
    const index = Number(m[1])
    const rest = line.slice((m[0] as string).length)
    const step = (field: string): Place => ({ panel: "step", index, field })
    if (rest.startsWith(": ")) return step("alert")
    for (const key of ["uses", "runs-on", "model", "matrix"]) if (rest.startsWith(`.${key}: `)) return step(key)
    const req = /^\.with: required input (.+) is not set$/.exec(rest)
    if (req !== null) return step(`with.${req[1]}`)
    if (rest.startsWith(".with: ")) return step("alert")
    const onFailReq = /^\.on-fail\.with: required input (.+) is not set$/.exec(rest)
    if (onFailReq !== null) return step(`on-fail.with.${onFailReq[1]}`)
    if (rest.startsWith(".on-fail.with: ")) return step("alert")
    if (rest.startsWith(".on-fail.model: ")) return step("on-fail.model")
    if (rest.startsWith(".on-fail.uses: ")) return step("on-fail")
    if (rest.startsWith(".on-fail: needs tries")) return step("tries")
    if (rest.startsWith(".on-fail: ")) return step("on-fail")
    if (rest.startsWith(".tries: ")) return step("tries")
    if (rest.startsWith(".")) return step("alert")
  }
  const workflow = (field: string): Place => ({ panel: "workflow", field })
  if (line.endsWith(" both set default: true")) return workflow("default")
  for (const key of ["description", "runs-on", "default"]) if (line.startsWith(`${key}: `)) return workflow(key)
  const input = inputLine(line, inputs)
  if (input !== null) {
    const key = /^(description|required|default|type)(?: |$)/.exec(input.rest)?.[1]
    return workflow(key === undefined ? `inputs.${input.name}` : `inputs.${input.name}.${key}`)
  }
  if (/^prompts\/[^/:\s]+\.md: /.test(line)) return { panel: "none" }
  return workflow("alert")
}
