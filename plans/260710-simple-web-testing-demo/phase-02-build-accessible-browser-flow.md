# Phase 02: Build Accessible Browser Flow

## Context Links

- Parent plan: [plan.md](./plan.md)
- Previous phase: [phase-01-scaffold-demo-project.md](./phase-01-scaffold-demo-project.md)
- Web testing references: `.claude/skills/web-testing/references/release-gate.md`, `.claude/skills/web-testing/references/playwright-patterns.md`

## Overview

- Date: 2026-07-10
- Priority: P2
- Implementation status: Completed
- Review status: Approved, user-approved
- Description: Add one meaningful browser interaction flow that can expose click, keyboard, focus, validation, and layout failures.

## Key Insights

- The UI should be simple but not trivial.
- A modal/form flow is ideal because it tests real browser behavior and accessibility.
- Tests should be able to use `getByRole`, `getByLabel`, and visible assertions.

## Requirements

- Main page with heading and action button.
- Dialog/modal opens from user action.
- Form includes labeled input and submit/cancel controls.
- Empty input shows accessible validation error.
- Valid submit closes or confirms with visible success status.
- Escape closes dialog; focus behavior is predictable.

## Architecture

- `main.ts` owns small app state and DOM rendering.
- `validation.ts` can hold pure helper logic for Vitest.
- Modal uses semantic `dialog` or ARIA-backed equivalent.
- UI text is stable enough for role/name selectors.

## Related Code Files

- Modify: `examples/simple-web-testing-demo/src/main.ts`
- Modify: `examples/simple-web-testing-demo/src/styles.css`
- Create: `examples/simple-web-testing-demo/src/validation.ts`

## Implementation Steps

1. Build visible page shell.
2. Add modal open/close controls.
3. Add labeled input, validation, and success state.
4. Add keyboard handling and focus return.
5. Keep copy stable and accessible.

## Todo List

- [x] Add accessible heading and primary button.
- [x] Add modal/form behavior.
- [x] Add validation helper.
- [x] Add status or confirmation region.
- [x] Verify keyboard manually before writing tests.

## Validation Evidence

- Implementation path: `examples/simple-web-testing-demo/`
- Review: User-approved on 2026-07-10
- Completion: Phase 02 implementation done on 2026-07-10

## Success Criteria

- User can complete the flow with mouse.
- User can complete or exit the flow with keyboard.
- Controls have accessible names.
- Validation error is visible and announced or associated.

## Risk Assessment

- Risk: Custom modal becomes inaccessible.
- Mitigation: Prefer native `dialog`; test focus and Escape behavior.

## Security Considerations

- Treat all input as demo-only text.
- Do not store or transmit data.

## Next Steps

- Phase 03 adds Vitest and Playwright tooling.