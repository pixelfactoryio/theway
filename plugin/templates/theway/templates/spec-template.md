---
template_type: "value_engineering"
usage: "Create Spec analysis when planning medium-to-large changes requiring TAMM hardpoint analysis"
agent_role: "Spec Analyst who analyzes solutions using the TAMM framework (Time/Autonomy/Mastery/Machine)"
required_context:
  - "<home>/config.yaml - Global config"
  - "<home>/data/standards/tamm-framework.md - TAMM framework"
  - "<home>/data/standards/core-principles.md, sre.md, web-development.md, quality.md - Opt-in standards (each only if enabled)"
  - "docs/architecture/coding-standards.md - Project coding standards (if exists)"
quality_standards:
  - "TAMM table includes only Medium/High risk hardpoints (skip low-risk items)"
  - "Technical decisions have clear rationale explaining trade-offs"
  - "Scope clearly defines in-scope and out-of-scope boundaries"
  - "Implementation phases align with tasks.md structure"
  - "Countermeasures are specific and actionable (not generic)"
  - "Success criteria are measurable with checkboxes"
workflow_steps:
  - "1. Understand the problem and proposed solution clearly"
  - "2. Identify key components and technical decisions"
  - "3. Analyze each TAMM dimension for Medium/High risks only"
  - "4. Define clear scope boundaries (in/out of scope)"
  - "5. Break implementation into logical phases with milestones"
  - "6. Create measurable success criteria"
best_practices:
  - "Challenge assumptions: 'What would we need for this to work?'"
  - "Cover every part of the system the change touches"
  - "Consider edge cases, error scenarios, and operational concerns"
  - "Focus on medium/high-risk hardpoints only - skip low-risk items"
  - "Keep analysis practical and actionable, not verbose"
---

# Spec Analysis: [Change Name]

## Solution

**Problem:** [1-2 sentence problem statement]

**Proposed Solution:**

[2-3 paragraphs describing the technical solution. Focus on what you're building/changing and how it addresses the problem.]

**Key Components:**
- **[Component 1]:** Brief description
- **[Component 2]:** Brief description
- **[Component 3]:** Brief description

## Technical Approach

**Technical Decisions:**
- **[Decision 1]:** [Rationale]
- **[Decision 2]:** [Rationale]
- **[Decision 3]:** [Rationale]

**Architecture Changes:**
[Describe any architectural changes or patterns being introduced]

**Data Model Changes:**
[Describe any database schema, data structure, or storage changes. Omit if none.]

**API Changes:**
[Describe any API changes, new endpoints, or contract modifications. Omit if none.]

## Scope

**In Scope:**
- [What will be included]
- [What will be addressed]
- [What will be built]

**Out of Scope:**
- [What will not be included]
- [What will be deferred]
- [What is explicitly excluded]

## Hardpoints (TAMM Analysis)

**Only document Medium/High risk hardpoints. Omit low-risk items.**

| Category | Risk | Impact | Countermeasures |
|----------|------|--------|-----------------|
| Time (T) | Med/High | [How this constraint affects delivery timeline] | 1. [Countermeasure]<br>2. [Countermeasure]<br>3. [Countermeasure] |
| Autonomy (A) | Med/High | [How this constraint affects decision-making] | 1. [Countermeasure]<br>2. [Countermeasure] |
| Mastery (M) | Med/High | [How this gap affects implementation quality] | 1. [Countermeasure]<br>2. [Countermeasure] |
| Machine (M) | Med/High | [How this limitation constrains the solution] | 1. [Countermeasure]<br>2. [Countermeasure] |

**TAMM Legend:**
- **Time**: Timeline constraints, dependencies, blocking risks
- **Autonomy**: Decision authority, organizational constraints, approval needs
- **Mastery**: Skill gaps, knowledge requirements, learning curves
- **Machine**: System limitations, performance constraints, infrastructure issues

## Implementation

**Phases:**

**Phase 1: [Phase Name]**
- [High-level milestone]
- [High-level milestone]

**Phase 2: [Phase Name]**
- [High-level milestone]
- [High-level milestone]

**Phase 3: [Phase Name]**
- [High-level milestone]
- [High-level milestone]

**Success Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
- [ ] [Criterion 4]
