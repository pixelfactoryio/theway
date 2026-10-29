---
description: Implement a change's tasks in the current session and tick them off
author: Amine
---

# TheWay: Develop

Implement a change as its spec describes it, inline in this session, and show that it meets its Success Criteria.

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.
> If `~/.theway/config.yaml` doesn't exist, tell the user to run `/theway:setup` first and stop.

## Workflow Steps

> Follow the conventions in `~/.theway/data/standards/interaction.md` (exploration and reporting).

### Step 1: Load Context

Take the change ID from the user's request (e.g. "develop the add-redis-cache change" → `add-redis-cache`); only ask if none is given. Then read these exact paths directly — do not search the filesystem to locate them:
- `~/.theway/config.yaml` - Global config and conventions
- `~/.theway/data/standards/develop.md` - How a change is implemented and verified
- `~/.theway/<project>/changes/<change-id>/spec.md` - Why, what, risks and Success Criteria
- `~/.theway/<project>/changes/<change-id>/tasks.md` - The work, as numbered tasks
- `~/.theway/<project>/changes/<change-id>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

### Step 2: Implement and Verify

Follow `~/.theway/data/standards/develop.md`: implement the tasks, stop and ask when the spec does not fit, then verify against the spec's Success Criteria.

## Exit

Report the tasks done, each Success Criterion with how it was verified, any deviation from the spec and what was decided about it, and anything still open.
