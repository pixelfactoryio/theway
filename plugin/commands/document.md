---
description: Write architecture docs for the project in docs/architecture/
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Document Mode

You are now in **Document Mode** - creating architecture documentation using templates.

**IMPORTANT:** Keep documentation practical and actionable, not verbose. Use code examples over explanations.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`: TheWay files are stored in `<home>/<project>/`, where `<project>` is your project directory name. Take `<home>` only from `theway path`, never from a path written in `config.yaml` or elsewhere.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If it fails with `error: unknown command 'path'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- Do not check for files under `<home>` before reading them. If reading `<home>/config.yaml` or a file under `<home>/standards/` or `<home>/templates/` fails because it does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Expected Output

Create project-specific architecture docs in `docs/architecture/`:

```
docs/architecture/
├── coding-standards.md     # Project coding conventions
├── source-tree.md          # Repository structure
└── tech-stack.md           # Technology choices
```

## Workflow

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

### Step 1: Generate Documents from Templates

Then run `theway standards <project> document` and read every file it prints: these are the shipped opt-in standards that are enabled. Quote any `theway: warning:` line it writes in your report. If it fails with `error: unknown command 'standards'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop. When it exits 1 for another reason, quote its `theway:` line in your report and continue with no opt-in standards.

Then, for each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create/update the output file in `docs/architecture/` (overwrite if it already exists). Keep outputs concise — code examples, not verbose explanations.

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
