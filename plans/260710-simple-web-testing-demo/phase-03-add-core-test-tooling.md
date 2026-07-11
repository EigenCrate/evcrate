# Phase 03: Add Core Test Tooling

## Context Links

- Parent plan: [plan.md](./plan.md)
- Previous phase: [phase-02-build-accessible-browser-flow.md](./phase-02-build-accessible-browser-flow.md)
- Web testing references: `.claude/skills/web-testing/references/playwright-patterns.md`

## Overview

- Date: 2026-07-10
- Priority: P2
- Implementation status: Complete
- Review status: Reviewed - approved with warning
- Description: Add the minimum testing stack needed before applying the full web-testing release gate.

## Key Insights

- Vitest should cover pure validation/state helpers.
- Playwright should cover browser-visible behavior.
- Tooling should use local scripts so the skill can discover project-native commands.

## Requirements

- Add Vitest for unit/integration checks.
- Add Playwright for browser E2E.
- Add npm scripts with clear names.
- Configure Playwright artifacts with failure-focused defaults.
- Avoid arbitrary waits in tests.

## Architecture

- Vitest runs in Node/jsdom if needed for pure helpers.
- Playwright starts or targets local Vite dev/preview server.
- Test files live inside demo project.

## Related Code Files

- Modify: `examples/simple-web-testing-demo/package.json`
- Create: `examples/simple-web-testing-demo/vitest.config.ts`
- Create: `examples/simple-web-testing-demo/playwright.config.ts`
- Create: `examples/simple-web-testing-demo/src/validation.test.ts`
- Create: `examples/simple-web-testing-demo/tests/demo-flow.spec.ts`

## Implementation Steps

1. Install dev dependencies: Vitest, Playwright, TypeScript helpers as needed.
2. Add Vitest config and tests for validation states.
3. Add Playwright config with `trace: on-first-retry`, screenshot only on failure, video retain on failure.
4. Add E2E test for open modal, validation, submit success, Escape close, focus behavior.
5. Run narrow commands before broader gate.

## Todo List

- [x] Add test dependencies.
- [x] Add unit tests for validation helper.
- [x] Add Playwright config.
- [x] Add browser flow test with role/name selectors.
- [x] Add npm scripts: `test`, `test:e2e`.

## Success Criteria

- `npm run test` passes.
- `npm run test:e2e` passes.
- Playwright test uses user-facing locators.
- No `waitForTimeout` appears in tests.

## Risk Assessment

- Risk: CI/browser install makes demo heavy.
- Mitigation: Keep projects to Chromium initially; document broader browser expansion as optional.

## Security Considerations

- Tests run only local app.
- No third-party services or credentials.

## Next Steps

- Phase 04 applies full `web-testing` release gate.
- Before committing Phase 03, ignore or remove generated Playwright `test-results/` artifacts.