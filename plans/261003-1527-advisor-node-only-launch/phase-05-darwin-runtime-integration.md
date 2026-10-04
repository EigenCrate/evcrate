# Phase 05 — Darwin runtime integration

## Context Links
- [Architecture contract](architecture-contract.md), [Darwin runtime contract](darwin-runtime-contract.md), [Phase 04 native build](phase-04-darwin-native-build.md).
- [Storage integration research](research/macos-storage-design.md#runtime-integration-and-durability), [process/console/workspace research](research/macos-process-design.md#identitystatus-semantics-and-recovery).
- [Acceptance matrix](acceptance-matrix.md): D03/D04/D05; D06 other-host isolation and N11/N13/N15 regression contribution.
- Repository authorities: [state I/O](../../.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs), [history store](../../.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs), [controller](../../.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs), [package commands](../../package.json).

## Overview
- Date: 2026-10-03. Priority: P1. Implementation: **complete**. Review: **complete (Score: 6.5/10 — 3 critical defects identified)**.
- Dependency: Phase 04 accepted real arm64/x64 binaries, reviewed SDK process API/layout and loader/export contract. Missing helper or failed build blocks entry/completion; removing guards is not a deliverable.
- Integrate actual state, baseline, history, export, prune, process identity and isolated workspace behavior with pinned Darwin capabilities. Keep Linux/Windows algorithms, schemas and provider policy unchanged.
- All gates below are future parent implementation gates, not observed results. Darwin runtime tests, addon loading probes, controller/provider execution and macOS test CI remain explicitly prohibited.

## Key Insights
- Exact existing functions are `openTask`, `rootChain`, `captureFile`, `openHistoryRoot`, `openConsultationDir`; native `openRoot` is the new bridge export, not an existing history-store symbol.
- Logical `base/path/projectBase/taskBase` strings are display metadata on Darwin. Never let them become `/proc`/`/dev/fd` paths or unchecked Node filesystem mutation arguments.
- `stateLocation`, `historyContext` and `controller.cjs` currently derive project identity independently. Darwin canonical project bytes must converge before hashing, including controller's audit record IDs.
- Baseline final observation/rehash and history query reads after scanner closure are independent safety boundaries; a safe initial read is insufficient.
- State and history recovery algorithms differ intentionally. State blocks every existing recovery guard; history may reap a proven-dead guard. Do not unify them.

## Requirements
- Dispatch Darwin explicitly before generic POSIX/Linux code; unsupported platforms keep existing rejection. No weakening of nofollow, nlink1, ancestor identity, evidence freshness, lock ownership or uncertain cleanup.
- Every Darwin managed filesystem inspect/read/create/replace/delete/enumerate/sync/recheck operation uses the Phase 04 bridge. No logical-path mutation, process-wide chdir, symlink blanket acceptance or `/proc` fall-through.
- Preserve state 64KiB and lock 1KiB limits; baseline 32 paths, 16MiB/file, 64MiB total, 48KiB record; history existing record/count/quota/redaction bounds. Keep existing digest/ordering/scope/replay/ledger/pending schemas.
- Required self-identity must be non-null before new state/history/recovery lock writes or pending-consultation persistence. Status uncertainty is unknown, never permission/TTL/kill-zero authorization to reap.
- Canonical `/var` and `/tmp` handling uses only Phase 04 exact verified aliases. Explicit invalid/empty HOME fails; no new POSIX fallback or general file-owner/private-mode requirement.
- Parent runs Linux behavioral regressions once after all edits land plus exhaustive static Darwin review. Linux fixtures/static review do not qualify libproc/SDK behavior, native filesystem, terminal/group or addon loading on Darwin.

## Architecture
### Context and descriptor lifetime
- Use the single `darwin-platform.cjs` adapter and `openRoot` canonicalizer for project, HOME, temp roots and export parents. Retain validated canonical strings and BigInt identity snapshots, not fd-path strings.
- Location/context construction must not leak descriptors when preflight/human observation/validation throws before a transaction. Perform construction-only validation with temporary pins closed in finally; operation entry reopens from `/`, verifies recorded identities, then retains the operation's full capability chain until completion. Never treat that reopen as permission to accept changed identity.
- `openTask/openHistoryRoot/openConsultationDir` return internal Darwin capabilities with deterministic close ownership, including project/task parent capabilities needed for metadata/prune. Extend internal callback/hook arguments only as needed; public wire objects remain unchanged.
- Within an operation, parent capabilities outlive all child reads/commits/rechecks. Close child-to-parent in finally on success, missing branch, rejection, cancellation and partial acquisition. `list` owns its iterator separately. No raw fd closure in prune plus a second context close.
- State `LOCATIONS` stores validation metadata; no long-lived unowned open fd. Workspace's frozen public object may retain native ownership in a private map until controller cleanup finally; never serialize a capability.

### Process identity and locks
- `state-io.cjs:processIdentity` dispatches to report-named `getDarwinProcessIdentity`; `processStatus` first validates existing exact `{pid,start}`, then calls `checkDarwinProcessStatus` before Linux proc/kill-zero logic. `proc` remains Linux-only.
- `processSnapshot` valid V0 result supplies exact uint64 monotonic-start decimal, at most 20 digits; existing wire validator remains 1–32 digits. Missing/different valid token => dead; matching token => conservatively live, including zombie until reaped. Malformed/null, permission/API/invalid/unknown => unknown. No signaling, BSD-status second lookup, wall-clock/PID-only fallback or exact-incarnation claim.
- Failed self observation/load gives null start for conservative identity observation, but `acquire` rejects before `writeExclusive` (`STATE_IO_FAILED`); `acquireHistoryLock` rejects before writes (`AUDIT_DEGRADED`). Apply the same requirement before recovery guards and `task-state.cjs:claimCheckpoint` pending writes.
- State retains exclusive token lock, serialized reaper, stat/token/dead-owner recheck, no-TTL guard blocking and verified release. History retains its distinct recovery behavior/stat checks. Existing uncertain/null-start persisted records remain fail-closed.
- Keep `humanDecision/preflightHumanDecision/executeStateRequest/attachControllerResult` pending ownership/recovery semantics; no schema migration or silently authorized replay.

### State and baseline
- `stateLocation` canonicalizes project/HOME, hashes canonical project UTF-8 once, verifies managed existing chain and stores validated metadata. `openTask` recreates/verifies operation pins and native directory children.
- `inspect/readFile/writeExclusive/removeOwned/lockRecord/acquire/transactState` need explicit Darwin capability+leaf dispatch. Existing shared validators/JSON/callback semantics stay reusable; do not use a string as a disguised capability.
- Transaction: verify pins, require self token, acquire lock, bounded previous read, callback validation, random same-parent temp `writeExclusive`, native `commit` with null or previous `{stat,bytes}`, verified cleanup and release. `change.state=null` stays read-only apart from lock lifecycle. Conflict maps to `STATE_CONFLICT`; malformed input and uncertain I/O preserve existing errors.
- `state-baseline.cjs:rootChain/captureFile/captureBaseline/rehashFile` use pinned Darwin parents and reusable 64KiB hashing Buffer via `readInto`. Compare initial/opened/final handle+entry stats; no plain logical-path rehash.
- Retain each observation's last-existing parent and remaining components for missing paths; after Git observations rewalk nofollow to prove continued absence. New/replaced/symlinked intermediate entries make evidence stale/unsafe, not a harmless missing file.
- Keep Git before/after records/environment/command policy. `repository` inspects `.git` markers through verified Darwin directory capabilities; retain marker type/nlink checks. Git remains the existing subprocess, not a native filesystem fallback or new snapshot guarantee.
- Close baseline roots/observations in finally even on empty selection, quota overflow, Git failure or `STALE_EVIDENCE_REVISION`. `assertBaselineFresh` uses the same capture path and record comparisons.

### History, queries, export and prune
- `historyContext` uses the same canonical project/HOME identity; `openHistoryRoot/openConsultationDir` native-traverse each managed component. `acquireHistoryLock/withHistoryLock` use capabilities and existing history recovery rules.
- `ensureProjectMetadata/recordStartedExecution/recordOutcome` preserve no-replace creation. `updateStartedAttempts/recordTerminalExecution` preserve expected-stat+bytes replacement under existing lock. All paths include directory/file sync, idempotence, scope, quotas and error behavior; project metadata retains its intentional best-effort semantics only.
- `scanProjectRecords/calculateTotalHistoryBytes` pin project/task/consultation before bounded enumeration/stat/read; count temporary/stray file bytes as existing quotas do. Close all scan pins before returning logical record metadata.
- `history-query.cjs:listHistory/getHistoryEntry/getHistoryMetrics` consume injected safe `readFileFn`. If reading scanner-returned paths after scanner closure, independently reopen canonical parent with `openRoot` and file with `openRegular`, verify/read/recheck and close. Pinned-context reads use their live directory directly; no stale capabilities.
- `exportHistory` keeps full-record collection, filters/project scope, redaction, skipped records and dry-run behavior. Canonicalize/pin destination parent; validate leaf separately, never realpath nonexistent output. Apply uses native exclusive create+file/parent sync; existing destination is never overwritten; uncertainty maps to existing export error.
- `history-prune.cjs:pruneOldestTerminalRecords/ensureHistoryQuota/pruneHistory` reopens consultation pins under current lock, rechecks record status/ownership, preserves started records and stray files. Remove verified leaves with `removeOwned`, then only empty verified directories through parent capabilities. Count actual successful removals/bytes; failed/sync-uncertain steps cannot inflate success. Preserve current dry-run defaults and retained/active totals.
- Remove Darwin access to raw `fd/taskFd/projectFd` close/rmdir/readdir branches; explicit owned capability close covers every early return/error. Do not change unrelated Linux/Windows pruning algorithms.

### Workspace, controller, process groups and console
- `isolated-workspace.cjs:rootFor/assertRoot/createWorkspace/verifyWorkspace/cleanupWorkspace/safeRemoveTree` add native Darwin branch. Resolve approved temp spelling, choose crypto-random leaf and call descriptor-relative `openDirectory(...,true)`; require immutable `created=true` provenance from actual successful mkdirat. Reject EEXIST/created=false without adopting or deleting that foreign directory. Verify root+new workspace identity and initial emptiness; retain operation pins.
- Native recursive removal uses bounded lists, stat/chain verification, same-device checks, safe child directory traversal and verified regular leaf removal. Refuse symlink, hardlinked/unsupported type, cross-device or replaced entries; `CLEANUP_UNCONFIRMED` on uncertainty. Final workspace removal uses pinned parent and expected identity, never Node path recursion.
- `controller.cjs` canonicalizes Darwin cwd/projectId and trusted HOME before policy/audit context; state/history/baseline receive the same canonical spelling. Keep actual launch project cwd and existing health diagnostic package-root cwd. Preserve controller's finally cleanup and failure downgrade; ensure retained workspace pins close even when cleanup is unconfirmed.
- `runner.cjs:runInvocation/processGroupAlive/terminateChild/checkProcessCleanup/finishSuccess` stays existing non-Windows POSIX supervision: shell:false, detached backend group, TERM/grace/KILL and settled close/group cleanup. Kill-zero is cleanup occupancy only, not durable lock identity. No new native supervisor/provider retries or hostile descendant containment claim.
- `state-human.cjs:observeTerminalDecision` stays stderr TTY plus `/dev/tty` read/write, current nonce, abort and final fd/stream cleanup. Launcher retains caller terminal; only backend is detached. No redirected JSON/chat/GUI approval fallback. No-TTY/wrong nonce remains `HUMAN_EVENT_REQUIRED`; abort remains `CANCELLED`.

## Related Code Files
Every runtime path below is exact and under the canonical controller source, not generated projections.

| Action | Path(s) | Purpose |
|---|---|---|
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs` | Canonical context, process dispatch, capability state/lock transactions; sole shared-file integration owner. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/state-baseline.cjs` | Both capture/rehash passes, missing-path and Git-marker observation pins. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs` | Context/root/consultation/scanner/metadata/write/lock dispatch and query hooks. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/history-query.cjs` | Safe reopened reads/export parent capabilities; no public schema change. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/history-prune.cjs` | Owned leaf/empty-directory removal, active protection and close ownership. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/isolated-workspace.cjs` | Canonical temp root, pinned create/verify/native recursive cleanup. |
| Modify | `.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs` | Darwin canonical audit identity and workspace lifetime integration only. |
| Verify-only; modify only narrow self-token/error integration | `.evcrate/source/.evcrate/bin/lib/advisor/task-state.cjs` | Pending claim/recovery before persistence, unchanged public lifecycle. |
| Verify-only | `.evcrate/source/.evcrate/bin/lib/advisor/runner.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/state-human.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/windows-platform.cjs` | Existing process/console/Windows algorithm parity. |
| Verify/modify bounded adapter only | `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs` | Phase 04 bridge consumer/error/stat wrappers; no competing edits. |
| Verify-only/generated on any native change | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.c`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/storage.c`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/process.c`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.h`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/artifacts.json`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node`, `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node` | ABI/source-output identity must remain matched; rebuild both if changed. |
| Modify behavior fixtures as needed | `tests/advisor-controller/state-io.test.cjs`, `tests/advisor-controller/storage-safety.test.cjs`, `tests/advisor-controller/task-state.test.cjs`, `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-controller/history-store.test.cjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/history-controller-integration.test.cjs`, `tests/advisor-controller/runner.test.cjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/adapters/phase08-mentoring-integration.test.mjs` | Linux existing invariants; host-independent process decision behavior only where useful. |

## Implementation Steps
1. **Check phase entry receipts.** Accept Phase 04 paired artifact/source/provenance/ABI gate and approved snapshot. Review current callsites and imports; record function-by-function D03/D04/D05 checklist covering every normal, missing, conflict, reaper, cancellation and cleanup path. No native load/probe on macOS.
2. **Freeze shared ownership/interface.** Runtime integration owner alone edits `state-io.cjs` and `darwin-platform.cjs`, integrating canonical metadata/pin lifetimes/process wrappers/state transaction before other units consume them. Process and state workers must not race that file. If native ABI changes are required, return through Phase 04 paired build gate.
3. **Implement state/process first.** Dispatch Darwin before Linux paths; map required-self failure before every lock/recovery/pending write; implement pinned read/write/commit/release. Retain existing Linux/Windows branches and read-only/callback/error behavior. Inspect task-state pending callsites explicitly, including preflight failures before transaction entry.
4. **Parallel disjoint consumers after step 3.** Baseline unit owns `state-baseline.cjs`; history unit owns `history-store.cjs/history-query.cjs/history-prune.cjs`; workspace/controller unit owns `isolated-workspace.cjs/controller.cjs`. Freeze shared capability/stat/read hook semantics first. Each unit completes its own close/error paths and behavioral fixture edits; workers run no builds/tests/lint/formatters. Integration owner resolves cross-unit hooks in one ordered merge, not concurrent state-io edits.
5. **Complete final observations/identity dataflow.** Baseline pins span hashing and Git after-pass; missing observations rewalk safely. History reads after scanner closure re-pin. Controller audit IDs use canonical project bytes identical to state/history. Export parent and temp roots share exact alias policy; arbitrary links never accepted.
6. **Complete cleanup/console review.** Native workspace/prune methods use owned capabilities; controller finally closes pins on every outcome. Review process-group and TTY code without new platform supervisor or consent path. Preserve failure when cleanup or controlling terminal is uncertain. Darwin real console behavior is untested; Linux/Windows actual console gates remain in Phases 03/07.
7. **Parent Linux phase-end regression gate only.** After every edit lands run existing `npm run build`, `npm run test:advisor-controller`, and `npm run test:adapters`. This includes the correctly located integration/lifecycle files above; extend existing behavior coverage for unchanged CAS/locks/limits/baseline/history export/prune/process cleanup/TTY rejection. Do not run a macOS test, force process.platform, add source-string snapshots, or treat mock native observations as Darwin evidence.
8. **Host-independent decision evidence, not native qualification.** Where needed, test bounded adapter decisions using explicit observation inputs: uint64 high-bit/20-digit precision, unchanged exec token, changed token for same PID, conservative matching-token retention regardless of zombie status, missing, unknown/permission/invalid/null/malformed observations and required-self refusal before lock/pending write. Keep existing public 32-digit shape boundary. Static C review covers actual one-call SDK layout, uint64 decimal and 0/-1 errno contract; no byte-count result claim or mock echo substitutes for controller behavior/native execution.
9. **Parent static integration gate.** Review every listed symbol/caller and error/finally branch; prove no reachable Darwin Linux `/proc`/`/dev/fd` or unchecked filesystem fallback. Review capability lifetimes, canonical hash convergence, exact artifact imports/provenance, no runtime compiler/download, unchanged provider/retry/wire schemas and Linux/Windows isolation. Record D03–D06 source findings separately from Linux runtime results.
10. **Prepare Phase 06 handoff.** Report concrete files/paired artifact digests, Linux commands/results and static review coverage. If native source changed, both binaries/provenance must be rebuilt through approved compile-only gate before completion. No production HOME publish, release, commit or macOS support claim.

## Todo List
- [x] Accept real Phase 04 assets/interface; assign shared-file integration owner.
- [x] Integrate canonical contexts, process self-token checks and complete state/lock dispatch.
- [x] Integrate both baseline passes and every history/query/export/prune path.
- [x] Integrate native workspace create/verify/cleanup and canonical controller audit IDs.
- [x] Review existing process-group/console algorithms and all deterministic close/error paths.
- [x] Parent accept Linux regressions/static D03–D06 evidence; hand complete candidate inputs to Phase 06.
- [ ] Remediate Critical 1 (`darwin.list` string[] vs object mismatch in `history-store.cjs` and `isolated-workspace.cjs`).
- [ ] Remediate Critical 2 (`writeExclusive` error code mapping for stale lock recovery in `state-io.cjs`/`history-store.cjs`).
- [ ] Remediate Critical 3 (`openRoot` ancestor file descriptor and heap allocation leak).

## Success Criteria
- Every named Darwin caller uses real Phase 04 capabilities, including final observations, independently reopened queries, prune/export/workspace cleanup and failure paths. No fake pathname descriptor, missing helper or permanently unknown self-identity workaround.
- Identity is exact existing `{pid,start}` with conservative status; required self failures precede lock/pending writes. Guard/replay/history/limits/ownership/cleanup/TTY guarantees unchanged.
- Same canonical project path drives state/baseline/history/controller audit identity; `/var` and `/tmp` exceptions are narrow verified system entries, not arbitrary symlink acceptance.
- Parent's Linux regressions and static review are recorded, both source-bound binaries packaged. Only label allowed: **macOS implementation present, untested/unqualified**. Compilation and Linux fixture success cannot claim native load/runtime/console/filesystem compatibility.

## Risk Assessment
- Descriptor leaks/double closes on early exits or queries after scanner closure: explicit ownership table and finally review; no dangling capability exposure.
- Alias mismatch splits history/state or disables audit: share canonicalizer and check controller projectId dataflow, not just state guard removal.
- Libproc/SDK/filesystem/loader/signing behavior remains unexecuted; unsupported exclusive rename/sync or process snapshot fails closed. Linux regressions cannot resolve this limitation.
- Stat/byte checks followed by rename/unlink remain cooperative same-user guarantees, not hostile atomic CAS; process-group checks are not atomic PID/PGID handles or containment of escaped children.

## Security Considerations
- No public envelope/credential logging, new consent/retry path, TTL or unknown-owner reaping. Preserve redaction, project scope and pending/started retention.
- Reject foreign/closed capabilities, symlink/hardlinked managed files, changed ancestors, cross-device workspace entries and unowned cleanup. Bound native reads/lists and preserve BigInt precision.
- Invalid explicit HOME never redirects writes. No privileged helper, runtime build/download, external invoker or new generic platform framework.

## Next Steps
- Phase 06 regenerates/qualifies the full package and freezes exact Linux-qualified candidate including both Darwin assets; Phase 07 transfers unchanged bytes and tests native Windows.
- Phase 08 final docs wait for those outcomes and retain the macOS no-test distinction. No future macOS runtime test is implicitly authorized by these phases.

## Unresolved Questions
- No additional scope decision; execution entry depends on Phase 04 reviewed source/SDK/layout pins and paired artifacts.
- Actual Darwin filesystem/libproc/SDK/addon loading/TTY/group behavior remains unverified by explicit user decision. Missing future evidence cannot become a pass or a source-only substitute.
