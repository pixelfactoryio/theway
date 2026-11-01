---
template_type: "coding_standards"
usage: "Document project-specific coding conventions when using /theway:document to fill documentation gaps"
agent_role: "System Architect documenting coding standards"
required_context:
  - "<home>/config.yaml - Global config"
  - "<home>/standards/core-principles.md, sre.md, web-development.md, quality.md - Opt-in standards (each only if enabled)"
  - "Existing codebase - Review actual patterns and conventions in use"
quality_standards:
  - "Conventions reflect actual codebase patterns (not aspirational)"
  - "Naming conventions table is complete with examples"
  - "Critical rules prevent common mistakes in this codebase"
  - "Error handling patterns match existing code"
  - "Testing requirements are realistic and achievable"
  - "Review checklist is actionable for code reviews"
  - "Language-specific guidelines address real project needs"
workflow_steps:
  - "1. Review existing codebase to identify current patterns"
  - "2. Document languages, runtimes, and linting tools in use"
  - "3. Create naming conventions table from actual code examples"
  - "4. List critical rules that prevent project-specific mistakes"
  - "5. Document error handling and testing patterns from codebase"
  - "6. Create practical review checklist"
best_practices:
  - "Document what IS done, not what SHOULD be done"
  - "Provide real examples from the codebase"
  - "Focus on standards that prevent actual bugs"
  - "Keep critical rules list focused (5-10 items max)"
  - "Make review checklist practical for daily use"
  - "Update as conventions evolve"
---

# Coding Standards

## Overview

Project-specific coding conventions and quality standards for {{PROJECT_NAME}}.

## Languages & Runtimes

- **Primary Language:** {{LANGUAGE}} {{VERSION}}
- **Runtime:** {{RUNTIME}}
- **Style & Linting:** {{LINTER_CONFIG}}

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | {{FILE_CONVENTION}} | {{FILE_EXAMPLE}} |
| Functions | {{FUNCTION_CONVENTION}} | {{FUNCTION_EXAMPLE}} |
| Variables | {{VARIABLE_CONVENTION}} | {{VARIABLE_EXAMPLE}} |
| Constants | {{CONSTANT_CONVENTION}} | {{CONSTANT_EXAMPLE}} |

## Code Organization

- **Module Structure:** {{MODULE_STRUCTURE}}
- **File Organization:** {{FILE_ORGANIZATION}}
- **Import Order:** {{IMPORT_ORDER}}

## Critical Rules

List project-specific rules that prevent common mistakes or enforce architectural patterns:

- **{{RULE_NAME}}:** {{RULE_DESCRIPTION}}
- **{{RULE_NAME}}:** {{RULE_DESCRIPTION}}
- **{{RULE_NAME}}:** {{RULE_DESCRIPTION}}

## Error Handling

- **Pattern:** {{ERROR_PATTERN}}
- **Logging:** {{LOGGING_STANDARD}}
- **Error Types:** {{ERROR_TYPES}}

## Testing Requirements

- **Test Location:** {{TEST_LOCATION}}
- **Naming Convention:** {{TEST_NAMING}}
- **Coverage Target:** {{COVERAGE_TARGET}}
- **Test Organization:** {{TEST_ORGANIZATION}}

## Review Checklist

Before submitting code for review:

- [ ] Code follows naming conventions
- [ ] All critical rules are satisfied
- [ ] Error handling is consistent
- [ ] Tests are written and passing
- [ ] Code is properly documented
- [ ] No security vulnerabilities introduced
- [ ] Performance considerations addressed

## Language-Specific Guidelines

### {{LANGUAGE_NAME}}

- **{{GUIDELINE_TOPIC}}:** {{GUIDELINE_DETAIL}}
- **{{GUIDELINE_TOPIC}}:** {{GUIDELINE_DETAIL}}

---

**Last Updated:** {{DATE}}
