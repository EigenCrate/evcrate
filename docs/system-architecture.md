# System Architecture

**Status:** Current implementation reference; filesystem-policy cutover Phases 01–02 completed 2026-09-27; Hook Materialization Scope Distribution is complete through Phase 09; Windows release qualification is complete through Phase 10 (10/10 phases, 100%; completed 2026-09-15).
**Advisor metrics explorer:** Historical Phases 01–10 completed 2026-09-19; the dated standalone browser/picker evidence remains historical, and its picker/reader source was later removed.
**DamHopper Advisor Plugin:** E00–E04 implementation/package work is complete (E04/G3 qualified 2026-09-22). E05 source cutover is applied; joint G4 qualification/sign-off is unverified, and standalone retirement is not release-authorized. Joint G1 owner-worker and D04/E03 G2 LAN qualifications remain downstream.
**Windows support:** Installer/version qualification remains the only qualified Windows release boundary. Native advisor invocation and packaging are implemented and isolated-smoked, but production Windows advisor runtime remains unqualified.
**Native Windows advisor status:** Readiness repairs 01–04 are complete; Repair Phase 04 verification recorded 20/20 focused tests and 390/390 final required-suite runs, with a 9.0/10 review and no critical findings. Original Phase 03 implementation is in progress at 67% (4/6 checklist entries), not DONE. `ADVICE_READY`, live provider/Pi/OMP, positive attached-console, and explicit approval are unproven; WSL state init/get is only a smoke, not full Linux qualification. State/history owner checks are superseded by the cross-platform trusted-files policy.
**Updated:** 2026-09-28

**Authority:** TypeScript control plane and the canonical advisor controller source

This document is the central authority for distribution, advisor supervision, wire
contracts, isolation, and publication. The [codebase summary](./codebase-summary.md)
provides the source map; the [project overview and PDR](./project-overview-pdr.md)
turns these contracts into requirements.

## 1. System shape

EVCrate is a private npm package (`evcrate`, version `2.3.2`) for building and
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
  diagnostic, advisor-settings, portable advisor-contract, and Phase E00 plugin
  domain-data wire shapes.
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

### Host-native context paths

Invocation context uses a strict host/portable path boundary:

- `safePath` and `resolveSafePath` validate host-native absolute roots. On Windows,
  `validateWindowsPath` accepts drive-rooted paths and emits native separators,
  while rejecting drive-relative, UNC/device, traversal, duplicate, ADS, invalid
  character, trailing dot/space, DOS-device, metadata, and sensitive segments.
- `normalizeRelativePath` remains the authority for relative POSIX metadata in
  manifests, archives, inventories, and receipts; Windows handling does not
  broaden those identities.
- `assertNoSymlinkAncestors` is the shared ancestor guard. It walks from
  `parse(resolve(value)).root` with the host `sep`, stops only at missing
  components, and fails closed for other filesystem errors. `path-resolution.ts`
  reuses it instead of maintaining a private walker.
- Context still resolves before request loading and dispatch; `version --json` has
  no context bypass. Focused context/CLI fixtures derive roots from file URLs,
  and package smoke uses ComSpec to invoke `.cmd` through Windows command dispatch.
  Phase 09 integrated qualification plus Phase 10 support cutover qualify the
  standalone installer lifecycle and clean-install verification across the
  supported Windows matrix; broader Windows runtime equivalence remains excluded.

## 4. Build, hash, and publication

A local build stages canonical resources and selected projections outside the live
roots, validates each projection, and verifies a schema-2 manifest recording source,
adapter, controller, owner, output, and validation data. Resource file roots use a
file-domain hash separate from directory-tree identity; generic `hashFile` remains raw
bytes. A build is current only when validation and expected-file/hash/owner checks match.

Build/check and publication are separate. One neutral verified build snapshot/digest
feeds ordered shared and harness phases for scalar `--scope home|project` (default
`home`). `publication-plan.ts` derives launch intent from published path roles and
shebang bytes, not source mode; mode-only changes are not actions, and new/updated
POSIX launcher writes receive additive execute bits.

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
   - Complete path validation, non-symlink ancestor/kind and containment checks, managed-resource ownership conflict checks, and intra-/cross-target overlap checks before destination reads or mutations.
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
     `projectIdentity` (lowercase SHA-256 over normalized absolute path) and reads
     project harness state under `stateRoot/project-publication/<canonical SHA-256 identity>`.
   - Recovery requires process quiescence and never crosses requested scope boundaries.

Standalone unpack layouts differ by platform: Linux uses
`<data-root>/snapshots/<snapshot>` plus a `<data-root>/current` symlink;
Windows uses `<root>/versions/<snapshot>` plus a `<root>/current.json` pointer
and `<root>/bin/evcrate.cmd`. Publication state is separate from either
installer layout.

The TypeScript engine is authoritative; no root `distribute.py` exists, and stale
Python commands are not primary procedures. Publication and advisor state/history CAS
bind kind, object, and bytes rather than permission or ctime metadata; advisor state
and history also verify bytes and lock identity at final transitions. The Windows
release candidate and publisher are separate; see [PDR FR-15](./project-overview-pdr.md#fr-15-canonical-semantic-release-candidate-and-verify-only-publisher).

### 4.1 Release workflow trust boundary (Phases 07–10)
`.github/workflows/release.yml` implements `release-candidate` →
`windows-qualification` → `publish`.
- The producer is read-only/non-canceling, keeps Ubuntu/Node 24.21.0 gates, uploads
  only for `has_release=true`, and routes bytes by exact `artifact_id`.
- The matrix is `windows-2025` x64, `fail-fast: false`, four PowerShell/Node rows
  without checkout/npm; any non-success blocks publication.
- `publish` is the sole writer after matrix success, checks out the producer SHA,
  copies seven CLI assets, re-verifies receipt/hash/run identity, and runs
  semantic-release in `verify` mode after installing the plugin SDK, building the UI, and building/verifying `dist/advisor-plugin/`.
- GitHub releases also attach `evcrate-advisor-plugin-v<plugin-version>.tar.gz` and
  its `.sha256` sidecar; these remain separate from the exact-seven CLI receipt.
- Phase 09 proved integrated routing and final seven-file byte equality; Phase 10
  completed the bounded documentation/support cutover.

### 4.2 Unprivileged Windows PR smoke (Phase 08)
`.github/workflows/windows-smoke.yml` triggers only `pull_request` and manual dispatch; `contents: read` plus canceling concurrency keep PR execution unprivileged.
- On `windows-2025` x64 with Node `22.19.0`, it runs `npm ci` after pinned checkout/setup-node actions.
- It reads the checked-in version and current 40-hex SHA, builds diagnostic fixture assets with `--allow-fixture-identity`, verifies exact-seven files, and invokes the same smoke harness with explicit `--powershell pwsh.exe`.
- It has no secrets, write scope, upload, semantic-release, privileged follow-up, or release handoff; status is diagnostic only.
- `.releaserc.json` uses exact post-qualification labels `Windows x64 Archive` and `Windows Installer Entrypoint (install.ps1)`; other asset paths/labels and prepare authority remain unchanged.
- `tests/distribution/release-orchestration.test.mjs` covers WRQ-042 (workflow boundary), WRQ-043 (fixture/verify/smoke), and WRQ-044 (labels/preserved config).

The controller build is a separate exact closure rooted at
`.evcrate/source/.evcrate/bin`. Its current 36 production files are:

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
lib/advisor/generated/advisor-contract-runtime.js
lib/advisor/generated/advisor-metrics.js
lib/advisor/generated/canonical-json.js
lib/advisor/generated/json.js
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
lib/advisor/windows-native.cs
lib/advisor/windows-native.ps1
lib/advisor/windows-platform.cjs
```

`runtime-brief.generated.cjs` is generated by
`scripts/generate-runtime-brief.mjs` from the canonical
`.claude/skills/advisor-strategy/references/brief-contract.md`. The artifact
contains the instructions, SHA-256 digest, and `evcrate-advisor-v2-*` build
identity; it is part of the closure and is not hand-edited.

The controller closure permits only regular, non-symlink files; `evcrate-advisor` is
checked for its canonical Node shebang. Closure hashes cover file bytes, not
permission modes, and reject missing, extra, stale, or mismatched entries. Linux
`install.sh` grants mandatory CLI/advisor roles execute bits regardless of archive
mode and runs the staged CLI directly; required chmod failure aborts installation.

Native Windows advisor Phase 02 synchronizes the `install.sh` and `install.ps1` inventories at exactly 36 code-point-sorted paths; manifests verify exact count/hash parity and reject viewer/external-package assets.
Phase 03 is in progress at 67% (4/6 implementation checklist entries), not DONE: PowerShell 5.1 uses explicit `HOME`, then `USERPROFILE`/platform profile fallback, invokes Node with the absolute HOME controller, and streams BOM-free UTF-8 stdin; the existing Linux/POSIX caller is unchanged.
Isolated `npm pack`/install and HOME-publication smoke verified all 36 closure hashes and left routing policy unchanged; PowerShell 5.1 observed Unicode `STATE_READY`. The separate standalone install/publication flow remains unverified. WSL Ubuntu 22.04 on ext4 passed state init/get only; neither proves `ADVICE_READY`, provider/Pi/OMP, positive attached-console, or full runtime qualification.

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
candidate-backend checks. The policy file is regular and user-managed input.
`$HOME` and `.evcrate` ancestors must be real, path-safe directories; host
permissions and umask are preserved without UID/SID/ACL or exact-mode checks.
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

The standalone CJS validator remains separate from the TypeScript protocol
runtime. They share exact schemas and parity fixtures; CJS cannot import `dist/`
or projected resources. The TypeScript runtime has no `node:*` imports, process
state, HOME access, filesystem access, or crypto dependency.

Phase 01 prepares an exact four-file TypeScript protocol closure boundary:

1. `src/protocol/advisor-contract-runtime.ts` owns portable advisor policy,
   checkpoint, result, receipt, attempt, envelope, and history types/constants
   plus deep-freezing and neutral code/path validators.
2. `src/protocol/advisor-contracts.ts` retains state v1 contracts and re-exports
   the portable runtime for existing state consumers.
3. `src/protocol/advisor-settings.ts` delegates shared policy validators and maps
   runtime violations to the settings <code>SETTINGS_INVALID</code> boundary.
4. `src/protocol/index.ts` exports the runtime alongside the existing protocol
   barrels; `src/index.ts` exposes it transitively.

The Phase 01 four-file TypeScript boundary is source/export preparation only.
Advisor-metrics Phase 02 added the four generated CommonJS modules under `lib/advisor/generated/`; native Windows advisor Phase 02 expands the exact controller closure to 36 files, while the dated 29-file release evidence remains unchanged.

The following wire versions remain frozen:

| Contract | Version | Boundary |
|---|---:|---|
| `advisor-routing.json` policy | 2 | User-owned HOME input; primary/backup, wait, history. |
| `evcrate-advisor-checkpoint` | 2 | Managed caller to controller; identity, task, proposal, evidence, prior. |
| `evcrate-advisor-result` | 2 | Controller-normalized structured counsel. |
| `evcrate-advisor-controller` | 2 | Terminal envelope with attempts and audit status. |
| Settings request/result, journal, preview | 1 | Existing TS transaction transport; policy payload is v2. |
| Task state, execution history, outcome | 1 | Local records follow the cross-platform trusted-files policy; task state remains required gate authority, while history/outcome provide optional rich audit. |

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

#### Phase 02 checkpoint digest and history metrics

The checkpoint digest is a compatibility byte contract, not canonical JSON:
validate the v2 object without reconstruction or key sorting, preserve parsed
property insertion order, UTF-8 encode `JSON.stringify(validatedCheckpoint)`,
then SHA-256 those bytes and emit lowercase hex. The Node adapter uses
`createHash('sha256')`; browser consumers hash the same `TextEncoder` bytes with
Web Crypto. The non-lexicographic golden fixture protects retained history.

`src/protocol/advisor-metrics.ts` is the portable, deterministic kernel. Its
pure API is `normalizeHistoryRecord`, `normalizeHistoryFilter`,
`filterHistoryRecords`, `nearestRankPercentile`, and `calculateHistoryMetrics`;
callers supply `generated_at`, and the kernel performs no filesystem, crypto,
DOM, process, or locale work. It lowercases identities, excludes invalid
execution records, excludes every conflicting duplicate identity with a
`DUPLICATE_IDENTITY` diagnostic, and deep-freezes returned values.

The exact ten-key filter is null/unconstrained, OR-within and AND-across, with
inclusive positive timestamp bounds. Ratios use numerator/denominator/excluded
counts, six-decimal rounding, and `null` for zero denominators. Latency uses
terminal `receipt.elapsed_ms` only and nearest-rank p50/p95; attempt, failure,
and route groups use stored facts and deterministic code-point ordering. Results
carry scan diagnostics, counts, missingness, completeness, and stable limitation
codes so partial or unattested history is not presented as causal evidence.
#### Phase 04 history metrics CLI integration

`evcrate-advisor history metrics` is a read-only, current-project projection of
the retained controller history. The request is one bounded
`evcrate-advisor-history` v1 object with exact keys
`protocol`, `version`, `operation`, `project_id`, `task_run_id`, and `filters`:

```json
{"protocol":"evcrate-advisor-history","version":1,"operation":"metrics","project_id":null,"task_run_id":null,"filters":null}
```

`project_id: null` selects the invocation project; an explicit ID must match it.
An optional `task_run_id` is applied before the shared kernel's exact ten-key
filters. Collection is unlocked and non-atomic, reuses bounded descriptor-safe
history scanning, and never exposes absolute paths or HOME data. Valid execution
records are normalized through the generated metrics runtime; invalid execution
records are excluded with sorted relative-path diagnostics, while missing or
invalid outcomes remain visible as distinct missingness. Scan bytes, accepted and
invalid counts, completeness, and diagnostic suppression are returned.

The result is the standard `evcrate-advisor-history` v1 envelope with
`operation: "metrics"`, `status: "HISTORY_READY"`, metric-definition version,
scope, normalized filters, counts, metrics, missingness, scan facts,
completeness, and limitation codes. It exits zero only for `HISTORY_READY`;
malformed requests remain sanitized `FAILED`/`REQUEST_INVALID` results. The
operation does not claim complete audit coverage, task success, cost, saved
time, or causal effectiveness, and does not alter list/show/export/prune.

#### Historical standalone explorer milestones (Phases 05–10; 2026-09-18–19)

Phase 05 (2026-09-18) recorded explicit-handle history traversal, bounded reads,
shared normalization, and stale retention; Phase 06 added the display-only
evaluation protocol and an 8 MiB standalone file picker. Phase 07 built the
standalone React explorer and E03 reused its shared views in the embedded UI.
Phase 08 recorded a 298.5 kB bundle and an exact-seven asset boundary; Phase 09
recorded 14 Playwright checks and five 10,000-record benchmarks (p95 scan 1,643 ms,
detail 67 ms, cancel 104 ms, zero long tasks above 200 ms); Phase 10 documented
the tested Chromium/Linux scope and metric limits.

Those browser picker/reader sources were later removed from this repository. The
dated milestone records are not current standalone support, current release-asset
verification, or G4 qualification; source removal does not authorize retirement.

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

State files follow the cross-platform trusted-files policy (no UID/SID/ACL/0700/0600 private-mode enforcement; preserving OS permissions/errors, kind/symlink/nlink/identity/path/schema/bounds/CAS/process locks, and human approval). State is strictly validated and bounded to 64 KiB. A 64-entry operation
ledger and 16 human-decision limit fail closed rather than forget replay IDs.
Selected baseline records retain initial user content digests plus relevant Git
dirty/index/rename/deletion metadata; current evidence freshness ignores unrelated
files. Selected exact file paths are bounded to 32 (16 proposed changes), reads
to 16 MiB/file and 64 MiB total. Digests and declared validation identity do not
authenticate executor claims or prove semantic/hunk attribution.

Storage uses descriptor-pinned I/O, atomic fsync writes, and short
process-start/token locks; no lock survives an inference wait. Windows and Linux
state, baseline, and history paths operate under the trusted-files policy while
retaining platform branches and schemas. Advisor filesystem UID/SID/DACL/mode
restrictions were removed; the prior Phase 03/04 follow-up requiring path-threaded
Windows ownership verification is superseded. Unknown process identity remains
preserved for inspection. Optional rich audit is not required state authority.
V1 callers remain outside this v2 state path until the Phase 08 canonical workflow
cutover; no universal mediated-write enforcement is claimed.

### 5.4 Current v1 compatibility and v2 bounded transaction envelopes

`runController` accepts both the v1 compatibility checkpoint and the v2
checkpoint. The v1 compatibility path remains one target and one model attempt.
For v2, Phase 05 runs a managed transaction with up to four sequential primary
launches on transient failures, using cancellable 10/20/30-second backoff. After
four primary failures or a route-local preflight skip, it qualifies and invokes
the configured backup once. Backup failure is terminal; there is no provider or
model substitution, parallel hedge, or local fallback.

The controller generates a correlation UUID, parses the checkpoint, loads policy
once, probes each selected adapter before its launch, creates one empty isolated workspace under the trusted-files policy, and cleans up after each child exits.

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
needed, and descendants are reaped. The workspace is empty, isolated, outside
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

Automated contracts cover strict policy/checkpoint parsing, fixed argv, sanitized environment, isolated cwd, output lifecycle, timeout/cancellation, descendant cleanup, workspace removal, envelope immutability, stale-hash blocking, atomic recovery, and selected-target publication. These contracts do not authenticate a vendor CLI.

Linux x64 remains the qualified boundary for live installed-CLI checks.
Windows release qualification covers only installer lifecycle and `version --json`
on hosted Windows Server 2025 x64 (PowerShell 5.1/7; Node 22.19.0/24.21.0).
Native advisor readiness repairs 01–04 are complete; Phase 04 verification recorded 20/20 focused tests and 390/390 final required-suite runs, with a 9.0/10 independent review and no critical findings. This closes repair verification, not production Windows qualification.
The original Phase 03 implementation is in progress at 67% (4/6 checklist items), remains unaccepted; runtime remains NO-GO pending genuine positive attached-console observation, supported Pi/OMP/provider and Linux qualification, and explicit approval. The separate standalone install/publication flow is unverified. Desktop/signing/policy environments, production publication, and deployment remain separate gates.
The Hook Materialization Scope Distribution milestone's dated proof recorded
512/512 tests, a 29-file closure, `distribute:check`, and installed Linux fixtures;
these do not qualify live vendors or authorize production HOME publication.

### Historical Advisor Metrics Explorer support boundary (Phases 01–10; completed 2026-09-19)

At completion, the standalone explorer's tested boundary was Chromium >=120 on Linux with File System Access; it did not attest POSIX permissions/ownership, complete audit coverage, or causal/cost/saved-time claims. Its picker/reader source has since been removed, so this history does not establish current standalone support or G4.

### Deterministic Windows fixture and predecessor resolver (Phase 04)

Phase 04 (2026-09-14) adds an internal predecessor boundary for Windows candidate and harness phases without altering public support. `buildWindowsTestReleaseSet` builds archive, sidecar, metadata, and `install.ps1` with fixed `FIXTURE_BUILD_TIMESTAMP = 2026-01-01T00:00:00.000Z` for byte-identical fixtures. The resolver fetches non-draft GitHub releases requiring exact asset labels, canonical filenames, and `verifyWindowsAssetSet` validation. Initial qualification uses `bootstrap-fixture` `1.0.0`; once qualification history exists, missing/tampered assets fail closed without older fallback. `predecessor-downloader.mjs` stages and verifies downloads, returning `{kind, version, tag, sourceCommit, files, directory}` for downstream phases.

### Native Windows advisor supervision and console repair

Readiness Repair Phase 02 completed 2026-09-28 (review 9.2/10; 9/9 focused tests and 236/236 controller tests, build, and `release:check` recorded); this is not production Windows qualification. Repair Phase 04 verification completed 2026-09-28 (20/20 focused tests, 390/390 final required-suite runs, 9.0/10 review, zero critical findings); runtime readiness remains NO-GO pending Linux, attached-console, vendor, and approval evidence.

`runner.cjs` routes Windows provider execution through the fixed PowerShell/C# bridge. Native process creation assigns the provider to a kill-on-close Job and captures its creation token from the launch handle. The runner accepts success only after a successful query confirms the Job is empty; unconfirmed cleanup blocks success/retry. Control-channel EOF and cancellation terminate the Job; Windows `taskkill` and teardown PID lookup are removed.
Repair Phase 03 canonicalizes the Windows environment and resolves trusted HOME/project context before policy or executable lookup. Windows aliases are case-insensitive: equal values deduplicate; conflicts fail with `INVOCATION_INVALID`. The canonical environment preserves absent custom-environment `PATH` as omitted and explicit `PATH: ""` as empty; initial route resolution gets no PATH search directories in either case.
The controller freezes a route's physical launch record before provider probes and reuses it for route probes, retries, and generation; diagnostic qualification resolves before its probes and passes the record when available. Runner rechecks the supplied record before launch. It binds the native launcher or Node runtime, optional JS entrypoint/package metadata, file identities, and spawn prefix; changed content at the same path or disappearance fails closed.
Resolution uses fixed backend/package allowlists and verified `package.json` `bin` metadata for supported npm global/local layouts. It checks command binding and package containment, selects native `.exe` or JS targets, and never executes or parses `.cmd`/`.bat` shim contents.

`state-human.cjs` invokes the fixed console observer after state preflight. It reads via verified `CONIN$`/`CONOUT$`, displays bounded decision context and the nonce challenge independently of piped JSON, and reports only `OBSERVED`, cancellation, or failure. State replay/revision checks remain; POSIX process-group and `/dev/tty` paths are unchanged. State/history owner checks remain superseded by the trusted-files policy.

## 8. Historical advisor mentoring and release qualification (Phases 01–10)

This section preserves historical acceptance context; current contracts are
defined in Sections 3–7. The advisor mentoring milestone froze policy, checkpoint,
result, controller, retry, durable-state, history, workflow, and projection
boundaries. Its deterministic Phase 10 acceptance (2026-09-08) recorded 272/272
tests, 29/29 controller-closure files, and a 9/9 sanitized mentoring baseline.
It did not qualify live vendors or authorize production HOME publication.

The separate Windows release milestone completed Phases 01–10 on 2026-09-15.
Phase 09 proved the immutable candidate, four-row native matrix, failure routing,
predecessor transition, rerun boundaries, and final seven-file byte identity.
Phase 10 completed this documentation/support cutover. Windows support remains
limited to the installer/version subset described in Section 7.

### 8.1 Sanitized history and outcome review

Phase 07 history is optional rich audit, not task-state authority:

- Store version-1 `execution.json` (128 KiB) and `outcome.json` (64 KiB) under
  `$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/` (historical requirement; since superseded by the cross-platform trusted-files policy, removing UID/SID/0600 mode restrictions).
- Record a started snapshot before model launch; settle terminal
  `ADVICE_READY`/`FAILED` exactly once with CAS identity and byte checks.
- Link outcomes to task/consultation identity, disposition, evidence revision,
  actual changed paths, validation, result, and correction number.
- Retain 30 days/100 MiB by default; protect active records. Storage failure
  reports `audit_status: "degraded"` without retrying inference or failing usable
  advice.
- `evcrate-advisor history list|show|export|prune` provides bounded, project-scoped
  metadata, sanitized display/export, and dry-run/apply retention cleanup.
- Never retain credentials, hidden reasoning, raw stderr, raw vendor logs, or
  unbounded text. Targeted history evidence passed 19/19; the full advisor
  controller suite passed 204/204.

### 8.2 Generated projections, installers, and publication runbook

Phase 09 synchronized the generated release boundary:

1. **Controller closure at that milestone.** The canonical CommonJS controller had exactly 33
   (`advisor-contract-runtime.js`, `advisor-metrics.js`, `canonical-json.js`,
   and `json.js`). Inventory/hash authorities are synchronized across
   `generate-controller-inventory.mjs`, `src/manifests/controller.ts`, `install.sh`,
   `install.ps1`, and `scripts/release/runtime-closure.cjs`. The runtime brief is
   authored once under `.claude`, generated into the closure, and never
   hand-edited.
2. **Target projections.** `npm run distribute:build` generates all seven targets;
   `npm run distribute:check` verifies byte parity. Build manifests and the schema-1
   registry are synchronized by `npm run generate:all`.
3. **Installer layouts.** Linux installs snapshots under
   `<data-root>/snapshots/<snapshot>` and points `<data-root>/current` at the
   selected snapshot with a symlink. Windows installs under
   `<root>/versions/<snapshot>` and writes `<root>/current.json`; its launcher is
   `<root>/bin/evcrate.cmd`. Both retain prior snapshots for bounded rollback.
4. **Windows assets and lifecycle.** The 2026-09-15 qualification record covered
   `install.ps1`, `evcrate-v<version>-windows-x64.zip`, its `.sha256` sidecar,
   and `evcrate-v<version>.release.json`. `install`, repeat-install, `repair`,
   upgrade, `rollback`, `uninstall`, and `version --json` were exercised only on the
   Section 7 matrix. This historical record does not assert current release-asset
   verification. Runtime `publish`, `health`, and advisor execution are not Windows
   claims.
5. **Publication state.** HOME state is `$HOME/.evcrate/publication/`; project
   state is `stateRoot/project-publication/<canonical SHA-256 identity>`. Project
   publication commits the shared HOME controller first and then project harness
   output. A harness failure rolls back only project work; `PUBLICATION_FAILED` and
   `ROLLBACK_FAILED` are both exit category 5 outcomes.
6. **Recovery.** Recovery requires quiescence, validates contained paths and
   canonical project identity, and reads only the requested scope. `staged`/`promoting`
   journals roll back when snapshots match; `committed` journals finalize cleanup;
   no journal returns `action: "none"`. Recovery never rolls back a completed release.
7. **Operator sequence.** Build/check and dry-run from disposable HOME first; pause
   consultations and inspect pending processes from the original project root; apply
   only after review. For interrupted publication, run matching-scope
   `evcrate recover`. For a completed release rollback, select a prior installer
   snapshot (`./install.sh rollback <snapshot>` or `.\install.ps1 rollback <snapshot>`)
   and then re-publish that generation. Advisor-settings recovery is separate:
   use `evcrate advisor settings get --json` with the same state-root configuration.

The generated trees, controller closure, manifests, registry, publication journals,
and installer state are managed artifacts. User policy, unmanaged HOME/project
files, and vendor credentials remain outside the publication authority.
## 9. DamHopper advisor plugin replacement

**Status:** E00–E04 implementation/package work is complete; E04/G3 was qualified
2026-09-22. E05 source cutover removed standalone picker code, but joint G4
qualification/sign-off is unverified: external Linux owner-runner and separate-LAN
evidence are not present here. E05/G4 is not accepted or complete; standalone
retirement is not release-authorized. Joint G1/G2 qualification remains downstream.
**Plans/evidence:** [E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md),
[UI guide](./advisor-plugin-ui.md), [validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md),
and [review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md).
**E00:** `evcrate-advisor-data` v1 freezes eight reads; G0 permits only
`node:fs`, `node:path`, and `node:crypto` (controller-inventory delta `0`).
**E01:** `provider.cjs` validates/gates E00 methods; binding, snapshot/cursor,
history, policy, and evaluation modules enforce path, kind, symlink, nlink, size, schema, and fingerprint boundaries under the cross-platform trusted-files policy (filesystem UID gates removed).
**E02:** The pinned D00 SDK owns framing and strict UTF-8 JSON-RPC; the worker
bounds contexts, requests, cancellation, safe errors, and deterministic output.
**E03:** Current `AdvisorDataProvider` uses the bounded DamHopper `MessagePort`;
the temporary E03 local picker/reader source was later removed. The version-`1.0.0`
bridge validates eight envelopes and fences session/generation, late replies, and
revocation. The four views are Overview, History/detail, Configuration, and
Evaluations at `/plugins/evcrate.advisor`.
The Vite entry emits `plugin/ui/index.html` with inlined CSS/IIFE and no external
assets, network clients, or picker. E03 recorded 68/68 repository/package tests
on 2026-09-21; this is not host CSP/sandbox, G2/G4 qualification, or current
release-asset verification.

### Cross-project advisor history (Phases 00–05)

- **Phase 00:** Production token issuance requires configured MongoDB; the explicit development/test token path remains. See the [auth prerequisite](../plans/260924-1055-all-project-advisor-history/phase-00-secure-auth-prerequisite.md).
- **Phase 01:** `evcrate-advisor-data` v2 retains v1 schema/behavior and on-disk history v1; query filtering, bounded same-snapshot inventory, owner-safe display metadata, and `ContextScopeKind` / `ContextScopeDescriptor` are frozen.
- **Phase 02 binding:** DamHopper persists `OwnerHistorySource` (`rootPath`, `rootIdentity`, `sourceRevision`, `allAuthenticatedHistoryRead`) on the installation. Admin replacement uses an expected security revision and advances registry/security revisions.
- **Admission:** Valid authenticated actors may use `history-root` without per-account grants only for `history.refresh`, `history.summary`, `history.page`, and `history.detail`. `--no-auth` stays denied; project scope, policy, and evaluation access retain their grant boundaries.
- **Context open:** The API validates the actor epoch and enabled installation, hydrates its process-local source cache from runner state before each open (not at startup), and sends the descriptor's kind, root identity, and source revision. The descriptor does not carry the owner path.
- **Runner verification:** The runner re-reads the persisted installation, checks source capability and descriptor identity/revision, and rejects a missing, symlink, or non-directory root; a non-root Unix runner also checks effective-UID ownership.
- **Revalidation:** The API rechecks actor/epoch and operation on every invoke; the runner rechecks enabled state, source capability, root identity, and revision. Admin source replacement clears the API source cache and revokes contexts; the next open rehydrates from runner state.
- **Phases 03–04:** EVCrate root scanning and safe project-name persistence are paired with same-snapshot project filtering and independent source labels in the UI.
- **Phase 05:** Paired qualification completed 2026-09-24: **273/273 tests passed**, 0 failed/skipped; candidate and distribution packages verified; review approved **9.8/10** with zero critical issues. The direct history-root provider scan accepted **237/237 consultations across 21 projects in 191.48 ms**, with zero diagnostics. It was not a new live DamHopper browser session.
- **Release boundary:** [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md) records the paired-release decision. Qualification is not production deployment or package publication.

## Related documents

- [Project overview and PDR](./project-overview-pdr.md)
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project roadmap](./project-roadmap.md)
- [Project changelog](./project-changelog.md)
- [Embedded advisor plugin UI](./advisor-plugin-ui.md) — current shared UI and historical E03 provider boundary.
