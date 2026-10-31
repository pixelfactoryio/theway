---
template_type: "light"
usage: "Create the short spec of a change with nothing to decide, written by /theway:engineering-light"
agent_role: "Spec Analyst who writes the smallest spec a cold-start implementer can follow"
required_context:
  - "<home>/config.yaml - Global config"
  - "<home>/data/standards/tamm-framework.md - TAMM framework"
  - "<home>/data/standards/core-principles.md, sre.md, web-development.md, quality.md - Opt-in standards (each only if enabled)"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "The Change section lists every file the change touches and ends with \"Nothing else changes.\""
  - "Success criteria are checkable, with checkboxes"
  - "For a fix- change, the reproduction quotes a command that was run and the output it printed, and the Success Criteria start with the two fixed criteria, verbatim"
workflow_steps:
  - "1. State the problem; for a fix- change, with its cause and file:line evidence"
  - "2. Record the evidence; for a fix- change, the reproduction"
  - "3. List the change, file by file"
  - "4. Write the Success Criteria"
best_practices:
  - "Escalate to /theway:engineering rather than fit a decision into a light spec"
  - "Keep the change to what Problem states"
---

# Spec Analysis: [Change Name]
**Mode:** light

## Problem

[1-2 sentences: what is wrong or missing, and for whom. For a `fix-` change, also the cause, with file:line evidence, for example `src/module.ts:42`.]

## Evidence

[The findings the change rests on: question, method, result.]

For a `fix-` change, the reproduction. Reasoning about the code is not a reproduction.

**Command:**
```bash
[the exact command, run from the repository root or a `mktemp -d` directory]
```

**Observed output:**
```text
[the output it printed, quoted]
```

**Expected result:** [what the command should show once the bug is fixed]

## Change

- `[file]`: [what changes in it]
- `[file]`: [what changes in it]

Nothing else changes.

## Success Criteria

For a `fix-` change, the list starts with the first two criteria, verbatim.

- [ ] The regression test `[test name]` fails before the fix and passes with it
- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]
- [ ] [Criterion]
