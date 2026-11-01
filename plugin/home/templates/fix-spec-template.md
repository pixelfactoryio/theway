---
template_type: "fix"
usage: "Create the spec of a fix- change: a bug reproduced, its root cause found, and the fix and regression test planned"
agent_role: "Spec Analyst who reproduces a bug, traces it to its root cause and plans a fix the regression test proves, using the TAMM framework (Time/Autonomy/Mastery/Machine) for its risks"
required_context:
  - "<home>/config.yaml - Global config"
  - "<home>/standards/tamm-framework.md - TAMM framework"
  - "<home>/standards/core-principles.md, sre.md, web-development.md, quality.md - Opt-in standards (each only if enabled)"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "The Reproduction quotes a command that was run and the output it printed; reasoning about the code is not a reproduction"
  - "The Root Cause points at file:line evidence and explains why the code behaves that way"
  - "The Regression Test names its file, its test name, the exact command, and the failure it shows on the base commit"
  - "TAMM table includes only Medium/High risk hardpoints (skip low-risk items); \"None at Medium or High.\" is a valid answer"
  - "Scope clearly defines in-scope and out-of-scope boundaries"
  - "Success criteria are measurable with checkboxes and start with the two fixed criteria, verbatim"
workflow_steps:
  - "1. State the symptom as the user sees it"
  - "2. Record the reproduction: the command, its observed output (quoted) and the expected result"
  - "3. Trace the root cause to file:line evidence"
  - "4. Describe the fix at the root cause, not only at the symptom"
  - "5. Plan the regression test: it fails on the base commit for the reason in Root Cause, and passes with the fix"
  - "6. Analyze each TAMM dimension for Medium/High risks only"
  - "7. Define clear scope boundaries (in/out of scope)"
  - "8. Write the Success Criteria, starting with the two fixed criteria; task 1 of tasks.md writes the regression test"
best_practices:
  - "Fix the cause the evidence shows, not the first place the symptom appears"
  - "Keep the fix to the bug: unrelated cleanups belong in another change"
  - "Check whether the same cause produces other symptoms, and list them in Scope"
  - "Focus on medium/high-risk hardpoints only - skip low-risk items"
  - "Keep analysis practical and actionable, not verbose"
---

# Spec Analysis: [Fix Name]

## Solution

**Problem:** [1-2 sentence statement of the bug: what goes wrong, for whom, and when]

**Proposed Solution:** [1-2 sentences: what the fix changes and why that removes the cause]

## Symptom

[What the user sees: the error, the wrong output or the wrong behavior, and what they expected instead. Quote the report when there is one.]

## Reproduction

The reproduction is a command that was run, with the output it printed. Reasoning about the code is not a reproduction.

**Command:**
```bash
[the exact command, run from the repository root or a `mktemp -d` directory]
```

**Observed output:**
```text
[the output it printed, quoted]
```

**Expected result:** [what the command should show once the bug is fixed]

## Root Cause

[Why the code behaves this way, with file:line evidence for each step, for example `src/module.ts:42`. Say why the code reaches that line with that input.]

## Fix

[What changes, where (file and function), and why it removes the root cause rather than hiding the symptom.]

## Regression Test

- **File:** [test file path]
- **Test name:** [test name]
- **Command:** `[the exact command that runs only this test]`
- **Failure on the base commit:** [the failure it shows without the fix, which must follow from the Root Cause]

## Scope

**In Scope:**
- [The fix]
- [The regression test]
- [Other symptoms of the same cause, if any]

**Out of Scope:**
- [What will not be included]
- [Related bugs with a different cause]

## Hardpoints (TAMM Analysis)

**Only document Medium/High risk hardpoints. Omit low-risk items.** When there are none, this section reads "None at Medium or High.".

| Category | Risk | Impact | Countermeasures |
|----------|------|--------|-----------------|
| Time (T) | Med/High | [How this constraint affects delivery timeline] | 1. [Countermeasure]<br>2. [Countermeasure] |
| Autonomy (A) | Med/High | [How this constraint affects decision-making] | 1. [Countermeasure]<br>2. [Countermeasure] |
| Mastery (M) | Med/High | [How this gap affects implementation quality] | 1. [Countermeasure]<br>2. [Countermeasure] |
| Machine (M) | Med/High | [How this limitation constrains the solution] | 1. [Countermeasure]<br>2. [Countermeasure] |

**TAMM Legend:**
- **Time**: Timeline constraints, dependencies, blocking risks
- **Autonomy**: Decision authority, organizational constraints, approval needs
- **Mastery**: Skill gaps, knowledge requirements, learning curves
- **Machine**: System limitations, performance constraints, infrastructure issues

## Implementation

Task 1 of `tasks.md` writes the regression test; the fix follows. Re-running the reproduction is part of Verify, not a task.

**Success Criteria:**
- [ ] The regression test `[test name]` fails on the base commit for the reason in Root Cause, and passes with the fix
- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]
- [ ] [Criterion 3]
