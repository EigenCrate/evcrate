# Phase 01: Scaffold Demo Project

## Context Links

- Parent plan: [plan.md](./plan.md)
- Project docs: `docs/codebase-summary.md`, `docs/code-standards.md`, `docs/system-architecture.md`
- Skill source: `.claude/skills/web-testing/SKILL.md`

## Overview

- Date: 2026-07-10
- Priority: P2
- Implementation status: Completed
- Review status: Approved, 9/10
- Description: Create the smallest useful Vite + TypeScript app surface for testing browser release gates.

## Key Insights

- The demo is a validation surface for the skill, not a product.
- Keep it isolated under `examples/simple-web-testing-demo/` to avoid polluting devkit core.
- Avoid backend, database, auth, or real payment semantics.
- Vite 8 requires Node.js `>=20.19` or `>=22.12`; this applies to the isolated example app, not the devkit root package.

## Requirements

- Create a Vite + TypeScript demo app.
- Add npm scripts for dev, build, preview, and future tests.
- Use semantic HTML from the first commit.
- Keep files small and readable.

## Architecture

- Static Vite app served locally.
- Single page stateful UI.
- No external API dependencies.
- Later gates test browser behavior against local dev/preview server.

## Related Code Files

- Create: `examples/simple-web-testing-demo/package.json`
- Create: `examples/simple-web-testing-demo/package-lock.json`
- Create: `examples/simple-web-testing-demo/tsconfig.json`
- Create: `examples/simple-web-testing-demo/index.html`
- Create: `examples/simple-web-testing-demo/src/main.ts`
- Create: `examples/simple-web-testing-demo/src/styles.css`
- Create: `examples/simple-web-testing-demo/README.md`

## Implementation Steps

1. Scaffold Vite + TypeScript app in `examples/simple-web-testing-demo/`.
2. Remove starter clutter.
3. Add basic build and preview scripts.
4. Document local commands in demo README.

## Todo List

- [x] Create demo directory.
- [x] Initialize package metadata.
- [x] Add minimal Vite source files.
- [x] Confirm `npm run build` works.

## Validation Evidence

- Implementation path: `examples/simple-web-testing-demo/`
- Validation passed: `npm install`; `npm run build`; `npm test`; `npm audit --audit-level=moderate`
- Code review: 9/10, 0 critical, 0 warnings
- Approval: User approved on 2026-07-10

## Success Criteria

- `npm install` succeeds inside demo folder.
- `npm run dev` serves the page.
- `npm run build` emits production assets.
- `npm test` placeholder passes until Phase 03 adds real test tooling.
- `npm audit` passes for the isolated demo dependency set.
- No generated downstream skill folders are edited.

## Risk Assessment

- Risk: Demo expands beyond skill-validation purpose.
- Mitigation: One page, one flow, no persistence.

## Security Considerations

- No secrets, tokens, user data, or external calls.
- Avoid real checkout/payment language that implies financial processing.

## Next Steps

- Phase 02 builds the accessible modal/form flow.