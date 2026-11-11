---
description: Write architecture docs for the project in docs/architecture/
author: Amine
allowed-tools: Bash(theway:*)
---

# theway: Document Mode

**IMPORTANT:** Keep documentation practical and actionable, not verbose. Use code examples over explanations.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: theway files of the current project are stored in `<home>/projects/<key>/`: run `theway project` for its key and folder; never compute the key yourself.

- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID), `next-id` (fix the series ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` and `next-id` write `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Expected Output

Create project-specific architecture docs in `docs/architecture/`:

```
docs/architecture/
├── coding-standards.md     # Project coding conventions
├── source-tree.md          # Repository structure
└── tech-stack.md           # Technology choices
```

## Workflow

> Follow `<home>/standards/interaction.md` (exploration and reporting) and `<home>/standards/authority.md`.

### Step 1: Generate Documents from Templates

Run `theway context document` and read every file its `standards` lists: these are the standards, the shipped opt-in ones that are enabled and yours.

Then, for each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create/update the output file in `docs/architecture/` (overwrite if it already exists).

| Template | Output |
|----------|--------|
| `<home>/templates/coding-standards-template.md` | `coding-standards.md` |
| `<home>/templates/source-tree-template.md` | `source-tree.md` |
| `<home>/templates/tech-stack-template.md` | `tech-stack.md` |

### Step 2: Additional Documentation

Create other documentation as needed:

- System architecture overviews
- Backend design and API contracts
- Frontend architecture and patterns
- Infrastructure and deployment docs
- Technical decision records (ADRs)

## Exit

When finished, summarize what was documented.
