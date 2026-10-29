# TheWay Agent Instructions

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.

## TL;DR

**Two Main Workflows:**

1. **Document Project** → Use `/theway:document`
2. **Implement Changes** → Use `/theway:engineering` then `/theway:develop` then `/theway:archive`

## Quick Reference

| Command | Purpose | Templates Used |
|---------|---------|----------------|
| `/theway:document` | Document architecture and technical decisions | `coding_standards`, `source_tree`, `tech_stack` |
| `/theway:engineering` | Scaffold spec analysis and implementation plan | `value_engineering`, `implementation_tasks` |
| `/theway:develop` | Implement tasks from change folder | Reads existing `spec.md`, `tasks.md` |
| `/theway:archive [id]` | Archive completed change to archive/ | N/A |

## Template-Driven Workflow

### How It Works

All TheWay workflows are **template-driven**:

1. **Slash commands** load templates from `~/.theway/<project>/config.yaml`
2. **Templates** contain complete instructions in YAML frontmatter:
   - `usage` - When to use this template
   - `agent_role` - Role/mindset to adopt
   - `required_context` - Files to read first
   - `quality_standards` - What makes a good instance
   - `workflow_steps` - How to create the document
   - `best_practices` - Tips and guidelines

3. **Agents** follow template instructions to create documents

### Template Registry

Templates are defined in the plugin's `config.yaml` (not in user's project directory).

## Workflow 1: Document Project

**Command:** `/theway:document`

**Purpose:** Create/update architecture documentation

**Templates Used:**
- `coding_standards` - Project coding conventions
- `source_tree` - Repository structure
- `tech_stack` - Technology choices and rationale

**Expected Output:**
```
docs/architecture/
├── coding-standards.md     # Project coding conventions
├── source-tree.md          # Repository structure
└── tech-stack.md           # Technology choices
```

**Process:**
1. Create `docs/architecture/` directory
2. Review existing `docs/` for gaps
3. Load templates from plugin's config.yaml
4. For each template: Read frontmatter → Follow instructions → Create document with correct filename
5. Save to `docs/architecture/` directory (coding-standards.md, source-tree.md, tech-stack.md)
6. Keep outputs concise, actionable, code-focused (not verbose)

**See:** `.claude/commands/theway/document.md` for complete workflow

## Workflow 2: Implement Changes

### Stage 1: Scaffold (Engineering)

**Command:** `/theway:engineering`

**Purpose:** Create spec analysis and implementation tasks

**Templates Used:**
- `value_engineering` - TAMM-based analysis
- `implementation_tasks` - Numbered task checklist

**Process:**
1. Create change folder: `~/.theway/<project>/changes/[change-id]`
2. Load templates from plugin's config.yaml
3. For each template: Read frontmatter → Follow instructions → Create document with correct filename
4. Output: `spec.md` (from value_engineering template) and `tasks.md` (from implementation_tasks template) in change folder

**See:** `.claude/commands/theway/engineering.md` for complete workflow

### Stage 2: Implement (Develop)

**Command:** `/theway:develop`

**Purpose:** Implement tasks from change folder

**Process:**
1. Read `~/.theway/<project>/changes/[change-id]/spec.md` for context
2. Read `~/.theway/<project>/changes/[change-id]/tasks.md` for checklist
3. Implement tasks sequentially
4. Check off tasks as completed: `- [x]`
5. Update Notes section with discoveries

**See:** `.claude/commands/theway/develop.md` for complete workflow

### Stage 3: Archive

**Command:** `/theway:archive [change-id]`

**Purpose:** Move completed change to archive with timestamp

**Process:**
1. Verify all tasks checked off
2. Move to archive: `~/.theway/<project>/changes/archive/YYYY-MM-DD-[change-id]/`
3. Confirm completion

**See:** `.claude/commands/theway/archispec.md` for complete workflow

## TAMM Framework Reference

**Quick Overview:**

- **Time (T):** Timeline constraints, dependencies, blocking risks
- **Autonomy (A):** Decision authority, organizational constraints, approval needs
- **Mastery (M):** Skill gaps, knowledge requirements, learning curves
- **Machine (M):** System limitations, performance constraints, infrastructure issues

**For complete TAMM reference:** See plugin's `data/standards/tamm-framework.md`

## Change Folder Structure

```
~/.theway/<project>/changes/[change-id]/
├── spec.md          # Spec analysis (required)
├── tasks.md       # Implementation checklist (required)
└── design.md      # Technical design (optional)
```

## Naming Conventions

### Change IDs
- Format: `[verb]-[description]` (kebab-case)
- Verbs: `add`, `update`, `refactor`, `remove`
- Examples: `add-user-auth`, `update-payment-api`, `refactor-error-handling`

### Archive Format
- Format: `YYYY-MM-DD-[change-id]`
- Example: `2025-10-17-add-user-auth`

## File Locations

**User's Project Files (created by commands):**
- `~/.theway/<project>/changes/` - Active change proposals
- `~/.theway/<project>/changes/archive/` - Completed changes with timestamps
- `~/.theway/<project>/changes/[change-id]/spec.md` - Spec analysis
- `~/.theway/<project>/changes/[change-id]/tasks.md` - Implementation checklist
- `~/.theway/<project>/changes/[change-id]/design.md` - Technical design (optional)
- `docs/architecture/` - Project architecture documentation

**Plugin Files (read-only reference):**
- Plugin's `config.yaml` - Template registry and configuration
- Plugin's `project.md` - TheWay methodology conventions
- Plugin's `data/standards/tamm-framework.md` - TAMM framework details
- Plugin's `data/standards/architecture-principles.md` - SRE-EE principles
- Plugin's `templates/*.md` - Template files with frontmatter instructions
- Plugin's `commands/*.md` - Slash command definitions

---

**For detailed instructions on any template:** Read the template file's YAML frontmatter.
