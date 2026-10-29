---
description: Write architecture docs for the project in docs/architecture/
author: Amine
---

# TheWay: Document Mode

You are now in **Document Mode** - creating architecture documentation using templates.

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.

**IMPORTANT:** Keep documentation practical and actionable, not verbose. Use code examples over explanations.

## Expected Output

Create project-specific architecture docs in `docs/architecture/`:

```
docs/architecture/
├── coding-standards.md     # Project coding conventions
├── source-tree.md          # Repository structure
└── tech-stack.md           # Technology choices
```

## Workflow

> Follow the conventions in `~/.theway/data/standards/interaction.md` (exploration and reporting).

### Step 1: Generate Documents from Templates

First read `~/.theway/config.yaml` (and `~/.theway/data/standards/architecture-principles.md` if enabled in config).

Then, for each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create/update the output file in `docs/architecture/` (overwrite if it already exists). Keep outputs concise — code examples, not verbose explanations.

| Template | Output |
|----------|--------|
| `~/.theway/templates/coding-standards-template.md` | `coding-standards.md` |
| `~/.theway/templates/source-tree-template.md` | `source-tree.md` |
| `~/.theway/templates/tech-stack-template.md` | `tech-stack.md` |

### Step 2: Additional Documentation

Create other documentation as needed:
- System architecture overviews
- Backend design and API contracts
- Frontend architecture and patterns
- Infrastructure and deployment docs
- Technical decision records (ADRs)

## Exit

When finished, summarize what was documented.

> If `~/.theway/config.yaml` is missing, tell the user to run `/theway:setup` first.
