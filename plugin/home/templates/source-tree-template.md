---
template_type: "source_tree"
usage: "Document repository structure and organization when using /theway:document to fill documentation gaps"
agent_role: "System Architect documenting codebase structure for team onboarding and navigation"
required_context:
  - "<home>/config.yaml - Global config"
  - "Repository root - Review actual directory structure"
  - "Build configuration files - Understand build artifacts"
quality_standards:
  - "ASCII tree accurately reflects actual repository structure"
  - "Directory purposes clearly explain each folder's role"
  - "Key files are documented with their specific purposes"
  - "Module organization shows relationships between components"
  - "Finding Functionality section helps locate features quickly"
  - "Component relationships diagram shows data/control flow"
  - "Build artifacts locations are accurate"
workflow_steps:
  - "1. Generate repository tree structure (use ls or tree command)"
  - "2. Document purpose of each major directory"
  - "3. Identify and list key files with their roles"
  - "4. Map module organization and dependencies"
  - "5. Create finding functionality guide for common features"
  - "6. Document build output and artifact locations"
best_practices:
  - "Use actual directory structure, not idealized version"
  - "Explain WHY directories exist, not just WHAT they contain"
  - "Include examples of where to find specific functionality"
  - "Update when directory structure changes significantly"
  - "Keep descriptions concise but informative"
  - "Add mermaid diagram for complex component relationships"
---

# Source Tree

## Overview

Source code organization and structure for {{PROJECT_NAME}}.

## Repository Structure

```
{{PROJECT_ROOT}}/
├── {{DIR_1}}/                  # {{DIR_1_PURPOSE}}
│   ├── {{SUBDIR_1}}/          # {{SUBDIR_1_PURPOSE}}
│   └── {{SUBDIR_2}}/          # {{SUBDIR_2_PURPOSE}}
├── {{DIR_2}}/                  # {{DIR_2_PURPOSE}}
├── {{DIR_3}}/                  # {{DIR_3_PURPOSE}}
└── {{CONFIG_FILE}}             # {{CONFIG_FILE_PURPOSE}}
```

## Directory Purposes

### {{DIR_1}}/
{{DIR_1_DESCRIPTION}}

**Key Files:**
- `{{FILE_1}}` - {{FILE_1_PURPOSE}}
- `{{FILE_2}}` - {{FILE_2_PURPOSE}}

### {{DIR_2}}/
{{DIR_2_DESCRIPTION}}

**Key Files:**
- `{{FILE_1}}` - {{FILE_1_PURPOSE}}
- `{{FILE_2}}` - {{FILE_2_PURPOSE}}

### {{DIR_3}}/
{{DIR_3_DESCRIPTION}}

**Key Files:**
- `{{FILE_1}}` - {{FILE_1_PURPOSE}}
- `{{FILE_2}}` - {{FILE_2_PURPOSE}}

## Module Organization

{{MODULE_ORGANIZATION_DESCRIPTION}}

### {{MODULE_1}}
- **Location:** `{{MODULE_1_PATH}}`
- **Purpose:** {{MODULE_1_PURPOSE}}
- **Dependencies:** {{MODULE_1_DEPS}}

### {{MODULE_2}}
- **Location:** `{{MODULE_2_PATH}}`
- **Purpose:** {{MODULE_2_PURPOSE}}
- **Dependencies:** {{MODULE_2_DEPS}}

## File Naming Conventions

- **Source Files:** {{SOURCE_FILE_CONVENTION}}
- **Test Files:** {{TEST_FILE_CONVENTION}}
- **Configuration Files:** {{CONFIG_FILE_CONVENTION}}
- **Documentation Files:** {{DOC_FILE_CONVENTION}}

## Component Relationships

```mermaid
graph TD
    A[{{COMPONENT_1}}] --> B[{{COMPONENT_2}}]
    A --> C[{{COMPONENT_3}}]
    B --> D[{{COMPONENT_4}}]
    C --> D
```

{{COMPONENT_RELATIONSHIPS_DESCRIPTION}}

## Finding Functionality

### {{FEATURE_1}}
**Location:** `{{FEATURE_1_PATH}}`
**Key Files:** {{FEATURE_1_FILES}}

### {{FEATURE_2}}
**Location:** `{{FEATURE_2_PATH}}`
**Key Files:** {{FEATURE_2_FILES}}

### {{FEATURE_3}}
**Location:** `{{FEATURE_3_PATH}}`
**Key Files:** {{FEATURE_3_FILES}}

## Build Artifacts

- **Build Output:** `{{BUILD_OUTPUT_DIR}}/`
- **Test Output:** `{{TEST_OUTPUT_DIR}}/`
- **Distribution:** `{{DIST_DIR}}/`

---

**Last Updated:** {{DATE}}
