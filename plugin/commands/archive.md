---
description: Move a finished change to changes/archive/ under a dated folder
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Archive Spec

Archive a completed spec by moving it to the archive folder with a timestamp.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: TheWay files are stored in `<home>/<project>/`, where `<project>` is the current directory name.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` writes `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Steps

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

### 1. Require an Explicit Instruction (STOP gate)

**Do NOT archive off an implicit signal** ("it's merged", "it's done", "ship it"). Archiving is destructive (moves the folder) and must be requested explicitly: the user must name the change and explicitly say to archive it. If the change-id is missing or you're inferring intent, stop and ask. A reply that explicitly says to archive `<change-id>` after a stop is the confirmation: go on to Step 2.

### 2. Verify Completion

Run `theway list <project>` and show the task count before archiving. If the change is not at `N/N tasks done`, list its open numbered tasks and ask the user to fix them or accept them. Do not proceed on your own.

### 3. Move to Archive

```bash
theway archive <project> <change-id>
# only if the user explicitly accepts remaining open numbered tasks:
theway archive <project> <change-id> --force
```

When `theway archive` refuses because numbered tasks are open, list them and ask as in Step 2; use `--force` only on the user's explicit acceptance.

### 4. Confirm Archive

Report the `Archived: <path>` line `theway archive` prints.
