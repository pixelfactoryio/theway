---
template_type: "tech_stack"
usage: "Document technology choices, dependencies, and rationale when using /theway:document to fill documentation gaps"
agent_role: "System Architect documenting technology stack decisions"
required_context:
  - "<home>/config.yaml - Global config"
  - "<home>/standards/core-principles.md, sre.md, web-development.md, quality.md - Opt-in standards (each only if enabled)"
  - "Package files (package.json, requirements.txt, go.mod, etc.) - Actual dependencies"
  - "Infrastructure configs (terraform, k8s manifests), if any - Deployment tech"
quality_standards:
  - "Technology stack table includes version, purpose, and rationale, with a row only for each category the repository uses"
  - "Core dependencies list is accurate from package files"
  - "Technical decisions explain trade-offs and alternatives considered"
  - "Infrastructure and deployment tools are documented when the repository has them"
  - "Version constraints reflect actual compatibility requirements"
  - "Migration notes capture historical context"
  - "Rationales explain WHY choices were made, not just WHAT"
workflow_steps:
  - "1. Review package files to identify all dependencies"
  - "2. Document cloud provider and key services in use, if any"
  - "3. Create technology stack table with versions and rationales"
  - "4. List core dependencies with their purposes"
  - "5. Document development tools, and the infrastructure setup if any"
  - "6. Capture technical decisions with trade-offs"
  - "7. Add version constraints and update policies"
best_practices:
  - "Document actual versions in use, not aspirational ones"
  - "Explain WHY each technology was chosen (trade-offs, alternatives)"
  - "Include migration notes for historical context"
  - "Update when major dependencies change"
  - "Reference ADRs (Architecture Decision Records) if they exist"
  - "Keep rationales concise but informative"
  - "Write only the sections and table rows the repository shows evidence for (package files, IaC, deploy configs); omit the others"
---

# Tech Stack

## Overview

Technology choices, dependencies, and rationale for {{PROJECT_NAME}}.

## Cloud Infrastructure
[Omit this section if the repository has none.]

- **Provider:** {{CLOUD_PROVIDER}}
- **Key Services:** {{CORE_SERVICES}}
- **Deployment Regions:** {{REGIONS}}

## Technology Stack

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| **Language** | {{LANGUAGE}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Framework** | {{FRAMEWORK}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Database** | {{DATABASE}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Cache** | {{CACHE}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Message Queue** | {{QUEUE}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Build Tool** | {{BUILD_TOOL}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **IaC** | {{IAC_TOOL}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Monitoring** | {{MONITORING}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |
| **Logging** | {{LOGGING}} | {{VERSION}} | {{PURPOSE}} | {{RATIONALE}} |

## Core Dependencies

### {{LANGUAGE}} Dependencies

```{{PACKAGE_FILE_FORMAT}}
{{DEPENDENCY_1}} = "{{VERSION}}"  # {{PURPOSE}}
{{DEPENDENCY_2}} = "{{VERSION}}"  # {{PURPOSE}}
{{DEPENDENCY_3}} = "{{VERSION}}"  # {{PURPOSE}}
```

**Key Libraries:**
- **{{LIBRARY_1}}** ({{VERSION}}) - {{LIBRARY_1_PURPOSE}}
- **{{LIBRARY_2}}** ({{VERSION}}) - {{LIBRARY_2_PURPOSE}}
- **{{LIBRARY_3}}** ({{VERSION}}) - {{LIBRARY_3_PURPOSE}}

## Development Tools

- **IDE:** {{IDE_RECOMMENDATION}}
- **Linter:** {{LINTER}} {{VERSION}}
- **Formatter:** {{FORMATTER}} {{VERSION}}
- **Test Runner:** {{TEST_RUNNER}} {{VERSION}}
- **Local Development:** {{LOCAL_DEV_TOOLS}}

## Infrastructure & Deployment
[Omit this section if the repository has none.]

### Deployment Tools
- **Container Runtime:** {{CONTAINER_RUNTIME}} {{VERSION}}
- **Orchestration:** {{ORCHESTRATION}} {{VERSION}}
- **CI/CD:** {{CICD_PLATFORM}}

### Infrastructure as Code
- **Tool:** {{IAC_TOOL}} {{VERSION}}
- **State Management:** {{STATE_MANAGEMENT}}
- **Module Structure:** {{MODULE_STRUCTURE}}

## Database & Storage
[Omit this section if the repository has none.]

### Primary Database
- **Type:** {{DB_TYPE}}
- **Technology:** {{DB_TECH}} {{VERSION}}
- **Driver:** {{DB_DRIVER}} {{VERSION}}
- **Migration Tool:** {{MIGRATION_TOOL}}

### Storage Solutions
- **Object Storage:** {{OBJECT_STORAGE}}
- **File Storage:** {{FILE_STORAGE}}
- **Cache:** {{CACHE_SOLUTION}} {{VERSION}}

## Monitoring & Observability
[Omit this section if the repository has none.]

- **Metrics:** {{METRICS_PLATFORM}}
- **Logging:** {{LOGGING_PLATFORM}}
- **Tracing:** {{TRACING_PLATFORM}}
- **Alerting:** {{ALERTING_PLATFORM}}

## Security Tools
[Omit this section if the repository has none.]

- **Secrets Management:** {{SECRETS_TOOL}}
- **Authentication:** {{AUTH_METHOD}}
- **Authorization:** {{AUTHZ_METHOD}}
- **Security Scanning:** {{SECURITY_SCANNER}}

## Version Constraints

### Compatibility Requirements
- {{CONSTRAINT_1}}
- {{CONSTRAINT_2}}
- {{CONSTRAINT_3}}

### Update Policy
- **Major Versions:** {{MAJOR_VERSION_POLICY}}
- **Minor Versions:** {{MINOR_VERSION_POLICY}}
- **Patch Versions:** {{PATCH_VERSION_POLICY}}
- **Security Updates:** {{SECURITY_UPDATE_POLICY}}

## Technical Decisions

### {{DECISION_TOPIC_1}}
**Decision:** {{DECISION_1}}
**Rationale:** {{RATIONALE_1}}
**Trade-offs:** {{TRADEOFFS_1}}

### {{DECISION_TOPIC_2}}
**Decision:** {{DECISION_2}}
**Rationale:** {{RATIONALE_2}}
**Trade-offs:** {{TRADEOFFS_2}}

### {{DECISION_TOPIC_3}}
**Decision:** {{DECISION_3}}
**Rationale:** {{RATIONALE_3}}
**Trade-offs:** {{TRADEOFFS_3}}

## Migration Notes

{{MIGRATION_NOTES}}

---

**Last Updated:** {{DATE}}
