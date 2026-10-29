---
description: Move a finished change to changes/archive/ under a dated folder
author: Amine
allowed-tools: Bash(~/.theway/bin/theway:*)
---

# TheWay: Archive Spec

Archive a completed spec by moving it to the archive folder with a timestamp.

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.
> If `~/.theway/config.yaml` doesn't exist, tell the user to run `/theway:setup` first and stop.

## Usage

This command archives a completed change after it has been:
- Fully implemented
- Tested and validated
- Deployed to production (if applicable)
- Confirmed working

## Steps

> Follow the conventions in `~/.theway/data/standards/interaction.md` (exploration and reporting).

### 1. Require an Explicit Instruction (STOP gate)

**Do NOT archive off an implicit signal** ("it's merged", "it's done", "ship it"). Archiving is destructive (moves the folder) and must be requested explicitly: the user must name the change and explicitly say to archive it. If the change-id is missing or you're inferring intent, stop and ask. A reply that explicitly says to archive `<change-id>` after a stop is the confirmation: go on to Step 2.

### 2. Verify Completion

Run `list` and show the task count before archiving:

```bash
~/.theway/bin/theway list <project>
```

- If the change is not at `N/N tasks done`, surface which numbered tasks are open and ask the user to fix them or confirm an override. Do not proceed on your own.
- `archive` enforces this too: it refuses unless every numbered task in `tasks.md` is ticked; other checkboxes are not tasks (use `--force` only when the user explicitly accepts stale/N-A tasks).

### 3. Move to Archive

```bash
~/.theway/bin/theway archive <project> <change-id>
# only if the user explicitly accepts remaining open numbered tasks:
~/.theway/bin/theway archive <project> <change-id> --force
```

### 4. Update Project Documentation (if needed)

- Update architecture docs in `docs/` with any new patterns or conventions
- Clean up any temporary notes

### 5. Confirm Archive

- Verify folder moved successfully
- Confirm archive location: `~/.theway/<project>/changes/archive/YYYY-MM-DD-[change-id]/`

## Archive Structure

Archived changes are stored with timestamps:
```
~/.theway/<project>/changes/archive/
├── 2025-10-01-implement-api-gateway/
├── 2025-10-10-add-logging-framework/
└── 2025-10-15-update-auth-middleware/
```

## What Gets Archived

The entire change folder including:
- `spec.md` - The spec analysis with proposal and hardpoints
- `tasks.md` - Completed task list (all checked)
- `design.md` - Technical design (if present)
- Any other files in the change folder

## Historical Record

Archives serve as:
- Historical record of decisions
- Reference for similar future changes
- Audit trail of what was done and why
- Learning resource for the team

---
