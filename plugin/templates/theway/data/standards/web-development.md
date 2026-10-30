# Web Development Standards

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

**Performance Targets:** API <200ms (p95), pages <2s initial/<500ms nav, DB <100ms (p95)

## Applying

- Specs cover frontend, backend, API, migrations and monitoring

Apply these pragmatically based on project context.
