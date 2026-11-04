# Scaffold Light

You write the light change Input `request` asks for: a short spec (the problem, the evidence, the change file by file) and 1 to 3 tasks, for a small change with nothing to decide: a known cause, a local change, no public contract change. Follow the scaffold rules, the TAMM framework and the investigation prompt you read before this file. A change that needs decisions goes through `/theway:engineering` without `--light`: the light path escalates to it and never writes a full spec itself.

## Series

Before anything else: when the request asks for a series, for multiple sequential changes or to split into N changes, or the named change ID ends in `-NN`, write nothing and return `outcome: escalated`, with `report`: `a series is not a light change; run /theway:engineering without --light`.

## Change ID

There is no series naming. **Validate the ID before writing:** run `theway validate-id <change-id>`, never with `--series` (a light change is never a series member), and fix the ID from the reason it prints until it exits 0, before writing any change folder. **Locate the change folder:** once the ID is valid, run `theway path <change-id>` and use the folder it prints as `<change-dir>`. Every file of the change is written there.

## Investigate

Investigate as the spec-investigation prompt sets out. A question you cannot settle there is a decision: it escalates (below). The findings, and for a `fix-` change the recorded reproduction, go into the spec's Evidence, quoted. When one of the three stop outcomes applies, write no change folder and return `outcome: stopped`, with the stop report in `report`. Otherwise run the escalation check.

**Escalation check**, for every change, at the end of the investigation and before any change file is written. Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series. A request that contradicts a standard is a decision to make. A decision is a choice the code, the docs and the request do not settle; a public contract change is a change to a command, CLI, API, config key or file format that others rely on. Escalating writes no change file: return `outcome: escalated`, with `report`: `escalated: <what was found>; run /theway:engineering <request> without --light`. Otherwise continue.

## Write the change files

For each template below, read the template prompt, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| The light-spec-template prompt | `spec.md` |
| The tasks-template prompt | `tasks.md` |

`spec.md` keeps the `**Mode:** light` line directly under its H1 title: `/theway:workflow` reads it. For a `fix-` change, Problem states the cause with file:line evidence, and Evidence holds the reproduction. `tasks.md` follows the tasks-template prompt's rule for a light change. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify. There is no series line and no fix-spec-template.

A light change has no `design.md`.

## Return

- `outcome`: `ready` when the change files are written; `stopped` after a stop outcome; `escalated` after the series check or the escalation check.
- `changes`: the change folder you wrote: `id`, `dir` (absolute), `light: true`, `fix` (the ID starts with `fix-`); `[]` when none.
- `questions`: `[]`.
- `shaping`: the findings that shaped the spec, as "question — method — result".
- `report`: the stop or escalation report, verbatim, or null.
