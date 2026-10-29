---
template_type: "implementation_tasks"
usage: "Create numbered implementation checklist when scaffolding a change with /theway:engineering"
agent_role: "Full-stack developer who breaks down spec analysis into concrete, sequential implementation tasks"
required_context:
  - "~/.theway/<project>/changes/[change-id]/spec.md - Understand solution, scope, and hardpoints"
  - "~/.theway/config.yaml - Global config and conventions"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "Tasks are numbered sequentially for easy tracking"
  - "Each task has a checkbox [ ] for progress tracking"
  - "Tasks are organized by logical implementation phases"
  - "Tasks are specific and actionable (not vague)"
  - "Estimated time provided for each phase"
  - "Notes section captures blockers, discoveries, and adjustments"
  - "Tasks are only work done in the repository: no tasks for reviewing the spec, setting up the environment, branching, PRs, code review, merging or archiving (the commands do those)"
workflow_steps:
  - "1. Review spec analysis to understand solution and phases"
  - "2. Break each phase into specific, sequential tasks"
  - "3. Number all tasks consecutively across phases"
  - "4. Estimate time for each phase realistically"
  - "5. Include testing and documentation tasks"
best_practices:
  - "Work sequentially through tasks in order"
  - "Check off tasks immediately after completion"
  - "Update Notes section as you discover new information"
  - "Add new tasks inline if discovered during implementation"
  - "Keep task descriptions concise but clear"
  - "Ensure every spec phase has corresponding tasks"
---

# Implementation Tasks: [Change Name]

## Overview

**Total Estimated Effort:** [Time estimate]
**Target Completion:** [Date]

## Phase 1: [Core Implementation Phase Name]

**Estimated Time:** [Duration]

- [ ] 1. [Specific implementation task]
- [ ] 2. [Specific implementation task]
- [ ] 3. [Specific implementation task]
- [ ] 4. [Specific implementation task]
- [ ] 5. [Specific implementation task]

## Phase 2: [Secondary Implementation Phase Name]

**Estimated Time:** [Duration]

- [ ] 6. [Specific implementation task]
- [ ] 7. [Specific implementation task]
- [ ] 8. [Specific implementation task]
- [ ] 9. [Specific implementation task]

## Phase 3: Testing

**Estimated Time:** [Duration]

- [ ] 10. Write unit tests for [component]
- [ ] 11. Write integration tests for [flow]
- [ ] 12. Add end-to-end tests for [scenario]
- [ ] 13. Test error scenarios and edge cases
- [ ] 14. Verify performance requirements
- [ ] 15. Manual testing and validation

## Phase 4: Documentation

**Estimated Time:** [Duration]

- [ ] 16. Update API documentation
- [ ] 17. Update architecture docs (if needed)
- [ ] 18. Update README/user docs

## Notes

**Blockers:**
- [List any blocking issues as they arise]

**Discoveries:**
- [Document any findings that affect the plan]

**Adjustments:**
- [Note any changes to the original plan]
