# System Architecture

**Status:** Current implementation reference; Hook Materialization Scope
Distribution is complete through Phase 09 (512/512 tests, 29/29 closure files,
and verified Linux release fixtures). Historical advisor mentoring acceptance is
recorded below; live vendor qualification and production HOME publication remain
operator-gated.  
**Updated:** 2026-09-13  
**Authority:** TypeScript control plane and the canonical advisor controller source

This document is the central authority for distribution, advisor supervision, wire
contracts, isolation, and publication. The [codebase summary](./codebase-summary.md)
provides the source map; the [project overview and PDR](./project-overview-pdr.md)
turns these contracts into requirements.

## 1. System shape

EVCrate is a private npm package (`evcrate`, version `2.0.0`) for building and
publishing one canonical agent-harness source tree into seven persisted target
projections. Node `>=22.19.0` is the package engine. The package exposes:

- `evcrate` → `dist/cli/evcrate.js`, the one-shot TypeScript control-plane CLI.
- `evcrate-advisor` → `.evcrate/source/.evcrate/bin/evcrate-advisor`, the shared
  CommonJS checkpoint controller.

The control plane resolves an immutable invocation context, validates one request,
dispatches one operation, writes one result, and exits. It does not run a daemon,
listener, background broker, or provider router.

```mermaid
flowchart TD
  Canonical[.evcrate/source/.claude\ncanonical authoring] --> Build[TypeScript build/check]
  Overlays[.evcrate/targets/*\nmanifest and overlay policy] --> Build
  Build --> Snapshot[VerifiedCurrentBuild snapshot\nand build digest]
  Snapshot --> SharedPhase[Ordered Phase 1: Shared\n.evcrate/bin closure]
  Snapshot --> HarnessPhase[Ordered Phase 2: Harness\nTarget projections]
  SharedPhase --> HomeShared[Shared HOME commit\n~/.evcrate/bin]
  HarnessPhase --> ScopeHome[--scope home\nHOME harness targets]
  HarnessPhase --> ScopeProject[--scope project\nProject workspace targets]
  Checkpoint[Versioned checkpoint v2\n(v1 compatibility)] --> Advisor[~/.evcrate/bin/evcrate-advisor]
  Policy[$HOME/.evcrate/advisor-routing.json] --> Advisor
  Advisor --> Envelope[One terminal controller envelope]
```
## 2. Ownership and generated boundaries

| Area | Owner | Editing rule |
|---|---|---|
| Canonical harness resources | `.evcrate/source/.claude/` | Author here; do not hand-edit projections. |
| Shared advisor controller | `.evcrate/source/.evcrate/bin/` | Author the controller closure here. |
| Target policy | `.evcrate/targets/*/manifest.json` and declared overlays | Change policy/overlays, then rebuild. |
| Generated projections | `.evcrate/source/.agents`, `.codex`, `.gemini`, `.antigravity`, `.pi`, `.omp`, `.copilot` | Generated output; never hand-edit. |
| Controller publication | `$HOME/.evcrate/bin/` | Publisher owns one shared copy; no target owns a copy. |
| Advisor routing policy | `$HOME/.evcrate/advisor-routing.json` | User-owned input; never generated, published, replaced, or chmodded by EVCrate. |
| Resource registry | `.evcrate/registry.json` | Schema-1 resource records; separate from schema-2 target/build manifests. |

The target registry persists exactly `claude`, `codex`, `gemini`, `antigravity`,
`pi`, `omp`, and `copilot`. `agy` is accepted only as an input alias for
`antigravity`; it is not persisted. Projection registration is fixed and
exhaustive: Claude, Gemini, Antigravity, Codex, Pi, OMP, and Copilot each register
one real adapter. There is no discovery or fallback adapter.

Copilot is a staging/projection target, not a controller backend. Its adapter
namespaces resources, emits a migration inventory, routes safety hooks through a
fail-closed bridge, and merges only declared settings keys. It must not be
presented as a relay to `evcrate-advisor`.

## 3. TypeScript control plane

The source is organized around narrow contracts:

- `src/protocol/`: bounded JSON, canonical JSON, resource, publication, scope,
  diagnostic, and advisor-settings wire shapes.
- `src/context/`: package, project, home, state, target, and immutable path context.
- `src/manifests/`: schema-2 target manifests, resource roots, home bindings,
  patch authorization, and manifest registry loading.
- `src/adapters/`: seven target projection adapters, resource graph validation,
  qualification, and target-specific transforms.
- `src/registry/`: schema-1 canonical resource scan, compatibility records, and
  deterministic queries.
- `src/imports/`: bounded explicit-source preview/apply and single-use replay tokens.
- `src/scopes/`: global/project assignments, inheritance, revisions, and CAS.
- `src/advisor-settings/`: user policy get/preview/apply, locking, journal, and
  recovery; this transaction is separate from target publication.
- `src/distribution/`: local build/check, schema-2 build verification, staging,
  publication, recovery, managed JSON/JSONC, Pi settings, and cutover gates.
- `src/cli/`: argument parsing, request-file handling, dispatch, process runner,
  output, health, and the executable wrapper.
- `src/filesystem/` and `src/errors/`: bounded paths/I/O/hashes/locks/atomicity and
  stable sanitized errors.

The CLI accepts `version`, `health`, `resources list|get`, `imports preview|apply`,
`scopes list|get|assign|remove|enable|disable`, `changes preview|apply`,
`advisor settings get|preview|apply`, and distribution `build|check|publish|all|recover`.
A complete bounded versioned request file is mutually exclusive with positional
command construction. JSON and non-TTY output use the same validated result.

## 4. Build, hash, and publication

A local build stages canonical resources and selected projections outside the live
roots, validates each projection, computes hashes, and verifies a schema-2 build
manifest. The manifest records source, adapter, controller, owner, output, and
validation metadata. The current build is usable only when validation is complete
and all current source/adapter/output hashes, ownership, and expected files match.

Build/check and publication are separate operations. Publication accepts a scalar
`--scope home|project` parameter (defaulting to `home`). Exactly one neutral,
verified `VerifiedCurrentBuild` snapshot and digest feeds two ordered logical phases:
`shared` (phase 1) and `harness` (phase 2).

1. **Shared infrastructure**: The advisor controller closure (`.evcrate/bin`) is
   unconditionally published under `--home` (`<home>/.evcrate/bin`) in both scopes.
   Target filtering via `--target` applies only to harness projections and never
   filters or skips shared controller publication. Shared controller materialization
   never targets a project workspace.
2. **Harness destinations**:
   - **HOME scope (`--scope home`)**: Target manifests specify `homePolicy.bindings`
     beneath `--home`. Neutral source roots map to target HOME directories (`.claude`,
     `.agents`, `.codex`, `.gemini`, `.pi`, `.omp`, `.copilot`), with Antigravity
     mapping to `<home>/.gemini/config`. Root documents (`AGENTS.md`, `GEMINI.md`) are
     excluded from HOME.
   - **Project scope (`--scope project`)**: Harness projections bind under
     `--project-root`. Target manifests declare `output_roots`, `additional_roots`,
     and `project_docs` in deterministic declaration order. Installed wrappers resolve
     internal resources from their own installation location, while runtime environment
     and `process.cwd()` remain active project workspace data.
3. **Transaction models**:
   - **HOME scope**: Executes as a single atomic transaction on the HOME destination volume.
     Shared and harness records share a single `releaseId` and bounded retention cleanup.
   - **Project scope**: Executes as a two-phase transaction:
     - Phase 1: Commits the shared controller to `--home` under the HOME publication lock.
     - Phase 2: Acquires the project workspace lock (holding HOME lock, never reversing locks)
       and commits harness projections to `--project-root`.
     - The shared HOME commit is never compensated or rolled back if project harness application fails.
4. **Preflight and safety invariants**:
   - Complete path validation, non-symlink ancestor checks, owner control, and intra-/cross-target
     overlap detection run before any destination reads or mutations.
   - Both destinations must verify same-volume atomicity with their respective staging roots.
5. **Partial failure semantics (exit code 5)**:
   - Failure before shared commit fails closed as an ordinary resource error.
   - Failure during project harness application rolls back only the project workspace.
   - Successful rollback outputs status `'partial'` and sanitized error code `PUBLICATION_FAILED`.
   - Rollback failure outputs status `'partial'`, error code `ROLLBACK_FAILED`, and preserves
     the project journal for recovery. Exit category is 5.
6. **Scope-isolated recovery**:
   - `evcrate recover --scope home`: Reads only schema-2 HOME publication state under
     `$HOME/.evcrate/publication/`.
   - `evcrate recover --scope project --project-root <dir>`: Validates canonical
     `projectIdentity` (lowercase SHA-256 over normalized absolute path) and recovers only
     project harness state under `<project-root>/.evcrate-publish-state/`.
   - Recovery requires process quiescence and never crosses requested scope boundaries.

Unmanaged HOME and project files remain preserved. Advisor policy and unrelated roots
are not publication inputs. The TypeScript engine is authoritative for the current
package path; source retains an explicit compatibility-engine type, but no root
`distribute.py` entrypoint is present in the current repository inventory. Do not
use stale Python commands as the primary installation or distribution procedure.
The controller build is a separate exact closure rooted at
`.evcrate/source/.evcrate/bin`. Its 29 production files are:

```text
evcrate-advisor
lib/advisor/adapter-contract.cjs
lib/advisor/adapter-registry.cjs
lib/advisor/adapters/claude.cjs
lib/advisor/adapters/codex.cjs
lib/advisor/adapters/omp.cjs
lib/advisor/adapters/omp-parser.cjs
lib/advisor/adapters/pi.cjs
lib/advisor/checkpoint-contract.cjs
lib/advisor/contracts-v2.cjs
lib/advisor/controller-envelope.cjs
lib/advisor/controller.cjs
lib/advisor/errors.cjs
lib/advisor/history-contract.cjs
lib/advisor/history-prune.cjs
lib/advisor/history-query.cjs
lib/advisor/history-store.cjs
lib/advisor/isolated-workspace.cjs
lib/advisor/json-document.cjs
lib/advisor/managed-checkpoint.cjs
lib/advisor/policy-schema.cjs
lib/advisor/profile.cjs
lib/advisor/runner.cjs
lib/advisor/runtime-brief.generated.cjs
lib/advisor/state-baseline.cjs
lib/advisor/state-contract.cjs
lib/advisor/state-human.cjs
lib/advisor/state-io.cjs
lib/advisor/task-state.cjs
```

`runtime-brief.generated.cjs` is generated by
`scripts/generate-runtime-brief.mjs` from the canonical
`.claude/skills/advisor-strategy/references/brief-contract.md`. The artifact
contains the instructions, SHA-256 digest, and `evcrate-advisor-v2-*` build
identity; it is part of the closure and is not hand-edited.

Source and projection entries must be regular non-symlink files with the
expected entrypoint shebang/mode. The generated inventory and schema-2
`controller_hashes` are authoritative; missing, extra, stale, or mismatched
entries block publication.

## 5. Shared advisor controller

### 5.1 Policy and migration boundary

The controller reads exactly one required user-owned policy:
`$HOME/.evcrate/advisor-routing.json`. There is no repository-local fallback,
default, partial merge, or host-route selection. Phase 01 freezes policy v2:

```json
{
  "version": 2,
  "advisor": {
    "primary": {"backend": "codex", "model": "operator-selected", "effort": "high"},
    "backup": {"backend": "omp", "model": "operator-selected", "effort": "high"}
  },
  "wait": {"mode": "until_terminal", "warn_after_ms": 120000, "warn_every_ms": 300000},
  "history": {"retention_days": 30, "max_bytes": 104857600}
}
```

The top level is exactly `version`/`advisor`/`wait`/`history`; routes are
exactly `backend`/`model`/`effort`. Primary and backup triples must differ.
Wait warnings are bounded to `1000..3600000` ms; history retention is
`1..365` days and quota `1048576..1073741824` bytes. There is no v2
`timeout_ms`; generation mode has no generation deadline while input, streams,
output, termination, and adapter probes remain bounded. Policy bytes remain
bounded to 16 KiB and use fatal-UTF-8/strict-JSON parsing,
duplicate-key, control-character, credential, unknown-field, unsafe-path, and
candidate-backend checks. The policy file is regular and user-owned;
`$HOME` and `.evcrate` ancestors must be real user-controlled directories without
limiting mode bitmasks or failing closed on standard umask permissions.
Candidate backends are `claude`, `codex`, `antigravity`, `pi`, and `omp`;
enabled backends are `claude`, `codex`, `pi`, and `omp`. `antigravity` is an
unavailable candidate; Gemini and Copilot are not controller backends.

Legacy host-v1 and single-target-v1 documents are inspectable through the
settings `get` path as read-only `migration_required` views, but runtime
execution rejects them with distinct migration errors. Migration is explicit:
`settings get` -> operator prepares v2 -> `preview` -> `apply`. Apply preserves
the legacy revision for CAS, requires a complete backup route, and never
rewrites HOME automatically. Settings request/result, preview, and journal
wire schemas remain version 1; they carry a v2 policy payload. Old journals
recover in their own byte/digest format before v2 mutation; old preview tokens
cannot authorize v2 semantics.

### 5.2 Phase 01 v2 contract freeze

The standalone CJS validator and TypeScript settings/protocol validator remain
separate closures. They share exact schemas and parity fixtures; CJS cannot
import `dist/` or projected resources. Phase 01 freezes these versions:

| Contract | Version | Boundary |
|---|---:|---|
| `advisor-routing.json` policy | 2 | User-owned HOME input; primary/backup, wait, history. |
| `evcrate-advisor-checkpoint` | 2 | Managed caller to controller; identity, task, proposal, evidence, prior. |
| `evcrate-advisor-result` | 2 | Controller-normalized structured counsel. |
| `evcrate-advisor-controller` | 2 | Terminal envelope with attempts and audit status. |
| Settings request/result, journal, preview | 1 | Existing TS transaction transport; policy payload is v2. |
| Task state, execution history, outcome | 1 | Owner-only local records; task state remains required gate authority, while history/outcome provide optional rich audit. |

The v2 checkpoint requires `task_run_id`, `checkpoint_id`, `phase_id`,
`task_revision`, `evidence_revision`, decision kind, task constraints,
proposal, bounded evidence, and prior disposition. It is at most 32 KiB:
question 4 KiB, task/proposal text 8 KiB, evidence text 16 KiB, four evidence
files, and sixteen changed paths. Paths are normalized relative POSIX metadata;
the controller does not read or mount them. Evidence digests bind selected
content; they do not prove semantic correctness.

The v2 result requires non-omittable `recommendation`, `rationale`,
`must_fix`, `cautions`, `assumptions`, `success_checks`, and
`unresolved_questions`; body limit is 16 KiB. The v2 envelope binds
correlation/task/checkpoint/evidence identity, receipt/build identity,
bounded ordered attempts, result or sanitized error, and `audit_status`.
It allows at most five model-started attempts and eight summaries; successful
counsel requires confirmed cleanup. Task state is capped at 64 KiB;
execution and outcome records at 128 KiB and 64 KiB.

Phase 01 freezes retry slots (`10/20/30` seconds for primary, one backup),
cleanup classifications, gate statuses, and correction cap (`3`) for later
phases. It does not itself activate indefinite generation, retry orchestration,
task-state commands, or history tooling.

### 5.3 Compatibility checkpoint wire contract

The existing compatibility helper still accepts the v1 direct checkpoint. The
executable receives it directly on stdin; no outer operation, active-host field,
route override, executable, argv, credential, debug, or fallback field is
accepted. Its ten keys are `protocol`, `version`, `checkpoint`, `question`,
`kind`, `task_or_phase`, `evidence`, `changed_paths`, `prior_counsel`, and
`owner_disposition`. New callers must use the v2 contract above.

#### Durable v2 task gate

The managed default entrypoint requires a prior `evcrate-advisor state checkpoint`
reservation for v2 inference. State operations never launch a model. Run all
operations from the same canonical project directory: its SHA-256 identity scopes
`$HOME/.evcrate/advisor-state/<project-id>/<task-run-id>/state.json`.

Each request is one strict JSON object on stdin with exact keys:
`protocol: "evcrate-advisor-state"`, `version: 1`, `operation`, UUID `task_run_id`,
UUID `operation_id`, `expected_revision`, and `payload`. `get` requires null
operation/revision IDs. `init` expects revision zero; returned state starts at
task revision one and evidence revision zero. Other mutations use the latest
returned task revision; immutable checkpoint revisions remain bound to their
reservation input while claim/attachment advance storage revisions.

| CLI operation | Payload |
|---|---|
| `state init` | `phase_id`, checkpoint-shaped `task`, selected `baseline_paths` |
| `state get` | Empty object; also returns pending process status |
| `state checkpoint` | Validated v2 `checkpoint`; returns exact input and consultation ID |
| `state disposition` | `consultation_id`, `evidence_revision`, `action`, `rationale`, `correction` |
| `state outcome` | `consultation_id`, `action_id`, `episode_id`, `result`, `validation`, `actual_changed_paths` |
| `state human-decision` | `action`, `rationale`, `authorized_paths` |
| `state complete` | Empty object |

Disposition actions: accept, reject-with-evidence, need-evidence, reconcile.
Correction is null or `{action_id, episode_id, validation_command}`. Outcomes
resolved/unresolved/regressed require terminal matching validation; unknown keeps
the correction incomplete. Only failed unresolved/regressed corrections increment
the episode count. A relevant verified resolution ends it. Three failures require
human continuation, consumed by one correction without resetting that count.

For concern-free advice (`action: 'accept'`, `correction: null`), `outcome`
supports `action_id: null`, `episode_id: null`, `result: 'resolved'`, with empty
`actual_changed_paths` and matching passed validation, advancing to
`gate_status: 'open'` and enabling `complete` without invented edits. A final
review consultation confirming clean state can likewise complete via this
no-correction outcome path.

End-to-end ledger headroom: accepting a checkpoint requires space for the entire
minimal closure sequence (checkpoint + attach + disposition + outcome + complete = 5
slots), failing closed (<code>STATE_GATE_BLOCKED</code>) before inference if the
ledger cannot accommodate that path. While pending, `recover-pending` requires
only 1 ledger slot as the terminal outcome of the reservation.

A preflight replay check inspects `operation_ledger` before invoking
`observeTerminalDecision`, ensuring exact matching replays return existing state
idempotently without re-prompting the controlling terminal or failing if TTY is
absent on replay.

Git baseline records selected dirty/index/rename/deletion metadata, discovering
staged rename identity (`git diff --cached --raw -z --find-renames`) even when
only one rename endpoint is selected in scope. Outcome actual change attribution
compares both content digests and Git status/identity metadata.

Per-task locking (`state.lock`) covers bounded synchronous state read/write,
file hashing (up to 64 MiB total), and bounded Git metadata commands (up to 5s
per command). No model wait occurs under lock. Competing writers encounter
<code>STATE_LOCKED</code>; inspect the current state and retry after the bounded
transaction, which may be non-trivial when hashing or Git metadata is required.

Offline operator recovery: in the event of a crash during atomic publication
leaving a temporary file (`.state-*.tmp`) or hard-linked state (`nlink = 2`), or
an uncertain recovery guard (`state-recovery.lock`), the store fails closed.
Recovery is operator-only: stop every process accessing the task directory,
verify owner/mode/type plus device/inode/link identity and recorded process
death, then identify the exact `.state-*.tmp` link sharing `state.json`'s inode
before unlinking it. Remove a recovery guard only after its recorded processes
and lock identity are verified dead. Never use wildcard or age-based cleanup,
blind reset, or replacement of the state file.

Human actions are continue, revise-scope, abandon, recover-pending. The Linux CLI
uses a separate controlling terminal and exact randomized confirmation; piped
JSON cannot supply an attestation. This is a cooperative interaction, not proof
against same-user automation. Per-host authentic event linkage remains Phase 08.
Recovery preserves state/work, requires dead or never-started pending identity,
and never kills or relaunches a process.

State is owner-only, strictly validated and bounded to 64 KiB. A 64-entry operation
ledger and 16 human-decision limit fail closed rather than forget replay IDs.
Selected baseline records retain initial user content digests plus relevant Git
dirty/index/rename/deletion metadata; current evidence freshness ignores unrelated
files. Selected exact file paths are bounded to 32 (16 proposed changes), reads
to 16 MiB/file and 64 MiB total. Digests and declared validation identity do not
authenticate executor claims or prove semantic/hunk attribution.

Storage uses Linux descriptor-pinned I/O, atomic fsync writes and short
process-start/token locks; no lock survives an inference wait. Unknown stale lock
or process identity is preserved for inspection. Windows state operations fail
closed until separately implemented/qualified. Optional rich audit is not required
state authority. V1 callers remain outside this v2 state path until the Phase 08
canonical workflow cutover; no universal mediated-write enforcement is claimed.

### 5.4 Current v1 compatibility and v2 bounded transaction envelopes

`runController` accepts both the v1 compatibility checkpoint and the v2
checkpoint. The v1 compatibility path remains one target and one model attempt.
For v2, Phase 05 runs a managed transaction with up to four sequential primary
launches on transient failures, using cancellable 10/20/30-second backoff. After
four primary failures or a route-local preflight skip, it qualifies and invokes
the configured backup once. Backup failure is terminal; there is no provider or
model substitution, parallel hedge, or local fallback.

The controller generates a correlation UUID, parses the checkpoint, loads policy
once, probes each selected adapter before its launch, creates one empty owner-only
workspace, and cleans up after each child exits.

For a v2 checkpoint, the controller computes the checkpoint digest and uses
`formatMentorPrompt`: the generated canonical mentor brief is followed by
explicitly quoted checkpoint data. That one `context.prompt` is passed without
adapter-specific mentor text to the Claude, Codex, OMP (`omp-parser`), and Pi
invocations. Their transport parsers differ, but each extracts raw assistant
text and sends it to the same `parseAdviceBody` validator before
`normalizeResult` creates `evcrate-advisor-result` v2.

`parseAdviceBody` accepts exactly one JSON object with seven fields:
`recommendation`, `rationale`, `must_fix`, `cautions`, `assumptions`,
`success_checks`, and `unresolved_questions`. It rejects markdown fences,
leading/trailing prose, missing or unknown fields, malformed lists, control
characters, sensitive material, and raw stack frames. The stack guard covers
Node (`at ...:line:column` and `node:internal`), Python (`File "…", line N`),
Go (`goroutine N` and multiline `.go:N` frames), and Rust (`stack backtrace`
and hexadecimal frame forms). Ordinary prose in a field remains valid when it
does not match those frame shapes.

Public V2 envelope validation recomputes the checkpoint digest with
`computeCheckpointDigestV2` and compares it with the supplied envelope value;
it also checks task/checkpoint identity and revisions. When validation receives
`expected_build_identity`, it must equal `receipt.build_identity`; the builder
and `receiptV2` additionally require the generated **ADVISOR_BUILD_IDENTITY**.
For success, the selected attempt's route backend/model/effort must correspond
to the receipt, including exact effort equality. These checks prevent stale
checkpoint, build, or route metadata from being treated as counsel.

The v2 envelope preserves task/checkpoint/evidence identity, checkpoint digest,
receipt/build identity, controller version 2, ordered attempt summaries, and
audit status. Success requires a model attempt with confirmed cleanup.
The v1 path keeps its compatibility result/envelope shape. Both paths emit one
terminal JSON line with `status: "ADVICE_READY"` or `status: "FAILED"`.
Failures expose only sanitized `code`, `category`, `action`, and `message`;
stderr is empty; exit code is zero only for success.

### 5.5 Adapter and process isolation

Each enabled adapter owns credential-safe version/auth/capability probes, fixed
arguments, and result parsing. Installed vendor CLIs retain their own credentials;
EVCrate's adapter auth-key allowlists are empty. Version equality alone is not
qualification: model/effort controls, authentication boundary, no-tool/session
policy, output protocol, and lifecycle probes must pass.
For v2, every primary retry and the one-shot backup repeats adapter qualification
and qualification-to-spawn executable identity checks. At most one model process
is active; cancellation, non-retryable failure, or unconfirmed cleanup prevents
later launches.

The runner uses `shell: false`, fixed allowlisted argv/environment, stdin-only
prompt delivery, fatal UTF-8 decoding, bounded streams/results, and one
monotonic deadline. POSIX detached process groups receive TERM, then KILL if
needed, and descendants are reaped. The workspace is empty, owner-only, outside
the repository, checked against symlink/identity changes, and removed after
child termination.

## 6. Advisor supervision and command projections

A final standalone `--advice` token requests explicit checkpoint counsel for the
bootstrap, code, cook, and fix workflows. It is case-sensitive, whitespace-delimited,
standalone, final (trailing whitespace allowed), and duplicate flags reject. Quoted,
embedded, suffixed, differently-cased, or non-final forms remain ordinary task text.
The workflow preserves one final `--advice` token through <code>WORK_ARGUMENTS</code> handoffs,
or no mode token in default mode; it never recreates `@advisor`. Only an outer
<code>ADVICE_READY</code> envelope completes the gate.

The inline advice workflow is a separate main-session feature. It interviews the
user and writes its own report; it does not use checkpoint routing policy or act as
an alternate controller path. Copilot, Pi, Gemini, and Codex projections may expose
an inline capability but do not gain controller relay authority.

### Documented command naming convention

Documentation and target-facing examples use a literal `cmd` prefix for every slash
command/resource name, including canonical `.claude` resources:

- `/cmd-code`, `/cmd-cook`, `/cmd-fix`, and `/cmd-advise` are the documented root forms.
- OMP nested names flatten path separators to `__`, for example `/cmd-fix__hard`.
- Copilot projects the same resource as the user-invocable skill
  `/evcrate-cmd-fix-hard` and passes raw arguments through `$ARGUMENTS`.

This is the documentation/target convention for this cutover. The current canonical
scanner derives names from paths and the TypeScript parser accepts bare operational
actions; those enforcement gaps remain a follow-up. This documentation change does
not rename `.claude` source files or change command implementation. The generated
`evcrate/command-name-map.json` is authoritative for OMP and Copilot translation;
do not invent a second alias. Shell commands such as `npm`, `node`, `python3`, `cp`,
and `export` are executable shell syntax, not slash command-resource names.

## 7. Verification and support boundary

Automated contracts cover strict policy/checkpoint parsing, fixed argv, sanitized
environment, isolated cwd, output lifecycle, timeout/cancellation, descendant
cleanup, workspace removal, envelope immutability, stale-hash blocking, atomic
recovery, and selected-target publication. These contracts do not authenticate a
vendor CLI.

Linux x64 is the currently qualified operator boundary for live installed-CLI
checks and process-group behavior. Repeat bounded, non-sensitive qualification after
each installed CLI upgrade. Windows installer/runtime validation, npm publication,
operator rollout, and a live vendor qualification result are separate gates and are
not implied by deterministic repository contracts.

The current Hook Materialization Scope Distribution milestone (Phases 01–09) is
verified by the 512/512 full-suite result, exact 29-file closure, `distribute:check`,
and installed Linux release fixtures. These deterministic checks do not qualify
live vendors or authorize production HOME publication.

## 8. Historical advisor mentoring upgrade (Phases 01–10; deterministic Phase 10 acceptance)

Design authority: [September 7 assessment](../plans/reports/brainstorm-260907-1004-advisor-mode-edge-case-assessment.md).
Implementation plan: [advisor mentoring, recovery, and audit](../plans/260907-1208-advisor-mentoring-recovery-audit/plan.md).
Phases 01–04 froze policy/checkpoint/result/controller contracts, completed
policy migration, delivered wait/cancellation/cleanup guarantees, qualified
adapters, and integrated the canonical mentor brief plus structured v2 result
parsing. Phase 05 delivered bounded primary retry (up to four launches) and
one-shot backup orchestration. Phase 06 delivered durable task state, process-identity
locking, Git/baseline identity tracking, three-cycle correction escalation, and
observed human continuation. Phase 07 delivered sanitized execution/outcome history,
CAS terminal settlement, linked outcome recording, and bounded offline review tools.
Phase 08 completed canonical workflow integration across all 16 command consumers,
honest seven-target capability declarations, real CLI lifecycle transitions, and
user-baseline preservation. Phase 09 generates and stages all seven target projections,
synchronizes build manifests and registry, establishes 29-file controller closure parity
across runtime and installers, proves disposable HOME preservation and recovery, and
delivers the operator cutover runbook.
Phase 10 deterministic acceptance is complete: 272/272 tests, 29/29 controller
closure files, and a 9/9 sanitized mentoring baseline. Live vendor qualification
and production HOME publication remain operator-gated.

Phase 08 evidence is 279/279 tests passed; Lead Mentor approval 10/10; user approved.
Phase 09 evidence is complete controller inventory/brief closure across all runtime
modules and installers, 24/24 adapter projection tests, 7/7 cutover tests, 11/11
publication recovery tests, 15/15 installer tests, 5/5 private unpack rollout tests,
and passing `npm run distribute:check` and `npm run release:check`. The frozen boundary
keeps one managed CommonJS controller, vendor-owned credentials, canonical resources,
and TypeScript settings/publication. The runtime brief is authored once in the
canonical `.claude` skill, generated through `generate-runtime-brief.mjs` into the
29-file controller closure, and carried by build identity/digest. V2 checkpoint data
is bounded and quoted; paths are metadata only. Advice is non-binding, and human
approval plus the main workflow retains mutation authority.

Generation/publication does not establish live tool-enforcement capability.
This remains cooperative oversight of trusted CLIs, not hostile-process
containment or a guarantee against semantic bugs.

### 8.1 Sanitized audit history, outcomes, and offline review (Phase 07)

Phase 07 implements structured, sanitized local execution history and outcome
tracking with safe CLI inspection and retention tools:

1. **Storage layout & boundaries**:
   Stored at `$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
   with owner-only permissions (`0o700` directories, `0o600` files). Project root,
   HOME, and intermediate directories are validated against symlink swaps and
   insecure world-writable permissions using `/proc/self/fd` directory pinning.

2. **Execution & outcome snapshots**:
   - `execution.json` (max 128 KiB): records initial started snapshot before model
     launch, attempt summaries, terminal status (<code>ADVICE_READY</code> or <code>FAILED</code>),
     sanitized result or error, route receipt, and timestamps. Terminal writes
     use compare-and-set (CAS) against started records to prevent rewrite races.
   - `outcome.json` (max 64 KiB): records linked executor disposition, actual
     diff revision, validation command reference, outcome classification
     (`resolved`, `unresolved`, `regressed`, `unknown`), and correction cycle.

3. **Retention, quota, and audit degradation**:
   - Defaults: 30 days retention and 100 MiB total quota (configured via policy
     `history: { retention_days, max_bytes }`).
   - Active records (`status: 'started'`) are strictly protected from pruning.
   - If history storage is degraded, read-only, or quota is exhausted by active
     records, the controller visibly sets `audit_status: 'degraded'`. History
     write failures never fail the controller or trigger model retries.

4. **Managed CLI tools**:
   - `evcrate-advisor history list`: metadata-only pagination with project, task,
     and status filters.
   - `evcrate-advisor history show`: safe display of execution and outcome
     records with ANSI and control-code sanitization.
   - `evcrate-advisor history export`: exports sanitized history to an explicit,
     non-existing destination with redaction review.
   - `evcrate-advisor history prune`: dry-run preview and apply modes for
     pruning expired terminal records and enforcing quota.

5. **Offline human review workflow**:
   - Operators select sanitized cases using `history list` and `history show`.
   - Reviewers categorize outcomes into: (a) missing evidence, (b) incorrect advice,
     (c) executor disregard, or (d) infrastructure/network failures.
   - Prompt versions and model receipts are compared manually. Automatic prompt
     rewriting or automated training on raw history logs is prohibited.

Verification: the targeted Phase 07 history suites pass 19/19 and the full
advisor-controller suite passes 204/204. The Phase Lead/Senior Mentor review
resolved all seven final implementation items and approved Phase 07
unconditionally at 10/10. See the [QA evidence report](../plans/reports/tester-260908-1344-phase07-final-verification.md).
### 8.2 Historical generated projections, staged cutover, and operator runbook (advisor milestone Phase 09)

Phase 09 unifies projection generation, release packaging, standalone installers, and
atomic publication into a verified, staged cutover without performing premature HOME rollout:

1. **Exact 29-file controller closure parity**:
   The canonical advisor controller closure comprises exactly 29 CommonJS files authored
   under `.evcrate/source/.evcrate/bin/`. Controller closure digests and file inventories
   are strictly synchronized across:
   - `scripts/generate-controller-inventory.mjs` and `src/manifests/controller-inventory.generated.ts`
   - `src/manifests/controller.ts` (source closure validation and hash generation)
   - `install.sh` and `install.ps1` (standalone unpack installer verification)
   - `scripts/release/runtime-closure.cjs` and `scripts/release/pack-inventory.cjs`
   Every file requires only literal relative CommonJS modules or Node.js built-ins, with
   zero runtime dependency on `dist/` or external npm modules.

2. **All-seven target projection synchronization**:
   All seven targets (`claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, `copilot`)
   are projected directly from canonical `.claude/` sources via `npm run distribute:build`
   and verified byte-for-byte via `npm run distribute:check`. Cryptographic SHA-256 tree
   hashes in `.evcrate/build-manifest-*.json` and the schema-1 resource records in
   `.evcrate/registry.json` are synchronized via `npm run generate:all`.

3. **Release packaging and installer verification**:
   Standalone tar.gz/zip packaging and unshare network-isolated installation verify:
   - Archive SHA-256 and sidecar integrity matching `evcrate-v<ver>.release.json` metadata.
   - Controller closure digest verification before writing destination files.
   - Clean-new and whole-old-backup mutable-state semantics on upgrades (`<version>-<hash>-<gen>`).
   - Idempotent repair, rollback to prior snapshot, and clean uninstall.
   - Preservation of user-owned `$HOME/.evcrate/advisor-routing.json`, task state, and history.

4. **Publication isolation, state root, and crash recovery**:
Publication is a scope-aware, journaled ordered-rename transaction on the
destination volume, not a single whole-filesystem atomic swap:
   - **Schema-2 state roots**:
     - HOME publication state: `$HOME/.evcrate/publication/` (with active transaction directory `$HOME/.evcrate/publication/release-<releaseId>/`).
     - Project publication state: `<project-root>/.evcrate-publish-state/` (isolated per canonical project identity).
   - **Pre-publication dry-run**: `evcrate publish --dry-run [--scope home|project] [--project-root <dir>] --json` reports authorized changes and binding order (`.evcrate/bin` then target bindings).
   - **Atomic apply**: `evcrate publish --apply [--scope home|project] [--project-root <dir>] --json`:
     - In `home` scope: stages complete outputs, records each rename, and promotes controller and target files under a single HOME lock with backups under `$HOME/.evcrate/publication/release-<releaseId>/backups/`.
     - In `project` scope: two-phase transaction. Commits shared controller to `$HOME/.evcrate/bin` first under HOME lock, then locks project root (HOME lock held, never reversed) and applies harness projections to `<project-root>`.
   - **External modification protection**: If an unmanaged or external modification occurs on a destination path, `publishApply` detects **CAS_CONFLICT**, leaves the external file untouched, and stops with a retained journal; recovery fails closed until the path is reconciled.
   - **Interrupted transaction recovery (`evcrate recover [--scope home|project] [--project-root <dir>] --json`)**:
     - `publishApply` writes an initial release marker with status `promoting`. Both uncommitted statuses (`staged` or `promoting`) use rollback recovery when valid, restoring all promoted files to their pre-transaction state using transaction backups (`action: "rolled-back"`).
     - If promotion completed but a crash occurred during cleanup (journal status `committed`), recovery finalizes the release and purges unretained backups (`action: "finalized"`).
     - If no interrupted transaction exists, recovery is a no-op (`action: "none"`). Recovery does not roll back a completed release.
     - **Partial failures in project scope**: If project harness application fails after shared commit, project workspace rollback is attempted. If successful, result is `'partial'` with `PUBLICATION_FAILED` (exit 5). If rollback fails, the journal is preserved (`ROLLBACK_FAILED`, exit 5). Shared commit is never rolled back or compensated.
     - **Post-first-promotion CAS conflict**: If an external change occurs after partial promotion has begun, `publishApply` fails with **CAS_CONFLICT**, leaving the journal in `promoting` state. An immediate `evcrate recover` will fail closed with **RECOVERY_FAILED** because the current external file cannot be matched to the pre-transaction snapshot. The operator must remain paused, inspect the conflicting path, decide whether to preserve or revert the external change, resolve the collision, and then run `evcrate recover` to restore a coherent state.
5. **Operator cutover, quiescence, and rollback runbook**:
   - **Pre-cutover validation**: Execute `npm run build`, `npm run distribute:check`, `npm run release:check`, and `npm test` locally. Confirm zero test failures and clean git status.
   - **Consultation quiescence and admission pause**:
     - Suspend new consultations before starting upgrade.
     - Process table verification: verify no active advisor processes are executing (`pgrep -fa evcrate-advisor`).
     - Task-state inspection: durable task runs operate independently from deployments. Because `state get` hashes its actual working directory into `projectId`, operators must execute inspection from the original task project root as `cwd` and original `HOME`:
       ```bash
       evcrate-advisor state get <<'JSON'
       {
         "protocol": "evcrate-advisor-state",
         "version": 1,
         "operation": "get",
         "task_run_id": "<task-run-id>",
         "operation_id": null,
         "expected_revision": null,
         "payload": {}
       }
       JSON
       ```
       Verify the result reports **STATE_READY** before interpreting task details. Verify `pending_process_status` is `null`, `"never-started"`, or `"dead"`. Explicitly block deployment if `pending_process_status` is `"live"` or `"unknown"` (or if any lookup, validation, or process inspection error occurs), resolving the uncertainty before continuing. Never force-complete or mutate durable tasks merely to deploy. Keep admission paused across all harnesses throughout cutover and recovery.
   - **Standalone installer upgrade**: Execute `./install.sh install` (Linux) or `.\install.ps1 install` (Windows). This installs the new snapshot under `<data-dir>/snapshots/<version>-<hash>-<gen>` and points `<data-dir>/current` and the launcher to it.
   - **Policy migration workflow**:
     - Policy remains strictly user-owned at `$HOME/.evcrate/advisor-routing.json`.
    - Step 1 (Exclusive non-clobbering backup): Before modifying policy, create an exclusive, owner-only backup using the `wx` flag (failing if the destination file or symlink exists):
       ```bash
       node -e 'const fs = require("node:fs"); fs.writeFileSync(process.env.HOME + "/.evcrate/advisor-routing.json.pre-v2", fs.readFileSync(process.env.HOME + "/.evcrate/advisor-routing.json"), { flag: "wx", mode: 0o600 });'
       ```
       If the destination exists, the command fails with **EEXIST**, preventing silent overwrites or rotation of a prior verified backup.
     - Step 2 (Inspect current revision): Run `evcrate advisor settings get --json` to inspect current policy and retrieve its `revision` and `mode` objects.
     - Step 3 (Preview): Construct a preview request file with schema `evcrate-advisor-settings`:
       ```json
       {
         "protocol": "evcrate-advisor-settings",
         "protocolVersion": 1,
         "requestId": "00000000-0000-4000-8000-000000000001",
         "operation": "preview",
         "payload": {
           "currentRevision": { "kind": "present", "identity": "<identity-from-get>" },
           "destination": "<home>/.evcrate/advisor-routing.json",
           "mode": { "kind": "existing", "mode": 384 },
           "policy": {
             "version": 2,
             "advisor": {
               "primary": { "backend": "codex", "model": "gpt-5.6-sol", "effort": "high" },
               "backup": { "backend": "omp", "model": "gpt-6-astra", "effort": "high" }
             },
             "wait": { "mode": "until_terminal", "warn_after_ms": 120000, "warn_every_ms": 300000 },
             "history": { "retention_days": 30, "max_bytes": 104857600 }
           }
         }
       }
       ```
       Note: V2 routes require distinct `primary` and `backup` target objects (`backend`, `model`, `effort`); `timeout_ms` is retired in V2 routes in favor of `wait` policy (`mode: "until_terminal"`, `warn_after_ms`, `warn_every_ms`). Run `evcrate advisor settings preview --json --request-file <preview-request.json>` and extract the returned opaque `token`.
     - Step 4 (Apply): Construct an apply request file with the returned preview token and current revision object:
       ```json
       {
         "protocol": "evcrate-advisor-settings",
         "protocolVersion": 1,
         "requestId": "00000000-0000-4000-8000-000000000002",
         "operation": "apply",
         "payload": {
           "token": "<preview-token-from-preview-response>",
           "currentRevision": { "kind": "present", "identity": "<identity-from-get>" }
         }
       }
       ```
       Run `evcrate advisor settings apply --json --request-file <apply-request.json>` to atomically commit. The transaction uses temporary `.advisor-settings-backup-*` files and cleans them up upon success.
     - Note: V1 policy remains operational via direct compatibility checkpoints; migration is an explicit operator choice. Credentials are never written to policy.
   - **Harness publication**: Run `evcrate publish --dry-run [--scope home|project] [--project-root <dir>] --json` to preview managed target updates; when authorized, run `evcrate publish --apply [--scope home|project] [--project-root <dir>] --json` to promote controller and projections.
   - **Rollback execution runbook**:
     - **Interrupted publication recovery**: If a publication transaction is interrupted mid-promotion, run `evcrate recover --scope <home|project> [--project-root <dir>] --json` to roll back staged changes using publication backups.
     - **Interrupted settings recovery**: `evcrate recover` is strictly for publication journals. If an advisor-settings transaction is interrupted, run `evcrate advisor settings get --json` using the same state-root configuration (by default `$HOME/.local/state/evcrate/advisor-settings-journal.json`, or pass explicit `--state-home`). This automatically detects the journal under `context.stateRoot`, finalizes or restores the policy, and removes the journal. Verify successful recovery and journal removal before continuing.
     - **Completed publication release rollback**: After a publication transaction has committed, `evcrate recover` is a no-op (`action: "none"`). To roll back a completed publication release to a prior version:
       1. Roll back the installed package snapshot: `./install.sh rollback <prior-snapshot>` (or `.\install.ps1 rollback <prior-snapshot>`), which repoints `<data-dir>/current` and the launcher to the prior generation.
       2. From that restored package snapshot, run `evcrate publish --apply --scope <home|project> [--project-root <dir>] --json` to re-publish the prior generation's matching controller and projections.
     - **Policy rollback**:
       The V2 settings API strictly requires `version: 2` and rejects V1 policy writes. To roll back from V2 policy to V1 policy:
       1. Pause consultations across harnesses.
       2. Restore the pre-migration V1 backup file manually:
          `cp "$HOME/.evcrate/advisor-routing.json.pre-v2" "$HOME/.evcrate/advisor-routing.json"`
          `chmod 0600 "$HOME/.evcrate/advisor-routing.json"`
       3. Resume consultations.
## Related documents

- [Project overview and PDR](./project-overview-pdr.md)
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project roadmap](./project-roadmap.md)
- [Project changelog](./project-changelog.md)
- [Pi-native migration](./pi-native-migration.md)
