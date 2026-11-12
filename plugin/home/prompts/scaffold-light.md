---
description: Investigate the request and write a short spec and 1 to 3 tasks
model: opus
inputs:
  request:
    description: What the change should do
    required: true
---

# Scaffold Light

Read `prompts/scaffold-rules.md`, `prompts/tamm-framework.md` and `prompts/spec-investigation.md` first.

You write the light change this request asks for: a short spec (the problem, the evidence, the change file by file) and 1 to 3 tasks, for a small change with nothing to decide: a known cause, a local change, no public contract change. A change that needs decisions goes through `/theway:engineering` without `--light`: the light path escalates to it and never writes a full spec itself.

Request: ${{ inputs.request }}

## Series

Before anything else: when the request asks for a series, for multiple sequential changes or to split into N changes, or the named change ID ends in `-NN`, write nothing and answer `blocked` with the report `a series is not a light change; run /theway:engineering without --light`.

## Change ID

There is no series naming. **Validate the ID before writing:** run `theway validate-id <change-id>`, never with `--series` (a light change is never a series member), and fix the ID from the reason it prints until it exits 0, before writing any change folder. **Locate the change folder:** once the ID is valid, run `theway path <change-id>` and use the folder it prints as `<change-dir>`. Every file of the change is written there.

## Investigate

Investigate as `prompts/spec-investigation.md` sets out. A question you cannot settle there is a decision: it escalates (below). The findings, and for a `fix-` change the recorded reproduction, go into the spec's Evidence, quoted. When one of the three stop outcomes applies, write no change folder and answer `blocked` with the stop report. Otherwise run the escalation check.

**Escalation check**, for every change, at the end of the investigation and before any change file is written. Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series. A request that contradicts a standard is a decision to make. A decision is a choice the code, the docs and the request do not settle; a public contract change is a change to a command, CLI, API, config key or file format that others rely on. Adding something counts: a new response field, flag, option, config key or file key changes the contract, even when nothing existing breaks. Escalating writes no change file: answer `blocked` with the report `escalated: <what was found>; run /theway:engineering <request> without --light`. Otherwise continue.

## Write the change files

For each template below, read the template, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| `prompts/light-spec-template.md` | `spec.md` |
| `prompts/change-template.md` | `change.yaml` |

After writing `change.yaml`, run `theway change <change-id>` and fix the file from the error lines it prints until it exits 0.

`spec.md` keeps the `**Mode:** light` line directly under its H1 title: the change's prompts read it. For a `fix-` change, Problem states the cause with file:line evidence, and Evidence holds the reproduction. `change.yaml` follows the rule of `prompts/change-template.md` for a light change. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify. There is no fix spec template.

A light change has no `design.md`.

## Answer

Answer `pass` when the change files are written: report the change folder you wrote (its ID and absolute path) and the findings that shaped the spec, as "question — method — result".

Answer `blocked` after a stop outcome, the series check or the escalation check, with the stop or escalation report, verbatim.
