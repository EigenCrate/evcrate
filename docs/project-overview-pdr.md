# Project Overview and Product Development Requirements

**Status:** Current requirements baseline; Hook Materialization Scope Distribution is
complete through Phase 09, Windows release qualification through Phase 10, and
DamHopper Advisor Plugin Phases E00–E03 implementation is complete
(2026-09-21; E03 review approved 9.2/10). Joint G1/G2 and downstream plugin
gates remain contract-dependent.
**Updated:** 2026-09-21
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
- Scope-aware publication (`--scope home|project`) with unconditional shared controller
  publication to `<home>/.evcrate/bin` and independent project harness materialization.
- Two-phase project publication transactions with project-only rollback, non-compensation
  of shared commit, and schema-2 scope-isolated recovery.
- One shared advisor controller published to `$HOME/.evcrate/bin`.
- Explicit checkpoint counsel through a final `--advice` token.
- Documentation/target command naming as `/cmd-*`, OMP `__` flattening, and
  Copilot `evcrate-cmd-*` projection.

### Out of scope for this baseline

- Editing generated projections or renaming canonical source commands.
- A daemon, background advisor broker, or generic/unbounded CLI retry loop.
- Provider switching, model substitution, local fallback, or native callback relay
  outside the managed v2 controller flow.
- Copilot as a controller backend.
- Full Windows runtime equivalence (such as `publish`, `health`, advisor execution,
  or process-tree parity), desktop/non-admin/UAC/SmartScreen/enterprise environments,
  Authenticode signing, live vendor qualification, npm publication, deployment, or
  operator rollout claims. (The bounded Windows installer lifecycle and `version --json`
  qualification is in scope under FR-17).
  
The managed Phase-05 exception is in scope under FR-7: up to four sequential
primary attempts with cancellable 10/20/30-second backoff and one configured
backup invocation. It is bounded and controller-owned; generic CLI retries remain
out of scope.

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
Host context roots are validated as native absolute paths by the context boundary;
portable manifest/archive/inventory identities remain normalized relative POSIX
paths and are not widened for Windows.

**Acceptance:** Unknown fields, traversal, backslashes, duplicate roots, unsafe
ancestors, nested/equal output roots, invalid patches, or unsupported target IDs fail
before projection or publication. Native path and shared ancestor checks fail before
filesystem use; broader Windows runtime equivalence outside the installer/version subset remains out of scope.

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

**Acceptance:** `--request-file` accepts one complete bounded versioned envelope and
is mutually exclusive with positional construction. Unknown input and child failures
produce stable sanitized errors; no daemon, listener, generic/unbounded retry loop,
or arbitrary launcher is introduced. The managed v2 advisor retry schedule is the
explicit FR-7 exception and does not apply to other CLI operations. The package's
default runtime requires Node `>=22.19.0`.

### FR-5: Advisor policy ownership and safe migration

**Requirement:** The shared controller reads exactly one required policy at
`$HOME/.evcrate/advisor-routing.json`. Policy v2 has exact top-level keys
`version`/`advisor`/`wait`/`history`; routes are explicit
`primary`/`backup` `{backend, model, effort}` triples, wait mode is
`until_terminal`, and history has bounded retention/quota. Policy remains
user-owned. Settings request/result, journal, and preview transport remain
version 1 while carrying the v2 policy payload.
The [README advisor checkpoint](../README.md#advisor-checkpoint) contains the v2
template and the operator migration sequence.

**Acceptance:** Policy bytes are bounded to 16 KiB and strict UTF-8/JSON
validated. Missing, malformed, duplicate-key, credential-bearing, unknown,
unsafe, oversized, identical-route, and unavailable-route inputs fail closed.
Legacy host-v1 and single-target-v1 policy is readable only as a migration view;
runtime execution rejects it. Migration is explicit `get -> prepare v2 ->
preview -> apply`, preserves revision/CAS and byte-safe recovery, and never
rewrites HOME automatically.

### FR-6: Versioned checkpoint protocol
**Requirement:** Phase 01 freezes direct `evcrate-advisor-checkpoint` v2 with
task/run/checkpoint/phase identity, task/evidence revisions, decision kind,
task constraints, proposal, bounded evidence, and prior disposition. The
TypeScript implementation is prepared as an environment-neutral portable
runtime in `src/protocol/advisor-contract-runtime.ts`; the exact four-file
TypeScript protocol closure boundary also includes
`src/protocol/advisor-contracts.ts`, `src/protocol/advisor-settings.ts`, and
`src/protocol/index.ts`. The compatibility v1 ten-key checkpoint
remains an explicit compatibility path while dependent runtime phases cut over;
no implicit v1-to-v2 upgrade is performed.

**Acceptance:** V2 rejects unknown keys, unsafe paths, credentials, duplicate
paths, invalid revisions, overlong text, oversized evidence, and missing
structured fields. Evidence paths are metadata only; selected content uses
digests. The request stays within 32 KiB, with bounded question/task/evidence,
four files, and sixteen changed paths. Portable validators expose stable
neutral code/path failures and deep-freeze accepted values; protocol barrels
export the runtime; Phase 03 registers generated adapters in the exact current
33-file controller closure while preserving dated 29-file release evidence.
No automatic route/executable override is accepted.

### FR-7: Versioned counsel transaction

**Requirement:** The v2 contract reserves one correlation ID, immutable
checkpoint identity, ordered attempt summaries, cleanup outcome, and sanitized
terminal error/result. It freezes primary retry slots `[10000, 20000, 30000]`,
one backup slot, and correction/state/history identities for dependent phases.

**Acceptance:** Phase 05 executes up to four sequential primary launches and one
configured backup with cancellable bounded backoff. Phase 06 durable state gates
reserve, claim, attach, disposition, outcome, human continuation, and complete
operations. Phase 07 records optional sanitized execution/outcome history; its
write failure exposes audit degradation without relaunching inference or
resetting required state. All phases preserve cancellation dominance, confirmed
cleanup before success/retry, and no auto-resume after parent loss.

### FR-8: Stable advisor result and envelope

**Requirement:** V2 public success/failure remains one terminal JSON line:
<code>ADVICE_READY</code> or <code>FAILED</code>. The canonical mentor brief is
generated into the standalone controller closure; v2 prompt packaging quotes
validated checkpoint data. For v2 checkpoints, each enabled adapter passes
extracted assistant text to one strict parser. The result requires exactly
seven body fields: `recommendation`, `rationale`, `must_fix`, `cautions`,
`assumptions`, `success_checks`, and `unresolved_questions`. The controller
envelope binds task/checkpoint/evidence identity, receipt/build identity,
bounded attempts, sanitized error, and `audit_status`.

**Acceptance:** Result body is bounded to 16 KiB; envelope to 32 KiB; at most
five model-started attempts and eight summaries. Missing/unknown fields,
fences, prose, control characters, sensitive material, and raw stack traces
fail closed. Success requires confirmed cleanup. Failure exposes only cataloged
`code`, `category`, `action`, and `message`. Existing v1 output remains an
explicit compatibility path.

### FR-9: Adapter qualification and isolation

**Requirement:** Candidate backends are exactly `claude`, `codex`, `antigravity`,
`pi`, and `omp`; enabled backends are `claude`, `codex`, `pi`, and `omp`.
Antigravity is an unavailable candidate; Gemini and Copilot are not controller
backends.

**Acceptance:** Each enabled adapter uses fixed executable/argv and credential-safe
version/auth/capability probes. Runner calls use `shell:false`, allowlisted
environment, bounded streams, stdin-only prompts, detached POSIX process groups,
deadlines, cancellation, and descendant reaping. This remains live vendor/runtime
qualification and is repeated after vendor CLI upgrades on Linux only. The separate
Windows qualification covers standalone installer lifecycle and `version --json`
under FR-17; it does not qualify adapter execution.

### FR-10: Publication and recovery

**Requirement:** Build/check, publication, and recovery are separate operations.
Publication consumes a current verified schema-2 build snapshot, stages complete
outputs on the destination volume, preserves unmanaged files, and supports scalar
`--scope home|project` (defaulting to `home`).
- Shared controller (`.evcrate/bin`) is unconditionally published under `--home`
  and is never filtered by `--target` or published to project.
- Harness projections are published to `<home>` or `<project-root>`.
- HOME publication executes as a single atomic transaction.
- Project publication executes as a two-phase transaction: shared HOME commit, followed
  by project harness commit under the project workspace lock (no reverse locking).
- Harness failure after shared commit rolls back only project work, producing a
  `partial` result (exit 5) with `PUBLICATION_FAILED` or `ROLLBACK_FAILED`. Shared
  commit is never compensated.
- Schema-2 recovery is scope-isolated: HOME recovery reads only HOME state; project
  recovery validates canonical `projectIdentity` and inspects only project state.

**Acceptance:** Stale/missing/extra/mismatched source, adapter, controller, owner, or
output hashes block publication. Overlap preflight rejects equal, nested, or colliding
roots before destination reads. A simulated interruption recovers the complete
prior managed set; unrelated policy, HOME roots, and unmanaged project files remain
untouched. Current package scripts invoke the TypeScript path; no root `distribute.py`
command is treated as canonical.
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

**Acceptance:** Core docs contain no bare documented workflow invocation. Each
OMP or Copilot translation points to `evcrate/command-name-map.json`. The docs
explicitly state that current canonical scanning/parser enforcement is a
follow-up and that this requirement does not rename source files or alter
command implementation.

### FR-13: Sanitized audit history and outcome review

**Requirement:** Store a bounded, versioned execution record and linked outcome
record for each v2 consultation under the owner-only
`$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
hierarchy. Preserve started/attempt/terminal facts, route/build/prompt
identity, disposition, actual changed paths, validation, outcome, and
correction number without raw reasoning or credentials.

**Acceptance:** `execution.json` and `outcome.json` validate within 128 KiB and
64 KiB limits. Started records precede model launch; terminal settlement uses
CAS identity/byte checks and cannot rewrite a settled record. Outcome writes
require linked task/consultation identity and are idempotent for equivalent
replays. Managed `evcrate-advisor history list|show|export|prune` operations
remain project-scoped and bounded: list is metadata-only, show/export sanitize
untrusted text, export requires a safe non-existing destination, and prune
supports preview/apply retention/quota cleanup while protecting active records.
The read-only `history metrics` operation is also current-project scoped: it
accepts the exact ten-key filter shape, excludes invalid execution records,
preserves missing/invalid/unknown outcome states, reports scan diagnostics,
counts, missingness, completeness, and limitation codes, and uses `null` for
zero-denominator values. It does not claim complete audit coverage, task
success, cost, saved time, or causal effectiveness. History failure reports
`audit_status: "degraded"` without failing inference or required state.

### FR-14: Deterministic Windows predecessor boundary

**Requirement:** Build a reproducible Windows fixture from the shared archive and
installer authorities, then resolve the predecessor for a release candidate using
bounded, read-only stable-release metadata and exact-four verification. The
qualification state is irreversible: use the verified `bootstrap-fixture`
(`1.0.0`/`v1.0.0`/`a`×40) only before any qualified release; afterward require the
latest stable release and never fall back to an older release or bootstrap.

**Acceptance:** Independent fixture builds have identical names, sizes, SHA-256
digests, and bytes. Exact labels are unique and paired with canonical ZIP,
sidecar, metadata, and `install.ps1` assets. Missing/tampered/duplicate assets,
unqualified latest releases, candidate versions not greater than the predecessor,
or required API/token/download failures fail closed with no partial output.
The normalized predecessor handoff is ready for receipt staging. Predecessor
qualification is verified as part of the bounded Windows release qualification (FR-17).


### FR-15: Canonical semantic-release candidate and verify-only publisher

**Requirement:** Produce one release candidate through the canonical semantic-release
v22 API in a disposable local bare mirror, then publish only the verified candidate
bytes. Candidate execution uses the canonical plugin order with the GitHub plugin
removed, `EVCRATE_RELEASE_ASSET_MODE=build`, and no release credentials. The
publisher uses the canonical configuration with `EVCRATE_RELEASE_ASSET_MODE=verify`.

**Acceptance:** A clean checkout captures one branch and exact lowercase 40-hex
source commit. A releasable run verifies exact seven candidate assets and exact four
predecessor assets, stages those bytes plus the qualification harness, and writes one
canonical `evcrate-release-candidate/v1` `candidate.json` receipt. Receipt file
records are sorted and hash the staged bytes. A no-release result returns success
with `has_release=false` and no handoff.

The candidate emits exactly nine safe scalar outputs:
`has_release`, `version`, `tag`, `source_commit`, `artifact_name`,
`windows_archive_sha256`, `windows_sidecar_sha256`, `metadata_sha256`, and
`install_ps1_sha256`. The publisher requires the receipt, run/release identity, and
producer hashes; it copies only verified `assets/` into `dist/release`, cannot build
or repair, and fails closed on tampering, `semantic-release=false`, or any
version/tag/source mismatch.
The final semantic-release result must match the receipt exactly. Candidate and
publisher verification feed the release matrix without authorizing live npm/GitHub publication.

### FR-16: Release workflow trust separation

**Requirement:** The release workflow separates candidate production, native Windows
qualification, and publication into jobs with least-privilege permissions. One
immutable artifact ID and receipt bind the producer's bytes to every matrix row and
to the verify-only publisher.

**Acceptance:** `main` push/manual runs use non-canceling concurrency and read-only
defaults. The Ubuntu/Node 24.21.0 producer retains its Linux gates and uploads only
on `has_release=true`; four `windows-2025` x64 PowerShell 5.1/7 × Node
22.19.0/24.21.0 rows consume the exact artifact ID without checkout/npm.
The sole publisher starts only after all four matrix rows succeed, checks out the
producer SHA, copies exactly seven assets, re-verifies receipt/hash/run identity,
and invokes semantic-release in `verify` mode. Phase 09 integrated qualification
verified this trust separation and final published-byte equality.


### FR-17: Bounded Windows release qualification

**Requirement:** Qualify one immutable release candidate across the supported
hosted Windows matrix for standalone installer lifecycle operations and clean-install
verification before publication. Broad CLI Windows equivalence remains out of scope.

**Status:** Complete through Phase 10 (10/10 phases, 100%; completed 2026-09-15).

**Acceptance:** Hosted `windows-2025` x64 execution succeeds across all four release
matrix rows (Windows PowerShell 5.1 and PowerShell 7 × Node 22.19.0 and Node 24.21.0)
over the exact candidate artifact ID. Standalone lifecycle operations (`install`,
repeat-install, `repair`, upgrade, `rollback`, `uninstall`) and `version --json` execute
without error; state and bin directories remain contained under `%LOCALAPPDATA%\EVCrate`;
and diagnostic PR smoke (`windows-smoke.yml` on PowerShell 7 + Node 22.19.0) passes
without publication authority. Runtime commands (`publish`, `health`, advisor execution,
process-tree parity), desktop/UAC/SmartScreen/Authenticode/enterprise-policy environments,
and execution-policy workarounds remain explicitly excluded. Live vendor/runtime
execution remains Linux-only.

### FR-18: Advisor Metrics Explorer and Browser History Scanner

**Requirement:** Provide a private, client-side, read-only React explorer for inspecting retained advisor consultations, aggregated execution metrics, routing configuration, and external counsel evaluations.

**Status:** Complete through Phase 10 (10/10 phases, 100%; completed 2026-09-19).

**Acceptance:** Operates purely in Chromium on Linux via File System Access API with explicit user-granted directory/file handles; loopback preview (`127.0.0.1:4173`) enforces strict CSP (`connect-src 'none'; object-src 'none'; frame-ancestors 'none'`) with zero outbound network calls after load; all user data renders as inert text; root package has zero production dependencies; bundle size is ~298.5 kB (strictly <= 5 MiB ceiling); granted handles clear upon page reload; frozen 10,000-consultation benchmark passes all thresholds (p95 scan <= 5,000 ms, p95 detail <= 100 ms, cancel <= 250 ms, 0 long tasks >200 ms); makes no POSIX filesystem attestation, complete audit, causal, cost, or saved-time claims; controller closure remains exactly 33 files; release directory remains exactly seven assets.
### FR-19: DamHopper Advisor Plugin domain data contract (Phase E00)

**Requirement:** Publish `evcrate-advisor-data` v1 as one generated schema,
TypeScript declaration/validator module, manifest, and frozen parity fixture set.
Register exactly `history.refresh`, `history.summary`, `history.page`,
`history.detail`, `policy.readCurrent`, `evaluations.list`, `evaluations.read`,
and `evaluations.compare`. Domain parameters carry no actor, installation, grant,
HOME, target-path, or binding override; generic host context supplies authority.

**Acceptance:** `src/protocol/advisor-plugin-data-api.ts` and
`src/protocol/index.ts` expose strict, immutable validators with bounded opaque
IDs/cursors, positive timestamps, UUID/SHA-256 identity checks, exact query/sort
shapes, discriminated changed/missing states, and no unknown fields.
`scripts/generate-advisor-plugin-data-schema.mjs --check` verifies byte-stable
`plugin/contracts/evcrate-advisor-data-v1.schema.json` and `contract-manifest.json`.
Fixtures cover eight positive/negative wire operations, normalized project/worktree
identity, insertion-order checkpoint digest/tamper parity, and metric/evaluation
semantic parity; Phase E00 validation passes 28/28 focused assertions.

**Read boundary:** `read-closure-feasibility.json` records a feasible G0 graph
limited to `node:fs`, `node:path`, and `node:crypto`, excludes mutation/model/
process/network modules, and expects zero controller-inventory delta. E01 must
reconfirm the graph before extraction; E00 does not claim provider/worker delivery,
joint G0 approval, or standalone cutover.

### FR-20: Framed Node plugin worker and early G1 candidate (Phase E02)

**Requirement:** Ship an independently versioned, backend-only EVCrate worker
that wraps E01 in the pinned D00 Worker SDK. The worker must use four-byte
big-endian length-prefixed strict UTF-8 JSON-RPC 2.0 frames, exact capability
dispatch, revision-aware ephemeral contexts, bounded admission, cooperative
cancellation/deadlines, exactly-once settlement, safe D00 errors, and sanitized
stderr observability. It must not open a listener, run a shell, spawn a model,
mutate source/policy/history, or own durable grants.

**Acceptance:** Node `>=22.19.0` and SDK/manifest/data versions negotiate before
context service. Fragmented/coalesced frames work; oversized, invalid UTF-8,
batch, numeric-ID, malformed, unknown, and EOF-mid-frame inputs fail closed.
Limits remain 16 contexts/worker, 4 operations/context, 16 active requests,
queue 32, one refresh, one evaluation parse, 16 MiB frames, and 64 KiB control
payloads. `request.cancel` returns `accepted`, `alreadySettled`, or `unknown`;
the original request settles once. Context close/revision mismatch/reconnect/
shutdown revokes state and cancels work. stdout contains frames only; stderr is
bounded and redacted.

The candidate builder emits a deterministic backend-only `.tar.gz`, validates
manifest inventory and SHA-256 closure, and keeps UI/navigation absent. E02
implementation evidence is repository/fixture evidence, not G1 integration,
E04 publication, root release assets, or standalone cutover.

### FR-21: Embedded provider-neutral four-view UI (Phase E03)

**Requirement:** Provide one React `App`/reducer and four shared views behind the
E00 `AdvisorDataProvider`, with a temporary File System Access adapter for the
standalone viewer and a bounded DamHopper `MessagePort` adapter for the embedded
plugin. Keep transport, actor authority, paths, credentials, and host internals
outside shared view state.

**Status:** DONE (completed 2026-09-21; review approved 9.2/10). Joint D04/E03
G2 LAN acceptance, E04 package/lifecycle work, and G4 standalone retirement remain
downstream.

**Acceptance:** The provider exposes exactly the eight E00 reads plus cancellation
and lifecycle events; the UI bridge pins version `1.0.0`, validates the eight
envelope types, acknowledges one single-use nonce, binds frame session and
activation generation, rejects late/mismatched responses, and clears pending work
on revocation. Reducer state fences refresh/summary/page results by generation and
session; context changes clear snapshot, cursor, detail, policy, evaluation, and
selection state. Filters request a canonical summary and first page rather than
downloading all history.

Overview, History/detail, Configuration, and Evaluations remain one shared surface.
The UI exposes honest stale/unavailable/forbidden/migration/changed/missing states,
current account-wide policy labeling, exact evaluation comparability, inert text,
semantic keyboard-accessible controls, and no model execution or mutation.

`plugin/ui/index.html` is one opaque-srcdoc-compatible document under 5 MiB with
inlined CSS/IIFE JavaScript, no external assets, network clients, or filesystem
pickers. `plugin/manifest.json` declares `ui/index.html` and
`/plugins/evcrate.advisor`; the candidate builder includes the document and its
SHA-256 inventory entry. E03 validation records **68/68 tests passed**; this is
repository/package evidence, not host CSP/sandbox or real LAN qualification.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Operability | Dry-run/apply, recovery, sanitized receipts/errors, history list/show/export/prune review tools, read-only history metrics, and clear ownership of user-managed state. |
| Bounded work | Bound documents, paths, files, process streams, deadlines, workspace, and transaction state. |
| Reproducibility | Canonical JSON, deterministic ordering, SHA-256, mode-aware hashes, and exact closure manifests. |
| Isolation | No credentials in policy/checkpoint/results; vendor CLIs own credentials; child processes receive fixed environments. |
| Compatibility | Preserve explicit target boundaries; never silently synthesize unsupported adapters or aliases. |
| Operability | Dry-run/apply, recovery, sanitized receipts/errors, history list/show/export/prune review tools, and clear ownership of user-managed state. |
| Maintainability | One parser, path policy, hashing policy, lock protocol, and error serializer per boundary. |

## Observable release gates

**Current status:** Windows release qualification (Phases 01–10), Advisor Metrics
Explorer (Phases 01–10), and DamHopper Advisor Plugin Phases E00–E03
implementation are complete. Documentation/support cutover is complete.
Deterministic Linux publication evidence, joint G0/G1 and D04/E03 G2
qualification, plugin package/cutover gates, and E04–E05 remain separate.

1. Source and target manifests validate with schema-2 rules.
2. Local build/check completes with a current complete manifest and exact 33-file
   controller closure; prior dated 29/29 evidence remains historical.
3. Publication dry-run reports only authorized target, HOME, and project changes.
4. Apply and recovery preserve unmanaged files, enforce scope isolation, and reject
   CAS changes.
5. Advisor policy, checkpoint, envelope, history, timeout, cancellation, and cleanup
   contracts are exercised with bounded non-sensitive fixtures.
6. Linux live qualification is run separately for each enabled installed CLI.
7. Phase 06 candidate orchestration passes its release/receipt/publisher contract
   checks (`release-orchestration.test.mjs` and `npm run test:release`); this is
   deterministic repository evidence, not a live publication.
8. Phase 09 Windows qualification passes all four hosted `windows-2025` rows and
   final seven-asset byte comparison.
9. Phase 10 documentation/support cutover records the exact installer and
   `version --json` Windows boundary; npm/GitHub publication, operator rollout,
   desktop/signing environments, and live runtime/vendor execution remain gated.
10. Advisor Metrics Explorer passes all 14 Playwright built-preview end-to-end scenarios, 6 package inventory checks, 10k frozen benchmark (p95 scan 1,643 ms, detail 67 ms, cancel 104 ms), exact 33-file controller closure, and exact seven release assets.
11. Phase E00 schema/manifest generation check and domain parity suites pass:
    `npm run check:advisor-plugin-schema` and `npm run test:advisor-plugin` pass;
    identity/digest/metric/evaluation parity remains aligned with existing
    protocol fixtures, while the read-closure feasibility artifact remains the
    E01 extraction prerequisite.
12. E02 worker framing, lifecycle, cancellation, safe-error, and candidate
checks pass; this is internal repository evidence, not owner-runner G1,
E04 publication, or standalone cutover. See the [worker guide](./advisor-plugin-worker.md).
13. E03 bridge/state/four-view/security suites and the self-contained UI package
check pass; this is repository evidence, not host-enforced CSP/sandbox or G2 LAN
qualification. See the [embedded UI guide](./advisor-plugin-ui.md).
## Documentation map

- [System architecture](./system-architecture.md) — detailed controller,
  distribution, supervision, wire, isolation, and publication contracts.
- [Code standards](./code-standards.md) — normative implementation and naming rules.
- [Codebase summary](./codebase-summary.md) — source/module/generated-output map.
- [Advisor plugin worker](./advisor-plugin-worker.md) — E02 framing, lifecycle,
  safe errors, admission, and candidate package boundary.
- [Embedded advisor plugin UI](./advisor-plugin-ui.md) — E03 provider boundary,
  bridge, reducer/views, opaque-origin package, and acceptance boundary.
- [Project roadmap](./project-roadmap.md) — completed gates, current gaps, and next work.
- [Project changelog](./project-changelog.md) — historical phase evidence and boundaries.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
- [Browser history scanner](./browser-history-scanner.md) — browser history traversal, metrics kernel, and viewer architecture.
