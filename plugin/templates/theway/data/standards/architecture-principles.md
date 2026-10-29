# SRE-EE Architecture Principles

## Core Principles

**Operational Excellence:**
- Reliability First - Design stable, resilient systems
- Observability - Make systems transparent and measurable
- Maintainability - Build systems easy to change and evolve
- Self-Service - Enable team independence
- Automation - Reduce manual intervention

**Architecture Philosophy:**
- Progressive Complexity - Start simple, scale when needed
- Security at Every Layer - Defense in depth
- User Experience Drives Architecture - Start with journeys, work backward
- Pragmatic Technology - Boring tech where possible, exciting when necessary
- Cost-Conscious Engineering - Balance ideals with reality
- Data-Centric Design - Let data requirements drive architecture

## Web Development Standards

**Frontend:**
- Component-based architecture
- Desktop-first for internal tools
- Performance: <2s initial load, <500ms navigation
- Low cognitive load, consistent patterns

**API Design:**
- Resource-based URLs: `/api/v1/services/{id}`
- Correct HTTP verbs: GET (read), POST (create), PUT (update), DELETE (remove)
- Consistent response formats
- OpenAPI/Swagger documentation

**Backend:**
- Single Responsibility - One clear purpose per service
- Loose Coupling - Minimize service dependencies
- Stateless Where Possible - Simplify scaling
- Infrastructure as Code - Version all infrastructure

## Quality Standards

**Testing:** Unit tests, integration tests, end-to-end tests, load tests
**Deployment:** CI/CD, feature flags, rollback plans
**Monitoring:** Structured logs, metrics, tracing, actionable alerts
**Security:** Authentication, authorization, encryption, input validation, least privilege
**Performance Targets:** API <200ms (p95), pages <2s initial/<500ms nav, DB <100ms (p95)

## References

Apply principles pragmatically based on project context. Update as practices evolve.
