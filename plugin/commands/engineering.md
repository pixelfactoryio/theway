---
description: Write the spec and numbered tasks for a change, without code
author: Amine
allowed-tools: Bash(~/.theway/bin/theway:*)
---

# TheWay: Engineering

You are now scaffolding a Spec analysis using templates.

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.
> If `~/.theway/config.yaml` doesn't exist, tell the user to run `/theway:setup` first and stop.

> **What this command produces.** A spec someone else can implement without guessing: the problem, what you found out, the decisions and why, and the tasks. The code is written later, by `/theway:develop`, from that spec.
>
> Write only under `~/.theway/<project>/changes/[change-id]/`. Action words in the request ("rename X", "try the fix") describe what the spec should plan, not something to do now.
>
> Do **not** suggest entering plan mode — its approval step is a "start coding" trigger that collapses scaffolding into implementation.

## Workflow

> Follow the conventions in `~/.theway/data/standards/interaction.md` (exploration and reporting).

### Step 1: Load Config and Standards

Read these files from `~/.theway/`:
- `~/.theway/config.yaml` - Global config and conventions
- `~/.theway/data/standards/tamm-framework.md` - TAMM framework
- `~/.theway/data/standards/architecture-principles.md` - SRE-EE principles (if enabled in config)

### Step 2: Create Change Folder

Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`

Example change IDs: `add-user-authentication`, `update-payment-api`

**Series naming**

- **Trigger:** the request is a series when the user asks for a series, for multiple sequential changes, or to "split into N changes", or when the argument passed already ends in `-NN`. In series mode the argument given to `/theway:engineering` is the `<series-id>`, not a change ID; if it already ends in `-NN`, strip that ordinal to get the `<series-id>` (never append a second one).
- **Pattern:** every member is `<series-id>-NN` — a shared verb-prefixed kebab-case `<series-id>` (same `add-`/`update-`/`refactor-`/`remove-` rule) plus a zero-padded two-digit ordinal starting at `01`, assigned in dependency order.
- **Continuation:** before assigning ordinals, `Glob` `~/.theway/<project>/changes/<series-id>-[0-9][0-9]` and `~/.theway/<project>/changes/archive/*-<series-id>-[0-9][0-9]` (archived folders are named `YYYY-MM-DD-<change-id>`; match only the exact `<series-id>`, not sibling series that merely end with it). Continue from the next free ordinal — never restart at `01`, never rename or renumber existing folders.
- **Forbidden:** topic-word suffixes (`add-user-auth-login`), letter suffixes in place of the ordinal (`-a`, `-b`; a standalone ID may still end in a one-letter word that is part of its name, e.g. `add-vitamin-c`, so a member of a series is always validated with `--series`), unpadded numbers (`-1`), mixing standalone IDs and series IDs within one series, and putting an ordinal on a single (non-series) change.
- **Example:** `add-user-auth-01`, `add-user-auth-02`, `add-user-auth-03`.

**Validate every ID before writing:** run exactly one form per ID — a standalone change: `~/.theway/bin/theway validate-id <change-id>`; a series member: `~/.theway/bin/theway validate-id <change-id> --series` only (never the form without `--series`, which rejects every `-NN` ID). It must exit 0 before any change folder is written. On exit 1 with an `invalid change id '<id>': <reason>` line on stderr, fix the ID from that reason and run it again. If it instead prints a `Usage: theway {...}` line that does not list `validate-id`, the installed binary is stale: do not change the ID; stop and tell the user to run `/theway:setup`, then validate again. `validate-id` is the source of truth for the ID format.

> The `Write` tool creates parent directories automatically — no need for explicit `mkdir`.

### Step 3: Investigate

Before drafting, find out what the spec depends on: read the code involved, check how it behaves today, and settle the unknowns. You can clone repositories, run small throwaway scripts, call a service or measure something — whatever answers a specific question the spec has to settle.

Keep each investigation to its question. If you notice you are building the change itself to see whether it works, stop: a spec written after the code describes that code instead of the problem, and the blockers and alternatives it should have weighed are never examined. Turn what you were trying to learn into a question for the user, or record it in the spec as an open point.

What you learn goes into the spec as findings (question, method, result), not as code or diffs.

### Step 4: Generate Documents from Templates

For each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `~/.theway/<project>/changes/[change-id]/`:

| Template | Output |
|----------|--------|
| `~/.theway/templates/spec-template.md` | `spec.md` |
| `~/.theway/templates/tasks-template.md` | `tasks.md` |

For a series, each member's `spec.md` carries one line directly under its H1 title:
`**Series:** <series-id> — NN of TOTAL, depends on <series-id>-(NN-1)` — the `01` member states no dependency.

### Step 5: Optional Technical Design

If needed, create `~/.theway/<project>/changes/[change-id]/design.md` for:
- API contracts and data models
- Architecture decisions
- Technical diagrams and specs

## Exit

Report the change folder, the findings that shaped the spec, and any question still open. If a question is open, say so and stop; the spec is not ready until it is answered.
