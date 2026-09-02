# Project Changelog

## Unreleased

**Updated:** 2026-09-02
**Status:** Phase 9 complete; Phases 10–11 remain planned

### Phase 9: DamHopper and Agent Store integration

#### Features

- Add `test:phase9` to `package.json`: build the TypeScript CLI, then run all integration contracts.
- Extend package closure for packed consumers: `.evcrate/source/.evcrate/**`, `.evcrate/registry.json`, and `.evcrate/build-manifest*.json`.
- Resolve package roots for packed and external consumers from explicit package/source/cwd inputs; retain module-root version fallback.
- Preserve shared-JSON source fragments during TypeScript publication planning; skip only the generated shared destination.
- Keep DamHopper outside EVCrate artifact ownership. No DamHopper production code or direct registry/scope/manifest/HOME mutation is added here.

#### DamHopper adapter

- `tests/integration/dam-hopper-client.mjs` invokes the packed `evcrate` CLI as a short-lived subprocess with fixed argv, bounded output (`10 MiB`), a `30 s` default deadline, and sanitized environment.
- `tests/integration/dam-hopper-commands.mjs` builds discovery/get, import preview/apply, scope, changes, publish, and recover invocations.
- `tests/integration/dam-hopper-errors.mjs` maps client/CAS errors and rejects counsel/checkpoint fields recursively. Empty, malformed, unsupported, timeout, and error envelopes fail closed.
- Top-level `health` is qualification-only diagnostic data. The adapter cannot synthesize counsel, retry another backend, alter routing, or use the control-plane CLI as an advisor proxy.

#### Tests

- `npm run test:phase9` passed **14/14** integration tests after a clean build.
- Six adapter tests cover successful resource and diagnostic envelopes, CAS conflict mapping, counsel-proxy rejection, malformed/empty output, and timeout handling.
- Six fixture tests validate resource-control/diagnostic v1 schemas, expected statuses, CAS/error handling, and negative counsel-proxy detection.
- Two packed-consumer lifecycle tests cover npm pack/install SHA-256 verification, version/discovery/get, import preview/apply, scope assignment/CAS/disable/enable/remove, independent OMP/Copilot publication, OMP recovery, and diagnostic health.
- Aggregate focused evidence: **212/212** tests; code review **9.8/10**; advisor approved.

#### Compatibility fixtures

`tests/fixtures/dam-hopper-v1/` records bounded protocol v1 request/response pairs for:

- `discovery.json` — resource listing
- `import-preview.json` and `import-apply.json` — explicit import transaction
- `scope-mutation.json` — scope assignment and revision vector
- `publish-apply.json` — selected-target publication
- `health-qualification.json` — qualification-only diagnostic
- `conflict-and-errors.json` — retryable CAS conflict and validation error
- `negative-proxy.json` — forbidden counsel fields in resource and health payloads

#### Release boundary

Phase 9 proves the feature-worktree packed npm/adapter contract only. It does not claim a live DamHopper or Agent Store release, installed vendor-CLI qualification, target cutover, Python-free distribution, rollout, or `main` merge. Generated projections, controller files, advisor policy, manifests, registry, scopes, and HOME roots remain EVCrate-owned artifacts.

## Unresolved questions

- Confirm whether this docs-facing changelog should remain a Phase release mirror while `CHANGELOG.md` remains the repository release authority.
