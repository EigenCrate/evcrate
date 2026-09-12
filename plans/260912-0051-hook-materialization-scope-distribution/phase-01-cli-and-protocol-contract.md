# Phase 01 — CLI and Protocol Contract

## Context links

- [Master plan](./plan.md)
- [Design contracts §§1–2](./design-contracts.md)
- [Acceptance A01–A08](./acceptance-matrix.md)
- [Pre-plan §§1.1–1.6](../reports/pre_plan_scope_distribute.md)
- [CLI/protocol research](./research/researcher-01-cli-protocol-adapters.md)
- Current: `docs/system-architecture.md` §§3–4; `docs/code-standards.md` protocol/error taxonomy

## Overview

- **Date:** 2026-09-12
- **Description:** Freeze scope parsing, exact publication wire shapes, partial results, exit mapping, and end-to-end forwarding before transaction work.
- **Priority:** P2
- **Implementation status:** DONE (2026-09-12) — 100%
- **Review status:** completed — 9.5/10, no blocking issues

## Key Insights

- Initial CLI and protocol assumptions are now resolved: `--scope` is a single scalar with a `home` default and an explicit publication-command gate.
- Publication requests and results use one frozen authority with exact keys, ordered `shared`/`harness` phases, identity pairing, and bounded partial results.
- Request-file validation delegates to the same publication authority; compatibility distribution preserves typed publication payloads instead of discarding them.
- Destination correlation is phase-specific and does not serialize uncontrolled absolute paths.
- Runtime project materialization remains intentionally deferred; the current publisher rejects non-HOME execution at its later-phase capability boundary.

## Requirements

1. Add `PublicationScope = 'home' | 'project'`; exact scalar parser; default `home`.
2. Accept scope only for `publish`, `recover`, `distribute publish|all|recover`; reject it for build/check and unrelated commands.
3. Publish request exact keys: `scope`, `selectedTargets`. Recover: `scope`, `projectIdentity`, `releaseId`.
4. Enforce `projectIdentity === null` for HOME and canonical 64-hex identity for project.
5. Replace flat publish output with ordered `shared`/`harness` phase records described in `design-contracts.md`.
6. Add destination-aware phase correlation without exposing uncontrolled absolute paths.
7. Add top-level resource `partial`, legal only after shared commit plus project harness failure, with sanitized `PUBLICATION_FAILED` or `ROLLBACK_FAILED` and exit 5.
8. Forward scope/identity through direct CLI, request-file, runtime handler, typed authority, and publication-bearing compatibility paths.

## Architecture

### Dataflow

`argv or bounded request file → parse/validate scope → resolve invocation context → build exact ResourceRequest → typed publication handler → validate phase payload → correlate each phase with destination policy → ResourceResult → exit mapping`

### Wire state transitions

| Input/result state | Transition | Output |
|---|---|---|
| scope omitted on accepted CLI command | parser default | `home` |
| invalid/duplicate/unrelated scope | parse/command gate | usage/validation error before dispatch |
| HOME publish success | validate two records | success; shared/harness use same release |
| project publish success | validate two records | success; independent releases |
| shared phase failure | ordinary error path | resource `error`, exit 5 |
| shared committed, harness fails | partial factory | resource `partial`, exit 5 |
| recovery | identity/scope correlation | only requested state-domain phase records |

## Related code files

- **Modify** `src/cli/arguments.ts`: `CliCommand`, `CliOptions`, `VALUE_OPTIONS`, `SCALAR_OPTIONS`, `commandFromPositionals`, `parseArguments`.
- **Modify** `src/protocol/publication-payloads.ts`: request/result types, scope/identity/phase validators, binding validation limits.
- **Modify** `src/protocol/resource-control.ts`: `ResourceResult`, exact result keys, partial validator/factory, publication result budget.
- **Modify** `src/protocol/resource-payloads.ts`: publication request/result delegation.
- **Modify** `src/protocol/index.ts`: export new frozen types/factories.
- **Modify** `src/cli/dispatch.ts`: request construction, `publicationResult`, phase/destination correlation, recovery identity checks.
- **Modify** `src/cli/compatibility-distribution.ts`: `runTypedPublication`, `runCompatibilityDistribution`; retain typed payload/partial.
- **Modify** `src/distribution/local-build.ts`: `runLocalDistribution`; accept/return publication request/outcome instead of dropping it.
- **Modify** `src/cli/types.ts`: publication handler/runtime signatures.
- **Modify** `src/cli/output.ts`: `statusText`, `exitCodeForResult` partial mapping.
- **Modify later in Phase 07** existing CLI/protocol test files; do not create duplicate suites here.

## Implementation Steps

1. Define scope type/parser once in publication protocol or CLI boundary; import rather than duplicate literals.
2. Add `--scope` to scalar option parsing, materialize default `home`, and apply an explicit command acceptance matrix after command recognition.
3. Implement exact request validators and project-identity pairing. Keep request size/credential/counsel rejection unchanged.
4. Introduce dry-run, apply, and recovery phase-record validators with exhaustive phase order, scope, target, binding, release, and retention invariants.
5. Add `ResourcePartialResult`; constrain allowed operations and serialized error codes; include it in result size, rendering, and exit policy.
6. Replace flat HOME correlation in dispatch with phase-specific expected bindings supplied by context/manifest declarations. Shared expectation is fixed.
7. Thread scope and identity through handler interfaces, typed publication calls, `runLocalDistribution`, and compatibility responses.
8. Ensure request-file envelopes use exactly the same validators and cannot override positional scope ambiguously.
9. Hand frozen interfaces to Phases 02, 04, and 06 before they edit callers.

## Todo list

- [x] Parse scalar scope and enforce command matrix.
- [x] Freeze exact publish/recover requests.
- [x] Freeze dry-run/apply/recovery phase result records.
- [x] Add constrained partial resource result and exit 5.
- [x] Implement destination-aware correlation.
- [x] Forward direct, request-file, typed, and compatibility paths.
- [x] Export one protocol authority and remove obsolete flat types/callers.

## Success Criteria

- Omitted scope yields HOME only on accepted publication commands.
- Invalid, duplicate, or unrelated scope fails before handler execution.
- Exact-key protocol rejects legacy flat results and invalid scope/identity/phase combinations.
- Shared is first, HOME-scoped, target-empty, and `.evcrate/bin`-only.
- Valid partial serializes one approved error and `exitCodeForResult` returns 5.
- Direct, request-file, and compatibility calls produce equivalent correlated payloads.

## Completion evidence

- Fallback validation after the approved compatibility identity correction passed: `npm run build`; `npm run test:protocol` (21/21); `npm run test:cli` (42/42); `npm run test:integration` (14/14); `npm run test:publication` (53/53).
- Final code review scored 9.5/10 with no blocking or critical issues. Request-file `distribute.recover` rejects a wrong project identity as `PROTOCOL_INVALID` before engine/capability dispatch.
- The mandatory tester agent could not start because of an Oh My Pi orchestration/schema failure; the debugger found no repository command or repository failure in that path. Parent fallback commands supplied the validation evidence above.

Planned focused verification after implementation:

```sh
npm run test:protocol
npm run test:cli
npm run test:integration
```

## Risk Assessment

- **Failure:** broadening partial to ordinary errors hides whether shared committed. **Mitigation:** operation/status/phase invariant in one validator/factory.
- **Failure:** correlation still assumes HOME names. **Mitigation:** derive expected bindings per phase/destination.
- **Performance:** nested phase validation walks change arrays twice. **Mitigation:** preserve existing bounded change count and validate each record once.
- **Compatibility:** old callers omit scope. **Mitigation:** CLI default applies before request creation; versioned request files remain exact and must carry required scope.

## Security Considerations

- Preserve strict JSON, exact keys, bounded values, credential/counsel rejection, and sanitized errors.
- Do not serialize raw absolute destinations or exception paths.
- Validate project identity syntax and context correlation before state access.
- Never infer partial from arbitrary caught errors.

## Next steps/handoffs

- Phase 02 consumes frozen scope/identity names for project descriptors.
- Phase 04 consumes frozen phase-record shapes.
- Phase 06 implements statuses/releases/partial semantics behind these validators.
- Phase 07 adds behavior-defending protocol and CLI fixtures.
