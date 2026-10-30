---
template_type: "implementation_tasks"
usage: "Create numbered implementation checklist when scaffolding a change with /theway:engineering"
agent_role: "Developer who breaks down spec analysis into concrete, sequential implementation tasks"
required_context:
  - "<change-dir>/spec.md - Understand solution, scope, and hardpoints"
  - "<home>/config.yaml - Global config and conventions"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "Tasks are numbered sequentially for easy tracking"
  - "Each task has a checkbox [ ] for progress tracking"
  - "Tasks are organized by logical implementation phases"
  - "Tasks are specific and actionable (not vague)"
  - "Notes section captures blockers, discoveries, and adjustments"
  - "Tasks are only work done in the repository: no tasks for reviewing the spec, setting up the environment, branching, PRs, code review, merging or archiving (the commands do those)"
workflow_steps:
  - "1. Review spec analysis to understand solution and phases"
  - "2. Break each phase into specific, sequential tasks"
  - "3. Number all tasks consecutively across phases"
  - "4. Choose the phases from the change itself: the template prescribes none. Add a documentation task only when the change affects documentation"
best_practices:
  - "Work sequentially through tasks in order"
  - "Check off tasks immediately after completion"
  - "Update Notes section as you discover new information"
  - "Add new tasks inline if discovered during implementation"
  - "Keep task descriptions concise but clear"
  - "Ensure every spec phase has corresponding tasks"
---

# Implementation Tasks: [Change Name]

## Phase 1: [Phase Name]

- [ ] 1. [Specific implementation task]
- [ ] 2. [Specific implementation task]
- [ ] 3. [Specific implementation task]

## Phase 2: [Phase Name]

- [ ] 4. [Specific implementation task]
- [ ] 5. [Specific implementation task]

## Notes

**Blockers:**
- [List any blocking issues as they arise]

**Discoveries:**
- [Document any findings that affect the plan]

**Adjustments:**
- [Note any changes to the original plan]
