# Project Overview and Product Development Requirements

**Status:** Current requirements baseline for EVCrate core CLI/controller, generated projections, and release. Filesystem cutover Phases 01–02, Hook Materialization Scope Distribution Phase 09, Windows release qualification Phase 10, and readiness repairs 01–04 remain recorded milestones. Native Windows evidence remains bounded to the installer and diagnostics described below.
**Former DamHopper plugin integration:** The plugin runtime, worker/package, and paired host integration were retired 2026-10-02. E00–E05 and Workspace Advisor Phase 00–09 requirements and qualification are historical plugin-era evidence, not current architecture or native-migration qualification.
**Updated:** 2026-10-02
**Scope:** EVCrate package and generated projections, shared advisor controller, atomic publication, and historical paired DamHopper Advisor contracts

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
- Eight fixed projection adapters (`claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, `copilot`, and `vscode`) with no discovery or fallback adapter.
- CAS-aware import, scope, advisor-settings, build, publication, and recovery flows.
- Scope-aware publication (`--scope home|project`) with unconditional shared controller
  publication to `<home>/.evcrate/bin` and independent project harness materialization.
- Two-phase project publication transactions with project-only rollback, non-compensation
  of shared commit, and schema-2 scope-isolated recovery.
- One shared advisor controller published to `$HOME/.evcrate/bin`.
- Deterministic advice activation via `evcrate-advice-mode`, explicit checkpoint counsel through a final `--advice` token, and structured caller handoffs.
- Documentation/target command naming as `/cmd-*`, OMP `__` flattening, and
  Copilot `evcrate-cmd-*` projection.

### Out of scope for this baseline

- Editing generated projections or renaming canonical source commands.
- A daemon, background advisor broker, or generic/unbounded CLI retry loop.
- Provider switching, model substitution, local fallback, or native callback relay
  outside the managed v2 controller flow.
- Copilot as a controller backend.
- Broad Windows runtime equivalence (`publish`, `health`, general CLI/process
  parity) remains outside this baseline and unqualified. Native advisor Phases
  01–04 include an observed OMP `ADVICE_READY` and OMP/Codex diagnostics, but
  Claude/Pi remain unverified; this evidence does not expand Windows release
  support. Desktop/non-admin/UAC/SmartScreen/enterprise environments,
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

**Acceptance:** A build reads the canonical roots, registers all eight fixed target
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
36-file controller closure while preserving dated 29-file release evidence.
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
installer lifecycle and `version --json` under FR-17. Native Windows Phase 03
observed OMP `ADVICE_READY`; Phase 04 qualified OMP/Codex diagnostics, while
Claude/Pi and broad Windows runtime parity remain unverified.
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
### FR-11: Deterministic advice activation and supervision semantics

**Requirement:** Deterministic advice activation is governed by the packaged CommonJS `evcrate-advice-mode` Node helper (`$HOME/.evcrate/bin/evcrate-advice-mode`) invoked before any state initialization or full mentoring load. A standalone final `--advice` token enables explicit mode (`EXPLICIT_FINAL_FLAG`). Structured pre-run (`INHERITED_PRE_RUN`) and same-run (`INHERITED_SAME_RUN`) caller handoffs preserve known plan/phase selections without synthetic flags or eager run creation. Neutral historical inspection is governed independently by `plan-progress.md` using `state get` only. `@advisor` remains ordinary task text. Only an outer <code>ADVICE_READY</code> envelope completes an authorized checkpoint.

**Acceptance:**
- **Invocation & limits:** Maintained callers invoke the helper with supported Node (`>=22.19.0`), absolute HOME path, zero positional options, and canonical project cwd. Strict bounded JSON stdin (`protocol: "evcrate-advice-mode"`, version 1, max 64 KiB), raw arguments (max 32 KiB), terminal output (max 256 KiB), and 2-second deadlines.
- **Token parsing:** The token is case-sensitive, standalone, whitespace-delimited, and strictly final (trailing whitespace allowed). Duplicate tokens reject with `ADVICE_MODE_DUPLICATE_FLAG`. Quoted, embedded, suffixed, differently cased, and non-final forms remain ordinary work text.
- **Modes:** Resolves mode `off`, `explicit`, or `inherited`. Helper in off mode performs zero get (L=0). Cooperating callers load full `advisor-mentoring.md` conditionally only upon resolved `explicit` or `inherited` mode. Off mode preserves ordinary debugging, review corrections, validation, approvals, and command-scoped Git policy without advice lifecycle calls; neutral historical progress inspection can perform identified `state get` without activating advice.
- **Structured handoffs:** Routers (`/cmd-cook`, `/cmd-fix`) use `kind: "pre-run"` with `run: null` to preserve known plan/phase/target context without synthetic flags or eager router state init. Continuation delegates use `kind: "same-run"` forwarding verified `task_run_id`, `project_id`, `phase_id`, and exact revisions (`task_revision`, `scope_revision`, `evidence_revision`) validated by lazy get against durable state; completed or abandoned runs fail closed with `ADVICE_RUN_COMPLETED`.
- **Fail-closed:** Missing/unreadable helper, unsupported Node, nonzero exit, malformed output, context mismatch, or stale revisions halt routing immediately with a sanitized four-key diagnostic (`{ code, category, action, message }`). No fallback parser, automatic installation, retry loop, or heuristic mode inference.
- **Neutral progress & immutability:** Historical progress inspection uses `state get` only; permits existing lock acquisition/release and provably dead lock reaping; zero lifecycle writes/state mutation. Historical success requires matching project identity, repo-relative plan/phase paths, controller phase, and snapshot digest; completed scope is a verified no-op.
- **Boundaries:** Caller JSON provides cooperative consistency without authenticated user intent or session-token provenance guarantees. Linux x64 bounded native qualification observed on OMP 18.6.1 across six scenario classes (`s01`, `s02`, `s03`, `s05`, `s07`, `s11`) capped at Step 0; prerequisite admission gates (`s10` diagnostic uncaptured, `s12` timed out) remain explicit native limits; incomplete A02/A22 historical artifact evidence, A12 retained-record reconciliation without compiler loops, and unexercised A13/A16 native branches. Other vendor model loops remain unqualified; native Windows and macOS are excluded by user direction; ordinary Phase 04 user approved completed 2026-10-06T14:13:41+07:00 / 9.8 review, no durable completion/provider release/commit claim.
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
**Historical requirements:** FR-19–FR-22 below describe the retired plugin API,
worker, embedded UI, and cross-project plugin host integration. Their acceptance
criteria and dated test evidence are retained for traceability only, not as
current product or release gates.
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
historical repository/fixture evidence. The plugin runtime, worker, and package
were retired 2026-10-02; former G1/G4 gates no longer define current requirements
and this evidence does not qualify native DamHopper integration.

### FR-21: Embedded provider-neutral four-view UI (Phase E03)

**Historical E03 requirement:** Provide one React `App`/reducer and four shared
views behind the E00 `AdvisorDataProvider`, with a temporary File System Access
adapter for the standalone viewer and a bounded DamHopper `MessagePort` adapter
for the embedded plugin. Keep transport, actor authority, paths, credentials, and
host internals outside shared view state.

**Historical status:** E03 completed 2026-09-21 (review 9.2/10). The
plugin-era E04/G3 and E05/G4 gates are retained in dated records only; the
plugin package and host integration were retired 2026-10-02. This history does
not establish current native integration qualification.

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

**Status and evidence:** Native Windows advisor Phases 01–04 are complete. Phase 03 isolated npm-pack and `install.ps1` sandbox publications verified the exact 36-file closure and unchanged routing policy, and observed live OMP `ADVICE_READY`; Phase 04 records 58/58 relevant tests, `release:check`/`distribute:check` success, and OMP/Codex diagnostic qualification. Claude/Pi remain unverified. Readiness Repairs 01–04 are complete; Repair Phase 04 recorded 20/20 focused tests, 390/390 required-suite runs, and a 9.0/10 review with no critical findings.

**Acceptance boundary:** The evidence completes implementation and the stated OMP/Codex diagnostic qualification, not broad Windows runtime parity or support. Claude/Pi and production HOME publication remain unverified or operator-gated. The Windows release boundary remains installer lifecycle and `version --json`; WSL Ubuntu 22.04/ext4 full Linux qualification passed 400/400. State/history owner checks were superseded by the cross-platform trusted-files policy.

### FR-24: Launchability and filesystem identity (Phase 01)

**Status:** DONE (2026-09-27). Historical implementation and review details are summarized in the [project changelog](./project-changelog.md); the original plan and review artifacts are not retained in this repository.

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

### FR-25: VS Code Local native support

**Requirement:** Add a distinct persisted `vscode` target for VS Code Local as an isolated Agent Plugins 1.0 bundle (`evcrate-local`), generated at `.evcrate/source/.evcrate-vscode/` and published to project or HOME `.evcrate-vscode/`. User-controlled registration via VS Code's `chat.pluginLocations` setting; publication never writes editor settings. Standalone `--agent` relay is rejected with `ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE`. Native hook protocol covers eight Agent Plugins 1.0 events with scout and privacy policies (no lexical trust, fail-closed unqualified tools, bare command operand inspection) and CommonJS runtime closure. Explicit session context uses atomic CAS v1 state with bounded retention (7d, 256/proj, 1024/user). Coexistence preserves Copilot CLI target (`copilot`) and opt-in `.claude` discoveries. Opt-in MCP examples remain inert templates.

**Acceptance:** Live qualification on Linux x64 with VS Code 1.140.0 and Copilot Chat 0.68.0 verified with 12 context receipts (6 qualified, 5 unexercised workstation-dependent, 1 unsupported browser web). Core release assets remain exactly seven files.

### Historical Workspace Advisor requirements (FR-25–FR-33)

The FR-25–FR-33 acceptance criteria describe the former plugin host integration,
retired 2026-10-02. The detailed PDR and evidence are retained as history; they
are not the current Native Advisor contract.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Operability | Dry-run/apply, recovery, sanitized receipts/errors, history list/show/export/prune review tools, read-only history metrics, and clear ownership of user-managed state. |
| Bounded work | Bound documents, paths, files, process streams, deadlines, workspace, and transaction state. |
| Reproducibility | Canonical JSON, deterministic ordering, SHA-256, domain-separated resource-file/tree identities, and exact closure manifests; permissions are not content hashes. |
| Isolation | No credentials in policy/checkpoint/results; vendor CLIs own credentials; child processes receive fixed environments. |
| Compatibility | Preserve explicit target boundaries; never silently synthesize unsupported adapters or aliases. |
| Maintainability | One parser, path policy, hashing policy, lock protocol, and error serializer per boundary. |

## Observable release gates

**Current status:** EVCrate package `2.6.0` maintains the core CLI, Advisor
controller, producer history, and seven-asset release workflow. The DamHopper
plugin runtime/package/worker and paired host integration were retired on
2026-10-02. E00–E05 and Workspace Advisor Phase 00–09 qualification records are
historical; their old G0/G1/G2/G4 gates are not current release requirements
and do not qualify the native DamHopper integration. Current native API/UI and
integration evidence belong to DamHopper's Native Advisor architecture. The
former standalone picker/reader source is removed. Native Windows advisor
Phases 01–04 and readiness repairs 01–04 remain bounded as described above;
Windows support is limited to installer lifecycle and `version --json`.

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
11. Former E00/E02/E03 plugin contract, worker, UI, and G1/G2/G4 evidence is
    retained in dated records only. The plugin implementation and release
    gates are retired and must not be treated as current EVCrate requirements.
12. Former Workspace Advisor Phase 00–09 paired qualification applies only to
    the retired plugin-host candidate; it is not evidence for current native
    DamHopper integration.
13. Native Windows advisor Phases 01–04 are complete: Phase 03 observed live OMP `ADVICE_READY`, and full Linux qualification passed 400/400 on WSL Ubuntu 22.04/ext4. Phase 04 records 58/58 relevant tests, clean `release:check`/`distribute:check`, and OMP/Codex diagnostic qualification; Claude/Pi remain unverified. Readiness Repairs 01–04 are complete (20/20 focused and 390/390 final required-suite runs; 9.0/10 review). General Windows runtime parity is not claimed; the release boundary remains installer lifecycle and `version --json`, with production HOME publication operator-gated.

## Documentation map

- [System architecture](./system-architecture.md) — detailed controller,
  distribution, supervision, wire, isolation, and publication contracts.
- [Code standards](./code-standards.md) — normative implementation and naming rules.
- [Codebase summary](./codebase-summary.md) — source/module/generated-output map.
- [Historical Advisor plugin integration](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02) — retired package/worker and paired host evidence.
- [All-project advisor history contract](./all-project-advisor-history.md) — producer history format and historical host integration.
- [Workspace Advisor host contract](./workspace-advisor-host-contract.md) — former `describeView`, identity, and bridge contract.
- [Workspace Advisor Product Requirements](./workspace-advisor-pdr.md) — historical Phase 01–09 requirements and qualification.
- [Project roadmap](./project-roadmap.md) — package milestones and current release boundaries.
- [Project changelog](./project-changelog.md) — dated phase evidence.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
