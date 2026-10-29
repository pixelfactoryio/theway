# TAMM Framework

## Overview

The **Time/Autonomy/Mastery/Machine (TAMM)** framework identifies potential obstacles in technical implementations during Spec analysis.

## Quick Reference

**Time Hardpoints:**
- Timeline pressures, compressed schedules, external deadlines
- Dependencies and blocking, critical path bottlenecks
- Resource contention, competing priorities
- Countermeasures: Timeline buffering, parallel work, resource reallocation

**Autonomy Hardpoints:**
- Decision-making constraints, approval bottlenecks
- Organizational dependencies, policy constraints
- Communication barriers, stakeholder alignment
- Countermeasures: Pre-approval, delegation, streamlined processes

**Mastery Hardpoints:**
- Skill gaps, technology unfamiliarity, domain expertise
- Learning curves, complex systems, best practices
- Knowledge transfer, documentation gaps, key person dependencies
- Countermeasures: Training, pair programming, expert consultation

**Machine Hardpoints:**
- Performance constraints, scalability limits, latency requirements
- Infrastructure limitations, legacy systems, security constraints
- Integration challenges, API limitations, protocol mismatches
- Technical debt, code quality issues, architecture limitations
- Countermeasures: Infrastructure upgrades, optimization, refactoring

## Analysis Questions

**Time Questions:**
- "What could cause delays in this timeline?"
- "Where are the critical path bottlenecks?"
- "What external factors could impact timing?"

**Autonomy Questions:**
- "Who needs to approve this decision?"
- "What organizational constraints exist?"
- "Where might we get blocked by process?"

**Mastery Questions:**
- "What skills are required that we don't have?"
- "What knowledge gaps exist?"
- "Where might we struggle technically?"

**Machine Questions:**
- "What are the system limitations?"
- "Where might performance be an issue?"
- "What technical constraints exist?"

## Compound Hardpoints

Some challenges span multiple dimensions:

**Time + Mastery:** Learning while delivering, training overhead
**Autonomy + Machine:** Architecture decisions needing approval, infrastructure access requiring permission
**Time + Autonomy + Mastery:** External expertise coordination, knowledge transfer timing

## Risk Level Guidelines

**Low Risk:** Clear countermeasures available, team has experience, no blockers expected
**Medium Risk:** Some uncertainty, team has limited experience, potential blockers but manageable
**High Risk:** Unclear countermeasures, team lacks experience, likely blockers or critical dependencies

## Common Pitfalls

- **Optimism Bias** - Underestimating challenge severity
- **Single Dimension Focus** - Missing cross-dimensional issues
- **Generic Solutions** - Applying standard fixes without context
- **Analysis Paralysis** - Over-analyzing without moving to action

## Validation Methods

- **Pre-mortem Analysis** - Imagine the project failed, why?
- **Stakeholder Interviews** - Get perspectives from different roles
- **Historical Analysis** - Review similar past projects
- **Expert Review** - Get input from experienced team members
