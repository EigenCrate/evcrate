# Project Overview and Product Development Requirements

**Status:** Current requirements baseline  
**Updated:** 2026-09-05  
**Scope:** EVCrate package, generated target projections, shared advisor controller,
and atomic publication

EVCrate turns one canonical agent-harness source tree into verified target
projections and publishes those projections safely. This PDR records observable
requirements; implementation detail belongs in the [system architecture](./system-architecture.md)
and [code standards](./code-standards.md).

## Product intent

EVCrate gives maintainers one source of truth for Claude-oriented harness resources
while supporting Claude, Codex, Gemini, Antigravity, Pi, OMP, and Copilot projections.
It must make generated output reproducible, publication recoverable, and checkpoint
counsel bounded and fail-closed.

### Users and outcomes

| User | Outcome |
|---|---|
| Harness maintainer | Author once under `.evcrate/source/.claude/`, then rebuild verified projections. |
| Package consumer | Invoke the private npm CLI without a Python runtime on the default path. |
| Advisor operator | Configure one user-owned policy and receive one bounded controller envelope. |
| Release operator | Preview, publish, or recover target output without replacing unmanaged HOME data. |
| Pi/Copilot user | Receive a target-specific projection with explicit migration boundaries. |

## Scope and constraints

### In scope

- Strict bounded JSON/protocol contracts and sanitized errors.
- Schema-2 target manifests/build manifests and schema-1 resource registry.
- Seven fixed projection adapters with no discovery or fallback adapter.
- CAS-aware import, scope, advisor-settings, build, publication, and recovery flows.
- One shared advisor controller published to `$HOME/.evcrate/bin`.
- Explicit checkpoint counsel through a final `--advice` token.
- Documentation/target command naming as `/cmd-*`, OMP `__` flattening, and
  Copilot `evcrate-cmd-*` projection.

### Out of scope for this baseline

- Editing generated projections or renaming canonical source commands.
- A daemon, background advisor broker, retries, provider switching, model
  substitution, local fallback, or native callback relay.
- Copilot as a controller backend.
- Windows equivalence, live vendor qualification, npm publication, deployment, or
  operator rollout claims without separate evidence.

## Product requirements

### FR-1: Canonical authoring and projection

**Requirement:** Canonical harness resources are authored only under
`.evcrate/source/.claude/`; the shared controller is authored under
`.evcrate/source/.evcrate/bin/`. Target manifests and overlays select generated
outputs.

**Acceptance:** A build reads the canonical roots, registers all seven fixed target
adapters, rejects missing/duplicate/unsupported target adapters, and emits validated
projections. A generated output is never treated as an authoring source.

### FR-2: Deterministic target authorization

**Requirement:** Schema-2 manifests declare resource roots, output roots, HOME
bindings, promotion order, collision policy, and any declared patches. Paths must be
normalized, non-overlapping, non-symlinked, and contained.

**Acceptance:** Unknown fields, traversal, backslashes, duplicate roots, unsafe
ancestors, nested/equal output roots, invalid patches, or unsupported target IDs fail
before projection or publication.

### FR-3: Bounded resource registry and imports

**Requirement:** `.evcrate/registry.json` remains a distinct schema-1 canonical
resource registry. Scans are owner-controlled, deterministic, mode-aware, and
bounded. Explicit imports use immutable preview descriptors and single-use tokens.

**Acceptance:** Scans reject symlinks/special entries and stale content; preview
writes no canonical or generated content; apply rechecks source identity, hashes,
registry/manifest/adapter bindings, approvals, destination, provenance, and expiry.
Conflicts preserve unmanaged or differently-owned nodes.

### FR-4: One-shot TypeScript CLI

**Requirement:** The `evcrate` bin parses one invocation, resolves one immutable
context, dispatches one operation, writes one validated result, and exits. Supported
operations are version, health, resource, import, scope/change, advisor-settings, and
`distribute` build/check/publish/all/recover operations.

**Acceptance:** `--request-file` accepts one complete bounded versioned envelope and is
mutually exclusive with positional construction. Unknown input and child failures
produce stable sanitized errors; no daemon, listener, retry loop, or arbitrary
launcher is introduced. The package's default runtime requires Node `>=22.19.0`.

### FR-5: Advisor policy ownership

**Requirement:** The shared controller reads exactly one required policy at
`$HOME/.evcrate/advisor-routing.json`. The version-1 top level is exactly
`version`/`advisor`; advisor keys are exactly `backend`/`model`/`effort`/`timeout_ms`.
Timeout is inclusive `60000..900000`; policy bytes are bounded to 16 KiB and strict
UTF-8/JSON validated.

**Acceptance:** Missing policy returns <code>ROUTE_POLICY_REQUIRED</code>; a top-level `hosts`
shape returns <code>ROUTE_SCHEMA_MIGRATION_REQUIRED</code>; malformed, duplicate-key,
credential-bearing, unknown, unsafe, oversized, or unstable documents fail closed.
The policy is user-owned and is never generated or published by EVCrate.

### FR-6: Direct checkpoint protocol

**Requirement:** `evcrate-advisor` receives one direct checkpoint object containing
exactly ten keys: `protocol`, `version`, `checkpoint`, `question`, `kind`,
`task_or_phase`, `evidence`, `changed_paths`, `prior_counsel`, and
`owner_disposition`.

**Acceptance:** Valid checkpoints use `review:`, `stuck:`, or `decision:` identifiers;
all limits and safe-path rules are enforced; evidence paths are metadata only. A
partial/idle stdin stream reaches the finite pre-policy timeout and emits a failed
controller envelope rather than hanging.

### FR-7: One-shot counsel transaction

**Requirement:** The controller creates one correlation ID, loads policy once,
selects one adapter, creates one empty owner-only workspace, runs ordered probes and
one final model process under one deadline, emits one frozen envelope, and cleans up.

**Acceptance:** Preflight failure launches no final process. There is no retry,
backend switch, model/effort substitution, downgrade, local fallback, or native
callback. Descendants are terminated/reaped and the workspace is removed after the
terminal envelope is determined.

### FR-8: Stable advisor result

**Requirement:** Public output is exactly one JSON line. Success is
<code>ADVICE_READY</code>; failure is <code>FAILED</code>. Both carry protocol/version, correlation UUID,
and a receipt with backend/model/effort/controller and adapter versions plus elapsed
milliseconds.

**Acceptance:** Success adds a normalized `evcrate-advisor-result/v1` result. Failure
adds only sanitized `code`, `category`, `action`, and `message`. Stderr is empty and
exit status is zero only for success, one for every failed checkpoint.

### FR-9: Adapter qualification and isolation

**Requirement:** Candidate backends are exactly `claude`, `codex`, `antigravity`,
`pi`, and `omp`; enabled backends are `claude`, `codex`, `pi`, and `omp`.
Antigravity is an unavailable candidate; Gemini and Copilot are not controller
backends.

**Acceptance:** Each enabled adapter uses fixed executable/argv and credential-safe
version/auth/capability probes. Runner calls use `shell:false`, allowlisted
environment, bounded streams, stdin-only prompts, detached POSIX process groups,
deadlines, cancellation, and descendant reaping. Qualification is repeated after
vendor CLI upgrades and is currently a Linux-only operator gate.

### FR-10: Publication and recovery

**Requirement:** Build/check, publication, and recovery are separate operations.
Publication consumes a current verified schema-2 build, stages complete outputs on
the destination volume, preserves unmanaged HOME data, and uses journaled atomic
promotion with identity/hash checks.

**Acceptance:** Stale/missing/extra/mismatched source, adapter, controller, owner, or
output hashes block publication. A simulated interruption recovers the complete
prior managed set; unrelated policy and HOME roots remain untouched. Current package
scripts invoke the TypeScript path; no root `distribute.py` command is treated as
canonical.

### FR-11: Supervision semantics

**Requirement:** A standalone final `--advice` token is explicit checkpoint counsel
for bootstrap, code, cook, and fix workflows. `@advisor` remains ordinary task text.
Only an outer <code>ADVICE_READY</code> envelope completes the checkpoint.

**Acceptance:** The token is case-sensitive, standalone, whitespace-delimited, final
(trailing whitespace allowed), and duplicate tokens reject. Quoted, embedded,
suffixed, differently cased, and non-final forms remain ordinary text. Handoffs
preserve exactly one final token in explicit mode or no token in default mode.

### FR-12: Documented command names

**Requirement:** Documentation and target-facing examples use `/cmd-*` for every
slash command/resource name, including `.claude` references. OMP nested names use
`__`; Copilot names remain `/evcrate-cmd-*`.

**Acceptance:** Core docs contain no bare documented workflow invocation. Each OMP or
Copilot translation points to `evcrate/command-name-map.json`. The docs explicitly
state that current canonical scanning/parser enforcement is a follow-up and that
this requirement does not rename source files or alter command implementation.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Safety | Fail closed on invalid input, unsafe paths, ownership changes, stale identities, and uncertain recovery. |
| Bounded work | Bound documents, paths, files, process streams, deadlines, workspace, and transaction state. |
| Reproducibility | Canonical JSON, deterministic ordering, SHA-256, mode-aware hashes, and exact closure manifests. |
| Isolation | No credentials in policy/checkpoint/results; vendor CLIs own credentials; child processes receive fixed environments. |
| Compatibility | Preserve explicit target boundaries; never silently synthesize unsupported adapters or aliases. |
| Operability | Dry-run, apply, recovery, sanitized receipts/errors, and clear ownership of user-managed state. |
| Maintainability | One parser, path policy, hashing policy, lock protocol, and error serializer per boundary. |

## Observable release gates

1. Source and target manifests validate with schema-2 rules.
2. Local build/check completes with a current complete manifest and 17-file
   controller closure.
3. Publication dry-run reports only authorized target/HOME changes.
4. Apply and recovery preserve unmanaged files and reject CAS changes.
5. Advisor policy, checkpoint, envelope, timeout, cancellation, and cleanup
   contracts are exercised with bounded non-sensitive fixtures.
6. Linux live qualification is run separately for each enabled installed CLI.
7. Windows, npm publication, rollout, and live release remain explicitly gated.

## Documentation map

- [System architecture](./system-architecture.md) — detailed controller,
  distribution, supervision, wire, isolation, and publication contracts.
- [Code standards](./code-standards.md) — normative implementation and naming rules.
- [Codebase summary](./codebase-summary.md) — source/module/generated-output map.
- [Project roadmap](./project-roadmap.md) — completed gates, current gaps, and next work.
- [Project changelog](./project-changelog.md) — historical phase evidence and boundaries.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
