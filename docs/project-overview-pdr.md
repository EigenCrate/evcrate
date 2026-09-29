# Project Overview and Product Development Requirements

**Status:** Current requirements baseline. Filesystem cutover Phases 01–02 are complete (2026-09-27). Hook Materialization Scope Distribution is
complete through Phase 09, Windows release qualification through Phase 10, and
All-project advisor history through Phase 05 (6/6 phases, 100%; 2026-09-24).
Native Windows advisor Phase 01 proved primitives (67/67 checks); readiness Repairs 01–04 are complete, but original Phase 03 host-invocation/packaging is in progress at 67% (4/6 checklist entries) and not DONE; Windows advisor runtime qualification remains open.
Its paired release is qualified; see the [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md).
DamHopper Advisor Plugin Replacement is a separate milestone: Phases E00–E04
are complete (E04/G3 qualified on 2026-09-22); E05 source cutover is applied,
but joint G4 qualification/sign-off is unverified and standalone retirement is
not release-authorized. Workspace Advisor Phases 00–04 are complete (Phase 04 review approved 9.5/10); Phases 05–09 and end-to-end rollout remain pending.
**Updated:** 2026-09-29
**Scope:** EVCrate package and generated projections, shared advisor controller, atomic publication, and documented paired DamHopper Advisor contracts

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
- Full Windows runtime equivalence (including `publish`, `health`, controller-backed
  inference, and process-tree parity) remains outside this baseline and unqualified.
  The native advisor caller/package path is implemented evidence only, not support
  qualification. Desktop/non-admin/UAC/SmartScreen/enterprise environments,
  Authenticode signing, live vendor qualification, npm publication, deployment, or
  operator rollout claims remain outside this baseline. (The bounded Windows
  installer lifecycle and `version --json` qualification is in scope under FR-17.)
  
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
resource registry. Scans validate canonical and resource-root containment and are
deterministic and bounded. Resource file identities bind content and physical kind,
not permission bits; direct-file imports use the same domain-separated hash as
registry scanning/verification, while generic `hashFile` remains a raw byte digest
and directory-tree identities remain unchanged. Explicit imports use immutable
preview descriptors and single-use tokens.

**Acceptance:** Scans reject symlinks/special entries and stale content or kind;
permission-only changes do not change resource identity. Preview writes no canonical
or generated content; apply rechecks source identity, hashes, registry/manifest/
adapter bindings, approvals, destination, provenance, and expiry. The committed
schema-1 registry is regenerated through `npm run generate:registry`; prior raw-file
hashes are not silently accepted. Capability signals remain separate from content
identity; executable capability derives from file extensions and shebang bytes, not source permission bits. Filesystem-policy Phase 02 completed journal migration and host-specific qualification.
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
deadlines, cancellation, and descendant reaping.
This remains live vendor/runtime qualification and is repeated after vendor CLI
upgrades on Linux only. The separate Windows qualification covers standalone
installer lifecycle and `version --json` under FR-17; the implemented Windows
advisor caller does not qualify adapter execution or an `ADVICE_READY` result.
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
record for each v2 consultation under the cross-platform trusted-files policy in the
`$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
hierarchy (historical owner-only/0700/0600 mode requirements are superseded).
Preserve started/attempt/terminal facts, route/build/prompt
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

### FR-18: Advisor Metrics Explorer (historical browser scanner)

**Requirement:** Provide a private, client-side, read-only React explorer for
inspecting retained advisor consultations, aggregated execution metrics, routing
configuration, and external counsel evaluations.

**Historical status:** Complete through Phase 10 (10/10 phases; completed
2026-09-19). This records the standalone explorer milestone, not current standalone
support; the repository has since removed its picker/reader source.

**Historical acceptance:** At the 2026-09-19 milestone, the explorer operated in
Chromium on Linux via File System Access API and explicit user-granted handles;
loopback preview (`127.0.0.1:4173`) enforced strict CSP
(`connect-src 'none'; object-src 'none'; frame-ancestors 'none'`) with no outbound
network after load; data rendered as inert text; the root package had zero
production dependencies; the recorded bundle was ~298.5 kB (under 5 MiB);
granted handles cleared on reload; and the frozen 10,000-consultation benchmark
met its scan/detail/cancel/long-task thresholds. The milestone made no POSIX
filesystem attestation, complete-audit, causal, cost, or saved-time claims. These
dated results do not establish current standalone operation or G4.
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
semantic parity; the 2026-09-21 Phase E00 validation recorded 28/28 focused
assertions.

**Read boundary:** `read-closure-feasibility.json` records a feasible G0 graph
limited to `node:fs`, `node:path`, and `node:crypto`, excluding mutation/model/
process/network modules and expecting zero controller-inventory delta. E01 later
reconfirmed the graph without adding shared controller modules. E00 did not claim
provider/worker delivery, joint G0 approval, or standalone cutover.

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

The E02 candidate builder emitted a deterministic backend-only `.tar.gz` and
validated its manifest inventory/SHA-256 closure without UI/navigation. This is
repository/fixture evidence, not G1 integration or E04/G4 qualification. The later
E05 source cutover does not provide missing G4 evidence or authorize standalone
retirement.

### FR-21: Embedded provider-neutral four-view UI (Phase E03)

**Historical E03 requirement:** Provide one React `App`/reducer and four shared
views behind the E00 `AdvisorDataProvider`, with a temporary File System Access
adapter for the standalone viewer and a bounded DamHopper `MessagePort` adapter
for the embedded plugin. Keep transport, actor authority, paths, credentials, and
host internals outside shared view state.

**E03 status:** DONE (completed 2026-09-21; review approved 9.2/10). Joint
D04/E03 G2 LAN acceptance and E04 package/lifecycle work were downstream at that
time; E04/G3 was qualified on 2026-09-22. The repository later removed standalone
picker code in the E05 source cutover. Joint G4 qualification/sign-off remains
unverified, so E05/G4 is not accepted or complete and standalone retirement is
not release-authorized.

**Historical E03 acceptance:** The provider exposed the eight E00 reads plus
cancellation and lifecycle events; the UI bridge pinned version `1.0.0`, validated
the eight envelope types, acknowledged one single-use nonce, bound frame session
and activation generation, rejected late/mismatched responses, and cleared pending
work on revocation. Reducer state fenced refresh/summary/page results by generation
and session; context changes cleared snapshot, cursor, detail, policy, evaluation,
and selection state. Filters requested a canonical summary and first page rather
than downloading all history.

Overview, History/detail, Configuration, and Evaluations were one shared surface.
The UI exposed stale/unavailable/forbidden/migration/changed/missing states,
current account-wide policy labeling, exact evaluation comparability, inert text,
semantic keyboard-accessible controls, and no model execution or mutation.

At E03 package validation, `plugin/ui/index.html` was an opaque-srcdoc-compatible
document under 5 MiB with inlined CSS/IIFE JavaScript, no external assets, network
clients, or filesystem pickers. `plugin/manifest.json` declared `ui/index.html`
and `/plugins/evcrate.advisor`; the E03 candidate builder recorded its inventory
entry. E03 validation on 2026-09-21 recorded **68/68 tests passed**. This is dated
repository/package evidence, not host CSP/sandbox, G2 LAN, or G4 qualification.

### FR-22: Cross-project advisor history contract (Phases 00–05)

**Requirement:** Permit every authenticated DamHopper account to read retained
EVCrate advisor histories across projects only through a trusted, owner-root-bound
plugin scope; no per-account grant or historical project registration is required.
Preserve the existing single-project context; configured-target wildcards and
client-supplied paths never authorize root history. Keep Configuration and
Evaluations separately authorized and visibly sourced.


**Acceptance:** Freeze `evcrate-advisor-data` v2 while retaining unchanged v1
wire support, eight method names, and on-disk history v1. V2 summary/page queries
include `project_id: string | null`: null means All Projects only in root context,
while project context remains single-project bound. The bounded per-project
inventory is derived from the same snapshot and is independent of active filters.
A versioned sidecar stores strictly owner-safe display names keyed by project ID;
labels never confer authority and missing labels use an abbreviated ID fallback.
The host runner contract defines `ContextScopeKind` (`project` |
`history-root`) and `ContextScopeDescriptor` with optional root identity and
source revision. Phases 02–05 completed install-bound admission, owner-safe scanning and display names, snapshot-backed UI filtering, and paired release qualification.
The Phase 05 evidence records **273/273 tests passed** (0 failed/skipped), candidate and distribution package checks, and a direct history-root provider read of 237 accepted consultations across 21 projects in 191.48 ms with no diagnostics.
The scan was not a new live DamHopper browser session; production deployment remains separate. See the [contract guide](./all-project-advisor-history.md), [Phase 05 plan](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md), [test report](../plans/reports/tester-260924-2115-phase-05-paired-qualification.md), and [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md).

### FR-23: Native Windows advisor lifecycle implementation (Phase 02)

**Requirement:** Integrate Windows-specific home/project identity, environment, provider launch, state/history/baseline, process, workspace, and console boundaries into the shared advisor controller without changing public schemas or Linux behavior.

**Status and evidence:** Original Phase 02 integration is DONE (2026-09-26; review 7.4/10); the dated review records 213/213 advisor-controller, 16/16 viewer/manifest/package-inventory, and 21/21 settings/filesystem distribution-primitives tests, with a 36-file closure. Readiness Repairs 01–04 are complete; Repair Phase 04 verification recorded 20/20 focused tests, 390/390 final required-suite runs, and a 9.0/10 review with no critical findings. Original Phase 03 host-aware invocation and package closure are implemented and smoke-tested; see the [original Phase 03 plan](../plans/260926-1522-windows-advisor-support/phase-03-invocation-publication.md).

**Acceptance boundary:** Original Phase 03 implementation is in progress at 67% (4/6 checklist entries), but remains unaccepted and not DONE. Isolated `npm pack`/install and HOME-publication hash checks plus PowerShell 5.1 Unicode `STATE_READY` prove packaging/state transport only; the separate standalone install/publication flow remains unverified. WSL Ubuntu 22.04 ext4 state init/get is not full Linux qualification. `ADVICE_READY`, live provider/Pi/OMP execution, genuine positive attached-console observation, and production HOME publication remain unproven. State/history owner checks were superseded by the cross-platform trusted-files policy.

### FR-24: Launchability and filesystem identity (Phase 01)

**Status:** DONE (2026-09-27). See the [phase plan](../plans/260927-0428-filesystem-cutover-review/phase-01-launchability-and-identity.md) and [review](../plans/reports/code-review-260927-1740-phase-01-launchability-and-identity.md).

**Requirement:** Keep launch permission, capability assessment, content identity, and
CAS evidence distinct. Publication derives launcher intent from materialized paths,
published bytes, and explicit launcher roles; it does not use source permission bits
as publication-plan identity. Resource file roots use a file-kind-separated hash
shared by canonical registry scanning/verification and direct-file imports. Advisor
state/history and baseline comparisons tolerate permission-only metadata changes
without dropping byte, physical-object, index, or lock-ownership checks.

**Acceptance:**
- A fresh HOME/project publication can materialize shebang-bearing and explicitly
  recognized launcher files as directly runnable POSIX outputs; content-equal
  publication remains a no-op. Permission-only plan changes do not create operations.
- The Linux installer provisions required CLI/advisor launcher roles independently
  of tar execute bits, verifies the staged CLI shebang, and invokes the staged path
  directly. Required execute-bit provisioning failure aborts; local-build staging
  reports its existing sanitized `PUBLICATION_FAILED` error.
- Advisor state/history CAS ignores ctime and chmod-only drift only while file type,
  object identity, link count, and bytes remain stable. Lock cleanup remains bound
  to lock object and token/process identity.
- Baseline evidence normalizes executable-only Git mode changes while retaining
  selected bytes, index blob/stage data, conflicts, and rename endpoints. Content,
  identity, kind, conflict, or rename changes remain stale.
- Direct resource-file identity cannot alias a directory-tree identity; scanner,
  registry verification, and direct-file import agree. Generic `hashFile` remains
  a raw byte hash, and directory tree encodings remain unchanged.

**Boundary:** Mode/suffix/shebang inputs remain separate capability metadata. Phase 01
does not decide whether execute-bit-only capability transitions are an exception to
chmod-invariance. Durable journal recovery/migration policy and Windows readiness or
production-runtime qualification remain outside this phase.

### FR-25: Workspace Advisor host admission and identity (Phase 01)

**Status:** Phase 01 admission and identity completed and approved 2026-09-29; Phase 02 status is recorded in [FR-26](#fr-26-history-scope-and-unmapped-record-preservation-phase-02).

**Requirement:** An authenticated Workspace user must select a registered, resolvable project/worktree to identify the owning DamHopper connection and profile before Advisor admission. The host returns a server-resolved descriptor with canonical project identity, actual history/context scope, and actor-effective operations. Client-supplied profile, actor, project ID, root path, scope, or permission overrides never establish authority.

**Acceptance:**
- `plugins:describeView` accepts only the non-null `{installationId, target}` request at `POST /api/plugins/view-context`; unknown authority fields reject. No selection, unavailable target, or unauthenticated access does not fall back to another project, profile, or root.
- The server resolves the configured target/worktree, canonicalizes its directory, and computes lowercase SHA-256 over exact UTF-8 path bytes. Unsupported encoding and unsafe roots fail; labels remain display-only.
- The descriptor distinguishes `historyScope` (`history-root`, `project`, `unavailable`) from the existing runner `contextScope` (`history-root`, `project`). The enabled owner-history source implies only `history.refresh`, `history.summary`, `history.page`, and `history.detail`; policy/evaluation access still requires existing grants and remains available when history is unavailable.
- `authorityKey` fences authority changes using installation, package, scope, security/source revision, and target-binding identity. It is equality metadata, not a credential; asset reads, context open, and invocation continue to reauthorize.
- Server integration and authorization checks cover admission failures, forged identity fields, canonical ID parity, global-root A→B key stability, and distinct history/project/policy/evaluation grants. See the [Workspace Advisor host contract](./workspace-advisor-host-contract.md) and [Phase 01 evidence](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md).

### FR-26: History scope and unmapped-record preservation (Phase 02)

**Status:** Completed and approved 2026-09-29 (review 9.6/10); Phase 03 is complete under [FR-27](#fr-27-negotiated-workspace-bridge-and-reusable-host-phase-03), Phase 04 under [FR-28](#fr-28-workspace-advisor-viewer-scope-and-request-state-phase-04), and Phases 05–09 remain pending.

**Requirement:** In `history-root` scope, All (`project_id: null`) includes structurally valid records with canonical project IDs even when Workspace registration or display-label metadata is absent. Project scope remains bound to its context and cannot widen. Policy/evaluation reads retain independent profile-bound sources and grants.

**Acceptance:**
- A valid-ID Project U fixture with no registration or sidecar label appears in root All and has a usable page/detail; `label` remains `null`.
- The fixture reports 6 discovered directories, 7 accepted records (A=3, worktree=1, B=2, U=1), and 2 invalid records (malformed JSON and directory/payload ID mismatch).
- Project-scoped null queries remain bound; foreign project IDs reject; pagination cursors remain bound to the exact snapshot/query.
- Bounded, cancelled, and deadline-limited scans preserve explicit completeness/diagnostic accounting. Separately granted policy/evaluation reads work without a history root.
- Existing v1 storage/v2 wire and production provider remain unchanged. No ID-less format, exhaustive production-history census, or Workspace rollout is claimed.

**Evidence:** [Phase 02 record](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md) and [approved review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md).

### FR-27: Negotiated Workspace bridge and reusable host (Phase 03)

**Status:** Completed and approved 2026-09-29 (review 9.7/10).

**Requirement:** The Advisor SDK, DamHopper host, and EVCrate viewer negotiate the Workspace bridge extension and share one lifecycle for generic plugin routes and future Workspace embedding. Trusted context becomes usable only after the host opens the authorized context; bridge messages do not grant or widen data permissions.

**Acceptance:**
- The `1.0.0` bridge negotiates `workspace-advisor-v1`; generic plugins retain the base handshake. Envelopes are fenced by bridge version, frame session, and activation generation, with strict context/operation validation and bounded payloads.
- `host.contextReady` follows nonce acknowledgement and authorized context open with expected scope/activation. The viewer waits for it before reporting Advisor data readiness.
- `host.workspaceChanged` accepts only a higher revision under the same `authorityKey`; it updates selected-project metadata without replacing the frame/context. Changed authority or owner revokes and replaces the session before stale content can render.
- `frame.uiIntent` is limited to `activate` / `dismiss` and accepted only for a negotiated, Ready, visible session. It is UI intent, not a data operation.
- `usePluginHost` owns metadata/context resolution, asset verification, owner-change fencing, in-place same-authority selection updates, and session disposal. `PluginHost` is reusable presentation; `PluginHostPage` remains a thin route wrapper.
- Paired tests cover bridge validation/readiness, same-authority selection, owner/authority transitions, pending cancellation, and generic-plugin compatibility.

**Evidence:** [Phase 03 record](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md) and [Cycle 2 review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md). The review records 81 targeted tests and no critical findings; the implementation summary reports 145 passing tests across both repositories.

**Boundary:** Phase 03 completes bridge and reusable-host implementation only. Workspace panel placement, navigation/package cutover, paired end-to-end rollout, and production deployment remain downstream.

### FR-28: Workspace Advisor viewer scope and request state (Phase 04)

**Status:** Completed 2026-09-29; review approved 9.5/10.

**Requirement:** The shared viewer keeps activity scope separate from Workspace
selection and metric filters, uses trusted Workspace identity for history queries,
and fences asynchronous data commits across scope and authority changes.

**Acceptance:**
- `AppState.activityScope` is `'workspace-project' | 'all'` and defaults to the
  Workspace project. `ActivityScopeControl` is shared by Overview and History;
  it does not change Workspace selection.
- `UiHistoryFilters` has no editable `project_id`. `selectHistoryQuery` derives
  it from the admitted Workspace context and returns no query for missing or
  malformed identity, unavailable/revoked context, absent history permission, or
  All without `history-root` authority.
- For Workspace history, scope/filter changes invalidate the old page, cursor,
  selection, and detail, advance the query revision, and request a summary plus
  first page from the existing snapshot. They do not start a new history refresh.
- App-generated request IDs use a monotonically increasing sequence. Captured
  `contextEpoch` fences response/error/loading commits; authority/context loss
  advances the epoch and clears retained data, bound-source wrappers, and
  candidate reveal before new results are accepted.
- User-triggered Refresh independently requests authorized history, current
  policy, and the evaluation list. Missing Workspace selection makes no provider
  calls. Tab, scope, filter, selection, and timer changes do not auto-refresh.
  Policy/evaluations keep their independent bound sources and grants.
- Phase 04 review reports 28/28 focused tests, clean strict TypeScript checking,
  and a passing V-E3 smoke proving no `history.refresh` on scope/filter/view
  transitions. See the [phase record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md),
  [review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md),
  and [UI guide](./advisor-plugin-ui.md).

**Boundary:** Phase 04 proves viewer state behavior, not Workspace placement,
paired end-to-end rollout, or production deployment; Phases 05–09 remain.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Operability | Dry-run/apply, recovery, sanitized receipts/errors, history list/show/export/prune review tools, read-only history metrics, and clear ownership of user-managed state. |
| Bounded work | Bound documents, paths, files, process streams, deadlines, workspace, and transaction state. |
| Reproducibility | Canonical JSON, deterministic ordering, SHA-256, domain-separated resource-file/tree identities, and exact closure manifests; permissions are not content hashes. |
| Isolation | No credentials in policy/checkpoint/results; vendor CLIs own credentials; child processes receive fixed environments. |
| Compatibility | Preserve explicit target boundaries; never silently synthesize unsupported adapters or aliases. |
| Operability | Dry-run/apply, recovery, sanitized receipts/errors, history list/show/export/prune review tools, and clear ownership of user-managed state. |
| Maintainability | One parser, path policy, hashing policy, lock protocol, and error serializer per boundary. |

## Observable release gates

**Current status:** Windows release qualification (Phases 01–10), Advisor Metrics
Explorer (Phases 01–10), and DamHopper Advisor Plugin implementation/package work
through E04 are complete. The Explorer's dated standalone-picker evidence is
historical; its picker/reader source has since been removed. E05 source cutover is
applied, but joint G4 qualification/sign-off is unverified, and standalone
retirement is not release-authorized. Documentation/support cutover is complete.
All-project advisor history (Phases 00–05) is complete and its paired release is qualified; production deployment remains a separate operator action. Deterministic Linux publication evidence, joint G0/G1 and D04/E03 G2 qualification, and the G4 gate remain distinct plugin gates. Original Native Windows advisor Phases 01–02 remain complete; original Phase 03 invocation/packaging implementation is in progress at 67% (4/6), not DONE. Readiness Repairs 01–04 are complete. The isolated package/HOME smoke does not verify the separate standalone install/publication flow, and neither implementation nor repair completion qualifies Windows advisor runtime or production release.

1. Source and target manifests validate with schema-2 rules.
2. Local build/check completes with a current complete manifest and exact 36-file
   controller closure; historical 29/33-file evidence remains dated.
3. Publication dry-run reports only authorized target, HOME, and project changes.
4. Apply and recovery preserve unmanaged files, enforce scope isolation, and reject
   CAS changes.
5. Advisor policy, checkpoint, envelope, history, timeout, cancellation, and cleanup
   contracts are exercised with bounded non-sensitive fixtures.
6. Linux live qualification is run separately for each enabled installed CLI.
7. Phase 06 candidate orchestration passes its release/receipt/publisher contract
   checks (`release-orchestration.test.mjs` and `npm run test:release`); this is
   deterministic repository evidence, not a live publication.
8. The Phase 09 Windows report recorded the hosted `windows-2025` matrix and
   final seven-asset byte comparison in 2026-09-15; this is historical evidence,
   not a claim about current release assets.
9. Phase 10 documentation/support cutover records the exact installer and
   `version --json` Windows boundary; npm/GitHub publication, operator rollout,
   desktop/signing environments, and live runtime/vendor execution remain gated.
10. Historical Advisor Metrics Explorer evidence (2026-09-19) recorded 14
    Playwright built-preview scenarios, 6 package inventory checks, the 10k
    benchmark (p95 scan 1,643 ms, detail 67 ms, cancel 104 ms), the 33-file
    controller closure, and an exact-seven asset check. This is not current
    release-asset verification or G4 evidence.
11. Phase E00 schema/manifest generation check and domain parity suites pass:
    `npm run check:advisor-plugin-schema` and `npm run test:advisor-plugin` pass;
    identity/digest/metric/evaluation parity remains aligned with existing
    protocol fixtures, while the read-closure feasibility artifact remains the
    E01 extraction prerequisite.
12. The 2026-09-21 E02 worker framing, lifecycle, cancellation, safe-error, and
    candidate checks were repository/fixture evidence, not owner-runner G1,
    E04 publication, or standalone retirement. See the [worker guide](./advisor-plugin-worker.md).
13. E03 bridge/state/four-view/security suites and the self-contained UI package
    check were recorded on 2026-09-21; this is repository evidence, not
    host-enforced CSP/sandbox or G2 LAN qualification. See the [embedded UI
    guide](./advisor-plugin-ui.md).
14. E05/G4 cannot be accepted from source removal alone. Joint external Linux
    owner-runner and separate-LAN qualification evidence plus sign-off are
    required; they are not present in this workspace.
15. Native Windows advisor Phase 01 proved primitives (67/67 checks, review 9.3/10); original Phase 02 lifecycle is DONE after review 7.4/10, with 213/213 advisor-controller, 16/16 viewer/manifest/package-inventory, and 21/21 settings/filesystem distribution-primitives tests recorded. Readiness Repairs 01–04 are complete; Repair Phase 04 recorded 20/20 focused tests, 390/390 final required-suite runs, and a 9.0/10 review with no critical findings. Original Phase 03 caller/packaging implementation is in progress at 67% (4/6 checklist entries), not DONE; isolated HOME/package smoke does not verify the separate standalone install/publication flow. No Windows `ADVICE_READY`, provider/Pi/OMP, positive attached-console, production HOME, or full Linux qualification is claimed.

## Documentation map

- [System architecture](./system-architecture.md) — detailed controller,
  distribution, supervision, wire, isolation, and publication contracts.
- [Code standards](./code-standards.md) — normative implementation and naming rules.
- [Codebase summary](./codebase-summary.md) — source/module/generated-output map.
- [Advisor plugin worker](./advisor-plugin-worker.md) — E02 framing, lifecycle,
  safe errors, admission, and candidate package boundary.
- [All-project advisor history contract](./all-project-advisor-history.md) — frozen v2 scope, inventory, metadata, and runner contract.
- [Embedded advisor plugin UI](./advisor-plugin-ui.md) — E03 provider boundary,
  bridge, reducer/views, opaque-origin package, and acceptance boundary.
- [Workspace Advisor host contract](./workspace-advisor-host-contract.md) — `describeView`, selected-project admission, canonical identity, and effective permissions.
- [Project roadmap](./project-roadmap.md) — completed gates, current gaps, and next work.
- [Project changelog](./project-changelog.md) — historical phase evidence and boundaries.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
