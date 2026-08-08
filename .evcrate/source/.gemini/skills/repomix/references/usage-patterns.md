# Usage Patterns

Practical workflows for using Repomix with AI tools.

## AI Analysis Workflows

### Full Repository
```bash
repomix --remove-comments --style markdown -o full-repo.md
```
**Use:** New codebase, architecture review, complete LLM context, planning
**Tips:** Remove comments, use markdown, check token limits, review before sharing

### Focused Module
```bash
repomix --include "src/auth/**,src/api/**" -o modules.xml
```
**Use:** Feature analysis, debugging specific areas, targeted refactoring

### Incremental Analysis
```bash
git checkout feature-branch && repomix --include "src/**" -o feature.xml
git checkout main && repomix --include "src/**" -o main.xml
```
**Use:** Feature branch review, change impact, before/after comparison

### Cross-Repository
```bash
npx repomix --remote org/repo1 -o repo1.xml
npx repomix --remote org/repo2 -o repo2.xml
```
**Use:** Microservices, library comparisons, consistency checks

## Documentation

### Doc Context
```bash
repomix --include "src/**,docs/**,*.md" --style markdown -o doc-context.md
```

### API Documentation
```bash
repomix --include "src/api/**,src/routes/**,src/controllers/**" --remove-comments -o api-context.xml
```
**Workflow:** Package → AI → OpenAPI/Swagger → endpoint docs → examples

### Architecture
```bash
repomix --include "src/**/*.ts,*.md" -i "**/*.test.ts" --style markdown -o architecture.md
```

## Library Evaluation

### Quick Assessment
```bash
npx repomix --remote owner/library --style markdown -o library-eval.md
```
**Evaluate:** Code quality, architecture, dependencies, tests, docs, maintenance

### Feature Comparison
```bash
npx repomix --remote owner/lib-a --style xml -o lib-a.xml
npx repomix --remote owner/lib-b --style xml -o lib-b.xml
```

### Migration Planning
```bash
repomix --include "node_modules/old-lib/**" -o old-lib.xml
npx repomix --remote owner/new-lib -o new-lib.xml
```

## Best Practices

**Planning:** Define scope → identify files → check token limits → consider security

**Execution:** Start broad, refine narrow → use appropriate format → enable security checks → monitor tokens

**Review:** Verify no sensitive data → check completeness → validate format → test with LLM

**Iteration:** Refine patterns → adjust format → optimize tokens → document patterns

See [Audit & Integration](./audit-and-integration.md) for security audit, CI/CD, git hooks, language-specific, and troubleshooting patterns.
