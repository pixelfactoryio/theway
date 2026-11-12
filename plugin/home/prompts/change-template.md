---
template_type: "change"
usage: "Create the change.yaml of a change when scaffolding it with /theway:engineering"
agent_role: "Developer who breaks down spec analysis into concrete, sequential implementation tasks"
required_context:
  - "<change-dir>/spec.md - Understand solution, scope, and hardpoints"
  - "The standards the command gave you"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "The file follows the format below; `theway change <change-id>` exits 0 on it"
  - "`description` is one sentence saying what the change does"
  - "Tasks are specific and actionable (not vague)"
  - "Tasks are in the order they are done"
  - "Tasks are only work done in the repository: no tasks for reviewing the spec, setting up the environment, branching, PRs, code review, merging or archiving (the commands do those)"
  - "A light change (a spec with `**Mode:** light`) has 1 to 3 tasks"
  - "In a `fix-` change, task 1 writes the regression test"
workflow_steps:
  - "1. Review spec analysis to understand the solution"
  - "2. Break it into specific tasks, in the order they are done"
  - "3. Add a documentation task only when the change affects documentation"
  - "4. Write change.yaml, run `theway change <change-id>` and fix the file until it exits 0"
best_practices:
  - "Keep task descriptions concise but clear"
  - "Ensure every part of the spec has corresponding tasks"
  - "Write a long task, or one holding a colon followed by a space or starting with a backtick or another YAML indicator, in block style (`>-`), as task 3 below"
---

# change.yaml

The change's file, `<change-dir>/change.yaml`:

```yaml
version: theway.change/v1beta
description: Limit requests per API key with a token bucket
tasks:
  - text: Add a token bucket per API key, kept in memory
  - text: Answer 429 with a `Retry-After` header when the bucket is empty
  - text: >-
      Read the limit and the burst from the settings: `rate_limit.per_key`
      and `rate_limit.burst`, with the defaults the spec gives
```

- `version`: required, exactly `theway.change/v1beta`.
- `description`: required, one sentence on one line saying what the change does.
- `tasks`: required, a list of at least one task, in the order they are done. A task's number is its position in the list, counted from 1.
- `tasks[i].text`: required, a non-empty string: the task.
- `tasks[i].done`: optional, `true` or `false`; absent means `false`. Do not write it when scaffolding: `theway task done <change-id> <n>` ticks a task once it is done.
- No other key, at the root or in a task.
