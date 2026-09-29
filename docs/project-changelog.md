# Project Changelog

## Unreleased

**Updated:** 2026-09-29

**Status:** Hook Materialization Scope Distribution complete through Phase 09; Windows release qualification through Phase 10; Advisor Metrics Explorer through Phase 10; DamHopper plugin E00–E04 (G3 qualified); all-project advisor history 6/6 complete; filesystem-policy cutover 2/2 complete; Windows readiness repairs 4/4 complete; Native Windows advisor support Phases 01–04 complete (Phase 04 review approved 9.2/10). Phase 04 passed Windows behavioral/security and lifecycle suites (10/10 each), parity (4/4), and release (34/34); OMP and Codex diagnostics qualified, Claude and Pi remain unverified. Linux suite: 400/400 on WSL ext4; Phase 03 separately observed live OMP `ADVICE_READY`. Workspace-integrated Advisor: 5/10 phases complete (50%; Phase 04 DONE 2026-09-29; review approved 9.5/10); end-to-end rollout and production deployment remain unclaimed. No production HOME publication or Codex/Claude/Pi inference is claimed. Package version: `2.3.2`.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 04

**Status:** Phase 04 DONE (2026-09-29; 100%; review approved 9.5/10); Workspace plan 5/10 phases complete (50%). End-to-end rollout and production deployment remain unclaimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 04](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md)
**Review:** [Code review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md)

- Completed shared Workspace-project/All activity scope, fail-closed history selection, authority/request fencing and revoke clearing, coherent snapshot queries, independent manual refresh, and lazy evaluation reads.
- Scoped proof: 28/28 targeted tests passed; strict TypeScript check and V-E3 delayed-response/call-count smoke passed. Review found no critical issues.
- The broader viewer/plugin run recorded 120 passed and one packaged-artifact checksum/size-delta mismatch, deferred to Phase 08 package regeneration. This phase does not claim end-to-end rollout or production deployment.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 03

**Status:** Phase 03 DONE (2026-09-29; review approved 9.7/10); Workspace plan 4/10 phases complete (40%). End-to-end rollout and production deployment remain unclaimed.  
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 03](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md)  
**Review:** [Cycle 2 code review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md)

- Completed the paired `workspace-advisor-v1` extension across SDK, host, and viewer: authorized context-ready sequencing, trusted workspace-selection updates, and gated UI-intent messages.
- Extracted the shared `usePluginHost`/`PluginHost` lifecycle with owner-change fencing, same-root in-place selection updates, verified assets, and session disposal; `PluginHostPage` remains a thin route wrapper.
- The implementation summary reports 145 test passes across EVCrate and DamHopper suites. Cycle 2 independently verifies all five Cycle 1 must-fix items and records 81 targeted tests passed; one SDK envelope-guard consistency suggestion remains non-blocking.
- Phase 04 and Phase 05 are unblocked. No navigation cutover, end-to-end rollout, or production deployment is claimed.

### 2026-09-29 — test(advisor): qualify Workspace Advisor history scope (Phase 02)

**Status:** Phase 02 DONE; review approved 9.6/10. The Workspace plan is 3/10 phases complete; end-to-end rollout and production deployment remain unclaimed.  
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 02](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md)  
**Evidence:** [Code review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md)

- Root All keeps valid-ID unmapped Project U despite missing registration and label; the fixture expects six discovered directories, seven accepted records, and two malformed/mismatched records accounted as invalid.
- Project-bound null queries do not widen, foreign IDs reject, cursor/query binding holds, and permitted policy/evaluation reads work without a history root. Bounded scan cancellation/deadline and framed dispatch scenarios were qualified.
- Existing production provider/scanner and v1/v2 data contracts did not change; no ID-less adapter or production-history census is claimed. Review records 59 passing test executions and zero failures.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 01

**Status:** Phase 01 DONE (2026-09-29; review approved 9.2/10); 2/10 phases complete (20%).  
**Plan:** [Workspace-integrated Advisor panel](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 01](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md)  
**Evidence:** [Phase 01 implementation and verification record](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md).

- Completed selected-project host admission, canonical trusted identity, per-operation authorization, actual scope/revision descriptor, and revalidation preservation across DamHopper server/API/SDK/host client.
- The phase record reports 102 passed and 0 failed across server integration/authorization, SDK contracts, and UI checks. Review recorded zero critical issues; two non-blocking warnings are tracked for Phase 02.
- Phase 02 (history scope and unmapped records) was next at the Phase 01 checkpoint; it completed later on 2026-09-29 (see the newer entry above). No end-to-end Workspace rollout or production deployment is claimed.

### 2026-09-29 — docs(advisor): close Workspace-integrated Advisor Phase 00

**Status:** Phase 00 DONE (10% at that checkpoint); Phase 01 completion and approval are recorded in the following entry.
**Plan:** [Workspace-integrated Advisor panel](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 00](../plans/260929-1346-advisor-workspace-panel/phase-00-evidence-and-contract-freeze.md)
**Evidence:** [Contract freeze](../plans/260929-1346-advisor-workspace-panel/reports/phase-00-contract-freeze.md) · [Review](../plans/260929-1346-advisor-workspace-panel/reports/code-review-260929-1543-phase-00-evidence-and-contract-freeze.md).

- G0-data, G0-auth and G0-wire are frozen; reviewed EVCrate code and sanitized fixtures support the reported valid-ID unmapped shape within existing v1/v2 contracts, without claiming an exhaustive production-history census.
- Sanitized A/B/U/worktree and invalid-record fixtures are prepared; review reports focused fixture/provider/schema checks passing.
- No application feature rollout, production change or live UI qualification is claimed.

### 2026-09-28 — test(windows): qualify native advisor and protect Linux (Phase 04)

**Status:** Phase 04 DONE (2026-09-28; review approved 9.2/10).  
**Plan:** [Native Windows advisor support](../plans/260926-1522-windows-advisor-support/plan.md) · [Phase 04](../plans/260926-1522-windows-advisor-support/phase-04-qualification.md)  
**Evidence:** [Qualification report](../plans/260926-1522-windows-advisor-support/reports/phase-04-qualification-evidence.md).

- Native Windows behavioral/security regressions passed **10/10** and lifecycle tests **10/10**; advisor parity passed **4/4**, release tests **34/34**, and `release:check` plus `distribute:check` passed.
- The canonical controller diagnostic protocol qualified OMP 18.4.1 and Codex 0.155.1. Claude 2.1.92 remains unverified (`AUTH_UNAVAILABLE`); Pi 0.84.1 remains unverified (`PROCESS_FAILED`). No mock credentials or fallback were used.
- Linux protection was confirmed by the full 400/400 test suite on native ext4 in WSL Ubuntu 22.04. The separate Phase 03 sandbox run observed live OMP inference return `ADVICE_READY`; no Codex, Claude, or Pi inference is claimed.
- Production HOME publication was not performed.

### 2026-09-28 — feat(windows): complete native advisor invocation and package closure (Phase 03)

**Status:** Phase 03 DONE (2026-09-28; review approved 9.0/10). Host invocation and both sandbox publication paths completed; no production HOME was modified.  
**Plan:** [Native Windows advisor support](../plans/260926-1522-windows-advisor-support/plan.md) · [Phase 03](../plans/260926-1522-windows-advisor-support/phase-03-invocation-publication.md)  
**Verification:** Windows build, `distribute:check`, and `release:check` passed; scoped results recorded 357/357, post-fix 20/20, final adapter 9/9, and Windows controller 282/282 serial. Isolated `npm pack`/install and standalone `install.ps1` sandbox publication verified exact 36-file controller closures and hashes; routing policy was unchanged.

- The published controller handled Unicode and special-character input through Windows PowerShell 5.1 and returned `STATE_READY`; Linux/POSIX invocation remained unchanged.
- Full Linux qualification on WSL Ubuntu 22.04 native ext4 passed **400/400** tests. Live Windows OMP inference (`openai-codex/gpt-5.6-sol`) advanced state to revision 4, wrote history, and returned an authentic seven-field `ADVICE_READY` envelope.
- Third-cycle review scored 9.0/10 with no critical findings. Its accepted low warning notes possible PowerShell coercion of wire string `"1"` and unresolved concurrent state-CLI timeout behavior.

### 2026-09-28 — test(advisor): complete Windows advisor readiness verification (Repair Phase 04)

**Status:** Repair Phase 04 verification complete; readiness repairs 4/4 complete. At that checkpoint the original advisor plan had not yet completed native qualification; see the separate Phase 04 record above.
**Plan:** [Readiness plan](../plans/260927-0005-windows-advisor-readiness/plan.md) · [Repair Phase 04](../plans/260927-0005-windows-advisor-readiness/phase-04-verification-readiness.md)  
**Evidence:** [Test report](../plans/reports/testerphase04-260928-0955-verification-readiness.md) · [Review](../plans/reports/code-review-260928-1008-repair-phase-04-readiness.md). Focused verification **20/20**; final required suites **390/390**, 0 failures and 0 skips; independent review **9.0/10**, no critical findings.

- Added `tests/advisor-controller/verification-regressions.test.cjs` for R1–R5 behavior: Job descendant cleanup, trusted-file permission behavior, provider path selection and rejection, no-clobber state creation under interleaving and competing processes, and replacement-workspace preservation.
- Added `tests/advisor-controller/verification-lifecycle.test.cjs` for pinned-file CAS, supervisor failure boundaries, launch-record and environment validation, isolated source CLI V2 lifecycle/history operations, and unattended/piped-console rejection.
- This repair verification did not itself establish external readiness; the subsequent native advisor Phase 04 qualification is recorded above. Production HOME publication remains unclaimed.

### 2026-09-28 — fix(advisor): restore Windows advisor storage and cleanup safety (Repair Phase 01)

**Status:** Phase 01 DONE (2026-09-28; review approved 9.5/10; user approved). 2/4 repair phases complete; Phase 03 (provider launch identity) next.  
**Plan:** [Readiness plan](../plans/260927-0005-windows-advisor-readiness/plan.md) · [Phase 01](../plans/260927-0005-windows-advisor-readiness/phase-01-storage-safety.md)  
**Evidence:** 10/10 storage-safety regressions pass (`tests/advisor-controller/storage-safety.test.cjs`); 223/223 advisor-controller tests pass; 112/112 protocol, primitives, and scopes tests pass; release check verified.

- **C1 containment (no-replace publication):** Removed catch-all `linkSync` to `renameSync` fallback in `state-io.cjs` and `history-store.cjs`. On `EEXIST`, transactions fail closed with `STATE_CONFLICT` / `AUDIT_DEGRADED` without clobbering competing destinations (R4 closed).
- **C2 containment (workspace cleanup object identity):** Captured `dev` and `ino` identity on workspace and root during creation in `isolated-workspace.cjs`. Cleanup validates ancestor root *before* inspecting workspace path, verifies object identity, and fails closed (`CLEANUP_UNCONFIRMED`) on any junction/symlink or device mismatch without deleting outside trees (R5 closed).
- **H3 native pinned operations:** Implemented narrow Win32 handle-pinned operations in `windows-native.cs`, `windows-native.ps1`, and `windows-platform.cjs`. Root-to-leaf directory pinning with `FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT` rejects reparse points and locks ancestor directories against concurrent renames; `writePinnedFileWindows` performs staging with `CREATE_NEW`, flushes buffers, and executes atomic CAS replacement verifying expected device, inode, and SHA-256 digest on destination handle.
- **Caller migration:** Migrated `profile.cjs`, `state-baseline.cjs`, `history-query.cjs`, `history-prune.cjs`, `state-io.cjs`, `history-store.cjs`, and `isolated-workspace.cjs` to verified pinned context and native operations without breaking Linux descriptor traversal.

### 2026-09-28 — fix(advisor): repair Windows supervision and console observation (Repair Phase 02)

**Status:** Phase 02 DONE (2026-09-28; review approved 9.2/10). Readiness repairs are 2/4 complete; Phase 03 (provider launch identity) is next.  
**Plan:** [Readiness plan](../plans/260927-0005-windows-advisor-readiness/plan.md) · [Repair Phase 02](../plans/260927-0005-windows-advisor-readiness/phase-02-supervision-console.md)  
**Evidence:** Review records 9/9 focused supervision-console tests, 236/236 advisor-controller tests, a clean build, and `release:check`.

- Replaced Windows PID-tree teardown with native Job Object supervision: provider launch is assigned atomically to a kill-on-close Job; the creation token comes from the process handle; success requires positive confirmation that the Job is empty. Unconfirmed cleanup blocks success and relaunch.
- Added a separate supervisor control/lifetime channel and bounded provider output relay. Cancellation, probe timeout, output-limit, transport failure, and controller-channel EOF terminate the Job; removed `taskkill` and teardown-time PID lookup. The POSIX process-group path remains.
- Wired human-decision state preflight to a fixed console observer using verified `CONIN$`/`CONOUT$`, independent of piped JSON. Only the exact native `OBSERVED` result creates an event; state revision/replay checks remain. Unattended or detached console fails closed.
- Manual attached-console matching, Linux runtime, and vendor qualification remain Phase 04 prerequisites; provider-launch identity binding is Repair Phase 03.

### 2026-09-27 — fix(filesystem): complete Phase 02 durable cutover and host-specific qualification

**Status:** Phase 02 DONE (2026-09-27; review approved 9.6/10; user approved). Entire filesystem-policy cutover milestone is 100% complete (2/2 phases).  
**Plan:** [Parent plan](../plans/260927-0428-filesystem-cutover-review/plan.md) · [Phase 02](../plans/260927-0428-filesystem-cutover-review/phase-02-cutover-and-qualification.md)  
**Evidence:** 279/279 targeted tests pass across publication-recovery, registry, integration, plugin qualification, and advisor controller suites.

- Implemented schema version 3 publication journal writer (`publication.ts`) and bounded authentic schema 1/2 mode-bearing journal migration in recovery (`publication-recovery.ts`). Negative test verifies rejection of schema 3 journals bearing mode fields.
- Applied absolute chmod-invariance across capabilities in `scanner.ts` and `source.ts`: script-execution capability is derived strictly from script extensions and shebang bytes, never from file mode bits.
- Fixed Windows integration test client in `dam-hopper-client.mjs` and `dam-hopper-test-fixture.mjs` to resolve package JS entrypoint and invoke Node with direct argv, eliminating `cmd.exe` shell parsing vulnerabilities.
- Removed `stat.mode` fingerprint false-positive from plugin qualification test (`tests/plugin/qualification.spec.mjs`).
- Reconciled code standards (`SettingsMode` removed) and roadmap documentation (Windows advisor Phase 03 preserved as NO-GO pending readiness repairs).
### 2026-09-27 — fix(filesystem): complete Phase 01 launchability and identity

**Status:** Phase 01 DONE (2026-09-27; review approved 10/10). Parent filesystem-policy cutover is 50% complete (1/2 phases); Phase 02 remains proposed.  
**Plan:** [Parent plan](../plans/260927-0428-filesystem-cutover-review/plan.md) · [Phase 01](../plans/260927-0428-filesystem-cutover-review/phase-01-launchability-and-identity.md)  
**Evidence:** [Code review](../plans/reports/code-review-260927-1740-phase-01-launchability-and-identity.md)

- Completed launch-intent propagation for newly materialized publication files and role-based Linux installer execute provisioning; staged CLI smoke now invokes the real path directly.
- Removed permission-only drift from advisor evidence/CAS boundaries while retaining byte/object checks; registry and import file identities now distinguish file kind; mandatory staging chmod failures propagate.
- The dated review recorded 268 targeted tests passing and a successful build, with no critical findings. This is focused Phase 01 evidence, not a full release or Windows-readiness qualification.
- Phase 02 still owns durable journal recovery/migration policy and host-specific qualification; executable-capability policy and pre-upgrade recovery decisions remain unresolved.

### 2026-09-27 — refactor(repository): complete repository-wide removal of filesystem UID/ownership and mode enforcement

**Status:** IMPLEMENTED and PROVEN (2026-09-27). Replaced all ownership/UID/SID/DACL and private file-mode enforcement across the entire repository with the cross-platform trusted-files policy.  
**Scope:** Non-advisor runtime (`src/filesystem/`, `src/distribution/`, `src/adapters/`, `src/manifests/`, `src/imports/`, `src/registry/`, `src/scopes/`), standalone installers (`install.sh`, `install.ps1`), release archive pack/verify tools, advisor settings protocol/coordinator, canonical scripts (`.evcrate/source/.claude/scripts/`, `.evcrate/source/.evcrate/bin/`), and test harnesses.

- **Policy transition:** Removed all filesystem UID/SID/ACL/private-mode gates across both Linux and Windows. Default file/directory creation respects host umask; no forced `0o700` or `0o600` permissions.
- **Executable intent:** Preserved purely as an additive execute bit (`chmod | 0111`) on non-Windows platforms for runnable script assets (`install.sh`, release tar/zip staging, `.evcrate/bin/`, projected bash scripts).
- **Mode-free digests & verification:** `controllerTreeHash`, `completeTreeHash`, archive inventory digests (`Compute-InventoryDigest`, `computeInventoryDigest`), manifest verification, and publication CAS plans compare only content sha256, byte length, filesystem kind, and presence without mode comparison.
- **Settings contract clean cutover:** Exact-key schemas completely removed filesystem mode metadata (`SettingsMode` removed from request, result, preview, and journal contracts), rejecting legacy mode-bearing payloads without shims.
- **Review findings resolved:** Retained named-path device/inode/size check alongside descriptor validation in `hashFile`; propagated OS stat/chmod errors in `install.sh`; enforced additive execution in archive staging under umask 0002; wrapped canonical scanner YAML atomic write/flush/replace in single try/finally cleanup.
- **Verification evidence:**
  - Full protocol test suite: **54/54 passed**.
  - Filesystem & manifests primitives suite: **33/33 passed**.
  - Projection adapters suite: **13/13 passed**.
  - Resource registry & imports suite: **23/23 passed**.
  - Scopes & advisor settings suite: **24/24 passed**.
  - Advisor controller suite: **214/214 passed** on both Windows host and native Linux (WSL Ubuntu 22.04).
  - Distribution release & cutover suite: **7/7 passed**.
  - Distribution validation & rollout suite: **5/5 passed** (1 Linux installer test skipped on Windows host).
  - Integration suite: **14/14 passed**.
  - Linux standalone installer suite in WSL: **16/16 passed** (including broad-mode pre-existing directory install, repair, and launch).
  - Windows release qualification harness suite: **21/21 passed**.
  - Windows package smoke suite: **3/3 passed**.
  - Advisor plugin package & worker suites: **27/27 passed**.

### 2026-09-27 — refactor(advisor): replace filesystem UID/SID/DACL/mode restrictions with cross-platform trusted-files policy
**Status:** IMPLEMENTED and PROVEN (2026-09-27). Replaced advisor owner-only/0700/0600/SID/DACL enforcement with cross-platform trusted-files policy across Linux and Windows.  
**Scope:** CJS policy, state, history, baseline, and isolated workspace; TypeScript advisor settings read/preview/apply/recovery and locks; native Windows platform and bridge helpers; plugin reader binding, history scanner, policy provider, and evaluation provider.  

- **Policy transition:** Removed all advisor filesystem UID/SID/ACL/private-mode restrictions on both Linux and Windows. Replaced with cross-platform trusted-files policy: preserves OS permissions and errors, file kind, non-symlink invariants, single hardlink checks, file identity, canonical safe paths, JSON schemas, bounds, CAS replacement, process locks, and human approval gates. Preserved host/network owner authorization and unrelated installer/publication/import permission policy.
- **Settings & native changes:** `SettingsMode` is now observational numeric metadata rather than enforced bitmask validation. Native owner operations (`verifyWindowsFileOwnership`, `getCurrentUserSid`, `GetFileOwnerSid`, `VerifyFileOwnership`) removed from `windows-native.cs` and `windows-platform.cjs`. Prior Phase 03/04 follow-up requiring path-threaded Windows state/history ownership checks is superseded.
- **Build & contract verification:**
  - `npm run build`: PASS; corrective TypeScript compilation: PASS; `npm run release:check`: PASS.
  - Settings, filesystem, and protocol test suites: **87/87 passed on BOTH Windows and Linux**.
  - Windows full controller suite: **213/214 passed** (sole new history test typo fixed, then affected state/history suite passed **35/35**).
  - Linux full controller suite: **213/214 passed** (sole existing SIGTERM stdin test received signal instead of envelope; timing suspected not proven, diagnosis uncertain).
  - Linux root foreign UID state/history suite: **35/35 passed**.
- **Smoke & runtime proof:**
  - Windows (Everyone Modify) and Linux (foreign UID 12345, 0777/0666) policy, state, and workspace operations succeeded; settings get/preview/apply after chmod and rollback with shared foreign-owned journal/stage succeeded.
  - Native Linux actual smoke confirmed `umask 0002` creates advisor settings policy `0664`, runtime state `0664`, and state dir `0775`, while generic non-advisor `writeAtomicFile` retains `0600` file and `0700` parent defaults (assertions passed, confirming no hidden private defaults and unrelated helper defaults preserved).
  - Actual plugin reader smoke passed on Windows (Everyone Modify) and Linux (foreign UID 12345, 0777/0666): target binding accepted, policy ready, bound evaluation exact ID matched, history scan exact consultation matched; unauthorized policy operation correctly rejected.
- **Provider & worker test observations:**
  - Plugin provider suite: Linux **12/12 passed**; Windows **11/12 passed** (sole source-safety failure caused by test target `${normTarget}/./child` vs implementation `split(path.sep)` backslash: unrelated existing mixed-separator check, not an ownership issue).
  - Separate worker test: cannot load missing `@dam-hopper/plugin-sdk` on either platform (Worker SDK prerequisite exists only as a `plugin/vendor` reference blocked by configured ignore; worker suite not claimed passed).
- **Readiness state at this 2026-09-27 snapshot:** Descendant/Job supervision, spawn-time creation identity, no-replace publication, workspace replacement cleanup, provider-launch identity, and console approval remained open. Repair Phase 01 later closed the storage/cleanup items; Repair Phase 02 later closed Job supervision, creation-token capture, and console integration. Provider-launch identity remains Repair Phase 03.

### 2026-09-26 — feat(windows): prove native Windows advisor compatibility primitives (Phase 01)

**Status:** Phase 01 DONE (2026-09-26; feasibility gate passed; review approved **9.3/10**).  
**Plan:** [Native Windows advisor support](../plans/260926-1522-windows-advisor-support/plan.md) · [Phase 01](../plans/260926-1522-windows-advisor-support/phase-01-windows-primitives.md)  
**Evidence:** [native proof evidence](../plans/260926-1522-windows-advisor-support/reports/phase-01-native-proof-evidence.md) · [code review](../plans/reports/code-review-260926-1740-phase-01-windows-primitives.md)

- Proved native Win32 compatibility primitives required for advisor execution without weakening Linux invariants or requiring WSL/Git Bash.
- **Filesystem & ownership:** Validated handle-based SID/DACL inspection, protected directory creation, junction and hardlink rejection, directory handle pinning preventing rename/delete races, and full-chain mutation with `NtSetInformationFile(FileRenameInformation)` atomic replacement under strict `FILE_SHARE_READ`.
- **Process supervision:** Validated decimal creation token identity, suspended process launch with pre-assignment `PROC_THREAD_ATTRIBUTE_JOB_LIST` assignment, kill-on-close Job termination, grandchild containment, and control-pipe EOF teardown.
- **Bounded transport & console:** Validated write-only pipe inheritance via `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, separated control/provider framing, flood byte capping with immediate Job kill, backpressure pacing, and direct CONIN$/CONOUT$ console challenge matching with fail-closed headless detachment (`FreeConsole`).
- Verification: **67/67 checks passed** (0 failed) across Windows PowerShell 5.1 and verified official PowerShell 7.6.6 runtime.
- **Boundary:** Records Win32 primitive and native bridge feasibility only. Phase 02 controller lifecycle is now complete with approved Phase 03/04 follow-ups; Phase 03 invocation/publication is unblocked; Phase 04 qualification remains pending. Production Windows runtime qualification is not claimed.
### 2026-09-26 — feat(windows): complete native advisor controller lifecycle (Phase 02)

**Status:** Phase 02 DONE (2026-09-26; parent-approved after Cycle 3 conditional review, score **7.4/10**). Phase 03 unblocked.  
**Plan:** [Native Windows advisor support](../plans/260926-1522-windows-advisor-support/plan.md) · [Phase 02](../plans/260926-1522-windows-advisor-support/phase-02-controller-lifecycle.md)  
**Evidence:** [Cycle 3 code review](../plans/reports/code-review-260926-2156-phase-02-cycle-3.md)

- Integrated the native Windows controller lifecycle boundaries, including Windows environment canonicalization, package-bin resolution without shell invocation, IPC cancellation, and the inventoried 36-file controller closure.
- The dated review recorded **213/213 advisor-controller tests**, **16/16 viewer/manifest and package-inventory tests**, and **21/21 settings/filesystem distribution-primitives tests**.
- Two Cycle 3 findings were recorded as follow-ups for Phases 03/04: runner spawn-time process creation-token capture for PID-reuse-safe termination; state/history path-threaded Windows ownership checks (the latter since superseded by the 2026-09-27 cross-platform trusted-files policy).
- Phase 03 is unblocked. Production Windows runtime qualification remains unclaimed.

### 2026-09-24 — feat(history): complete paired qualification and release decision (Phase 05)

**Status:** Phase 05 DONE (2026-09-24; 100%; paired release qualified; review approved 9.8/10). **Plan:** [Phase 05](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md) · [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md). **Evidence:** [test report](../plans/reports/tester-260924-2115-phase-05-paired-qualification.md) · [review](../plans/reports/code-review-260924-2125-phase-05-paired-qualification.md) · [release manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md)
- Completed cross-repo qualification matrix across EVCrate and DamHopper, including negative authorization, owner-root admission, multi-project UI tests, and lifecycle revocation. The 10k local framed-worker benchmark stayed within frozen ceilings.
- Reproducible candidate and distribution packages passed verification against their inventory/checksums. Matched paired release approved; production deployment is not claimed.
- Direct owner-root provider scan discovered 21 project directories and accepted 237/237 consultations in 191.48ms with zero diagnostics; this was not a new live DamHopper browser-session qualification. The evcrate project filter returned 33 consultations.
- Validation: **273/273 tests passed** (0 failed, 0 skipped): plugin 65, viewer 27, qualification/performance 3, protocol 54, advisor metrics 6, DamHopper server 55, and DamHopper UI 63.
### 2026-09-24 — feat(history): complete account-wide project selector (Phase 04)

**Status:** Phase 04 DONE (2026-09-24; review approved **9.8/10**; **188/188 tests passed**). **Plan:** [Phase 04](../plans/260924-1055-all-project-advisor-history/phase-04-project-filter-ui.md); [validation](../plans/reports/phase04testerfinal-260924-1842-account-wide-project-selector-honest-ui-identity.md); [review](../plans/reports/code-review-260924-2004-phase-04-project-filter-ui-re-review.md)
- Same-snapshot inventory now drives server-filtered History/Overview; project switches clear cached rows, detail, and cursor. Labels fall back to abbreviated canonical IDs.
- Configuration identifies current owner policy, Evaluations their bound source; both say they are not filtered by History project. Provider labeling uses the custom/host plugin label rather than implying an account or project identity. Host navigation/page brands EVCrate only for matching plugin metadata.

### 2026-09-24 — fix(auth): guard production auth without breaking development

**Status:** Phase 00 DONE (2026-09-24); review approved **9.4/10**; user approved.  
**Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 00](../plans/260924-1055-all-project-advisor-history/phase-00-secure-auth-prerequisite.md)  
**Evidence:** [source review](../plans/260924-1055-all-project-advisor-history/reports/summary-review.md)

- Production startup with missing MongoDB configuration is guarded, and missing DB no longer triggers token issuance by itself.
- Explicit development/test token bootstrap and test-server login remain available; browser default-profile seeding is limited to development/test, and test-server access stays scoped to the fixture actor.
- Verification: **1,876/1,876 tests passed**.

### 2026-09-24 — feat(history): freeze cross-project advisor data contract (Phase 01)

**Status:** Phase 01 DONE (2026-09-24); review approved **9.5/10**; user approved.  
**Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 01](../plans/260924-1055-all-project-advisor-history/phase-01-cross-project-contract.md)

- Froze `evcrate-advisor-data` v2 while preserving strict v1 schema/behavior support, all eight method names, and on-disk execution/outcome history v1.
- Added `project_id: string | null` to v2 summary/page queries: `null` means All Projects only in owner-root context; single-project context remains bound.
- Defined a same-snapshot per-project inventory, capped at 500 entries and independent of active query filters, plus a versioned owner-safe display-name sidecar.
- Added runner scope contract `ContextScopeKind` (`project` | `history-root`) and `ContextScopeDescriptor` with optional root identity/source revision.
- Verification: **92/92 test executions passed** (86 test suite + 6 runner); review approved **9.5/10**.

### 2026-09-24 — feat(auth): complete owner-root history authorization and context (Phase 02)

**Status:** Phase 02 DONE (2026-09-24); review complete; user approved. **Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 02](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md). **Evidence:** [validation](../plans/reports/tester-260924-1424-phase02-host-root-authorization-context.md); [review](../plans/reports/code-review-260924-1436-phase-02-host-root-authorization.md)

- Bound history to the trusted owner source with authenticated admission, on-demand runner hydration, invoke-time reauthorization, and lifecycle revocation; kept project mode default-deny and non-history operations grant-protected. Original suite report: 2,550 pass, one Windows skip; later targeted checks cover restart/cache, ancestor-symlink, and wrong-owner UID. Phases 03–05 are complete; see their linked completion entries.

### 2026-09-24 — feat(history): complete owner-safe all-project worker (Phase 03; DONE, 9.5/10 review score)

**Plan:** [Phase 03](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md). **Evidence:** [tests](../plans/reports/testerphase03final-260924-1621-phase-03-owner-safe-history-worker.md) · [review](../plans/reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md). **Results:** 354/354 tests passed (0 failed, 0 skipped); review 9.5/10; canonical advisor checkpoint complete. Candidate manifest check: tester FAIL; later review PASS.
- Descriptor-pinned owner-root file checks; safe project names persist, and malformed/unknown metadata does not hide records (legacy unnamed projects show abbreviated IDs); HMAC-bound cursors tie-break `started_at DESC → project_id ASC → task_run_id ASC → consultation_id ASC`; candidate inventory reuses `collectPluginPackageRecords`. Phase 04 and the paired Phase 05 qualification/release are complete; see the Phase 05 record above.

### 2026-09-21 — feat(plugin): complete Phase E00 domain contracts and parity qualification

**Status:** Phase E00 DONE (2026-09-21); review approved **9.5/10**.  
**Plan:** [Phase E00 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-00-domain-contracts-and-parity.md)  
**Evidence:** [validation](../plans/reports/tester-260921-0805-phase-e00-domain-contracts-parity.md); [code review](../plans/reports/code-review-260921-0808-phase-e00-domain-contracts-and-parity.md)

- Completed the `evcrate-advisor-data` v1 domain contracts, strict schemas,
  generated manifest, positive/negative wire fixtures, exact path identity,
  canonical checkpoint digest, metric/evaluation parity fixtures, and reviewed
  read-closure feasibility artifact.
- Qualified the E00 verification matrix: build, schema generation check,
  advisor-plugin tests, advisor metrics, advisor parity, and evaluation tests
  passed **28/28** with no failures or skips.
- G0 budget/cancellation/UI-memory assumptions are recorded; E01 and E02 are
  complete; E03–E05 remain pending.


### 2026-09-21 — feat(plugin): complete Phase E01 owner-safe read provider

**Status:** Phase E01 DONE (2026-09-21; 100%); review approved **9.5/10**.  
**Plan:** [Phase E01 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-01-owner-safe-provider.md)  
**Evidence:** [verification](../plans/reports/audit-260921-1139-phase-e01-verification.md); [re-review](../plans/reports/code-review-260921-1216-phase-e01-fixes-re-review.md)

- Delivered a read-only, context-bound provider for all eight E00 operations:
  history refresh/summary/page/detail, current policy, and evaluation
  list/read/compare.
- Backend modules: `provider.cjs` dispatch/validation; `provider-errors.cjs`
  safe typed errors; `binding.cjs` target/owner identity; `snapshot-store.cjs`
  bounded retention; `cursor-manager.cjs` signed pagination;
  `history-scanner.cjs` cooperative scanning; `history-detail.cjs` fingerprinted
  rereads; `history-provider.cjs` refresh/summary/page/detail;
  `policy-provider.cjs` current policy; and `evaluation-provider.cjs` bound
  evaluation operations.
- Descriptor-pinned TOCTOU protection opens policy, evaluation, and history
  files with `O_RDONLY | O_NOFOLLOW`, rechecks descriptor ownership, regular-file,
  single-link, and size invariants, and closes the descriptor. History
  fingerprints include device/inode identity.
- Preserved cancellation/deadline behavior, same-context stale retention,
  cross-context isolation, deterministic code-point ordering, and `<= 1 MiB`
  pages. No provider mutators, HOME scan, path rebinding, or controller dispatch.
- The controller closure remains exactly 33 files: inventory delta `0`; no
  controller, installer, or distribution projection files changed.
- Verification: **56/56 tests passed** across 8 files: 9 plugin-provider tests,
  38 advisor-controller regressions, and 9 protocol/parity tests. E02 worker/SDK
  integration is complete; joint G1 owner-worker qualification remains unclaimed.

### 2026-09-21 — feat(plugin): complete Phase E02 framed Node plugin worker

**Status:** Phase E02 DONE (2026-09-21; implementation closure); Cycle 2 review approved **9.5/10**.  
**Plan:** [Phase E02 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-02-plugin-worker.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260921-1441-phase-e02-cycle2.md); [advisor checkpoint](../plans/reports/advisor-260921-1445-phase-e02-cycle2-checkpoint.json)

- Delivered pinned D00 SDK handshake, strict framed JSON-RPC worker, bounded
  context/revision lifecycle, capability dispatch, cancellation/settlement,
  safe error mapping, stdout purity, and process-failure handling.
- Built deterministic backend-only candidate with exact content-hash inventory;
  no root runtime dependency or standalone picker/UI.
- Verification: **53/53 plugin tests passed** (22 focused worker tests +
  31 plugin tests); candidate check and deterministic build passed. Joint G1
  owner-worker qualification remains downstream; E03 is next.

### 2026-09-21 — feat(plugin): complete Phase E03 embedded provider-neutral four-view UI

**Status:** Phase E03 DONE (2026-09-21; implementation closure); review approved **9.2/10**.  
**Plan:** [Phase E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md)  
**Evidence:** [validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md); [review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md)

- Replaced view-owned acquisition with shared provider/reducer/views and a
  temporary standalone picker (later removed by E05); DamHopper uses bounded
  `MessagePort` without credentials, paths, sockets, or arbitrary network.
- Added bridge 1.0.0's eight validated envelopes, single-use nonce ack, session/
  generation fences, cancellation, late-response suppression, availability,
  and revocation cleanup.
- Kept Overview, paged History/detail, current account-wide policy labels, and
  bound-source Evaluations with provenance and candidate masking.
- Built `plugin/ui/index.html` as opaque-srcdoc inlined CSS/IIFE (328,337 bytes,
  <=5 MiB), with no external assets/network/filesystem picker, `eval`, or
  `Function`. Manifest/candidate include UI, `/plugins/evcrate.advisor`
  navigation, and its SHA-256 inventory entry (64 records).
- Verification: **68/68 tests passed** — 23 focused E03 UI tests, 14 viewer
  browser/build tests, 22 worker tests, and 9 plugin contract tests. Host-enforced
  CSP/sandbox, joint G2 LAN acceptance, E04 packaging, and G4 cutover remain
  downstream gates.

### 2026-09-22 — feat(plugin): qualify E04 independent package and Gate G3

**Status:** Phase E04 DONE (2026-09-22); Gate G3 **QUALIFIED**; review approved **9.3/10**.  
**Plan:** [Phase E04 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-04-independent-package.md)  
**Evidence:** [G3 qualification receipt](../plans/260920-1603-dam-hopper-advisor-plugin/reports/g3-qualification-receipt.md); [lifecycle review](../plans/reports/code-review-260922-2336-g3-qualification-lifecycle.md)

- Verified the independently installable matched package `evcrate.advisor`
  v0.1.0: **45 logical members**, **176,842 bytes compressed** (747,008 bytes
  expanded), code-point-sorted exact closure, and archive SHA-256
  `1ada5334671ae854e6c406930f8705de02d85e02198adcb07c41936002011f9a`
  (`1ada5334...`).
- Verified transactional stage/approve, matched UI/backend activation,
  update/disable/remove, worker drain and context revocation, crash recovery,
  and clean restart without DamHopper rebuild or EVCrate source mutation.
- Verified rollback safety: current revoked grants and disabled intent dominate
  restored package/settings; activation generations never rewind and restored
  non-security settings are revalidated.
- Verified root exact-7 release isolation: plugin staging is excluded from root
  npm packaging and cannot become an eighth release asset.
- Qualification evidence: plugin lifecycle **5/5**, package integrity/hostile
  archive **5/5**, root isolation **1/1**, and companion DamHopper lifecycle
  **8/8**. Standalone viewer retirement remains gated on E05/D06 G4.



### 2026-09-19 — feat(viewer): complete packaging, CSP, preview, and release inventory (Phase 08)

**Status:** Phase 08 DONE (2026-09-19; 100%); **39/39 focused tests passed**.
**Plan:** [Phase 08 plan](../plans/260917-2308-advisor-visual-metrics/phase-08-packaging-csp-preview-and-release-inventory.md)
**Evidence:** `tests/viewer/package-inventory.test.mjs`; `tests/distribution/private-release-artifacts.test.mjs`

- Added the viewer TypeScript, Vite, and Playwright boundaries: strict ES2020
  browser typechecking, relative static assets, no sourcemaps, and one Chromium
  project served from the built preview.
- Added `build:viewer`, `build:all`, `viewer:preview`, and
  `test:advisor-viewer`; release preparation now builds the root and viewer
  together before collecting package inventory.
- Preview binds strictly to loopback `127.0.0.1:4173` and emits the exact HTTP
  CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'
  data:; connect-src 'none'; object-src 'none'; base-uri 'none';
  frame-ancestors 'none'`.
- Package inventory includes only built `viewer/dist/**` viewer assets; source,
  configs, tests, maps, and `node_modules` remain excluded. The measured bundle
  is **298.5 kB <= 5 MiB**.
- Exact-seven top-level release assets and the exact 33-file controller closure
  remain unchanged. The viewer is packed inside platform archives, never added
  as a release asset.
- Handoff: **Phase 09 — Focused qualification and performance benchmark**.

### 2026-09-19 — feat(viewer): complete React Explorer and view architecture (Phase 07)

**Status:** Phase 07 DONE (2026-09-19; 100%); code review approved **10/10**.  
**Plan:** [Phase 07 plan](../plans/260917-2308-advisor-visual-metrics/phase-07-react-explorer-and-view-architecture.md)  
**Evidence:** [viewer validation](../plans/reports/tester-260918-2352-phase-07-viewer-architecture-validation.md); [architecture review](../plans/reports/code-review-260918-2359-phase-07-react-explorer.md)

- Added the private static React explorer under `viewer/src/`: one reducer
  state machine, explicit File System Access pick/refresh/cancel controls,
  router-free `#overview`, `#history`, `#configuration`, and `#evaluations`
  views, and local responsive styling.
- Overview renders honest n/N/excluded ratios, missingness, latency, attempts,
  completeness, and limitations. History provides frozen filters, 100-row
  paging, and lazy inert detail. Configuration separates current policy from
  historical route/prompt/build comparisons. Evaluations group exact comparable
  digests, preserve human/automated provenance, and mask candidates until reveal.
- Handles remain in refs; scans are generation-fenced; failed/cancelled/
  incomplete refresh retains stale snapshots. No raw HTML, active record links,
  network calls, model execution, persistence, grading, or external assets.
- Verification: **28/28 tests passed** (22 viewer state/view tests + 6 metrics
  tests), strict viewer typecheck/build passed with **zero TypeScript diagnostics**,
  and every viewer module remains under 200 LOC.
- **Canonical advisor mentoring verification:** **PASS** against the canonical
  `.claude/workflows/advisor-mentoring.md` contract; the viewer remains a
  validated data consumer and does not invoke model/checkpoint flows or claim
  mentor quality.
- Handoff: **Phase 08 — Packaging, CSP, preview, and release inventory**.

### 2026-09-18 — feat(advisor): complete counsel evaluation protocol and fixtures (Phase 06)

**Status:** Phase 06 DONE (2026-09-18; 100%); Cycle 2 review approved 10/10.  
**Plan:** [Phase 06 plan](../plans/260917-2308-advisor-visual-metrics/phase-06-counsel-evaluation-protocol-and-fixtures.md)  
**Evidence:** [Cycle 2 validation](../plans/reports/tester-260918-1733-phase06-cycle2-validation.md); [Cycle 2 review](../plans/reports/code-review-260918-1736-phase-06-counsel-evaluation-cycle-2.md)

- Added public `evcrate-advisor-counsel-evaluation` v1 types/facade, strict nested validation, canonical rubric/input SHA-256 checks, immutable documents, response/score invariants, and digest/provenance-separated aggregation.
- Added explicit read-only browser multi-file evaluation reader with bounded 8 MiB files, per-file statuses, and no persistence, execution, grading, or history-metrics path.
- Added `valid-mixed`, digest-mismatch, invalid-observations, and oracle-free nine-case fixtures derived from corpus inputs without `expected_mentor_response`.
- Verification: **87/87 tests passed** across protocol, viewer, metrics, parity, and distribution suites; build, viewer typecheck, and release-check passed; review **10/10**.
- Controller closure remains 33 files and unchanged. Handoff: **Phase 07 — React explorer and view architecture**.

### 2026-09-18 — feat(advisor): complete browser history traversal and scanner (Phase 05)

**Status:** Phase 05 DONE (2026-09-18; 100%); Cycle 2 review approved 9.8/10.  
**Plan:** [Phase 05 plan](../plans/260917-2308-advisor-visual-metrics/phase-05-browser-history-traversal-and-scanner.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260918-1353-phase-05-browser-history-traversal-cycle-2.md); [suite validation](../plans/reports/tester-260918-1350-phase05-suite-validation.md)

- Completed explicit read-only File System Access selection, deterministic three-level history traversal, bounded four-read scanning, strict record/digest validation, sanitized diagnostics, and duplicate resolution.
- Completed atomic generation replacement with stale retention for incomplete/cancelled/denied scans, plus read-only policy inspection with legacy-v1 migration-required state.
- Focused proof passed: viewer 24/24, advisor metrics 6/6, and contract parity 4/4 (34/34 total); all Phase 05 modules remain under 200 lines.
- Handoff advanced to Phase 06 — Counsel evaluation protocol and fixtures.


### 2026-09-18 — feat(advisor): integrate history metrics CLI (Phase 04)

**Status:** Phase 04 DONE (2026-09-18; 100%); Cycle 2 review approved 10/10.  
**Plan:** [Phase 04 plan](../plans/260917-2308-advisor-visual-metrics/phase-04-history-metrics-cli-integration.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260918-1243-phase-04-history-metrics-cli-integration-cycle-2.md)

- Added the read-only `history metrics` CLI operation with exact request/result
  envelopes, current-project/task scope, bounded unlocked collection, and
  sanitized deterministic diagnostics.
- Reused the finalized Phase 02 normalization and metrics kernel without
  controller-local formulas; invalid, missing, unknown, and conflicting records
  remain distinct and reconcile with scan accounting.
- Focused proof passed: 26/26 history CLI/store/metrics tests, 6/6 advisor-metrics
  tests, and 11/11 controller-closure tests; existing history operations remain
  unchanged. Phase 05 is next: browser history traversal and scanner.

### 2026-09-18 — feat(advisor): complete checkpoint digest, metrics kernel, and generated CJS adapters (Phase 02)

**Status:** Phase 02 DONE (2026-09-18; 100%); review approved 10/10.  
**Plan:** [Phase 02 plan](../plans/260917-2308-advisor-visual-metrics/phase-02-checkpoint-digest-metrics-kernel-and-generated-cjs-adapters.md)  
**Evidence:** [Phase 02 re-review](../plans/reports/code-review-260918-0244-phase02-re-review.md)

- Completed the portable deterministic metrics kernel, exact history filters/formulas,
  frozen results, duplicate exclusion, diagnostics, completeness, and limitation codes.
- Preserved order-sensitive checkpoint digest bytes and proved Node/Web Crypto parity;
  converted the CJS contract and policy validators to generated-runtime adapters while
  retaining required exports and boundary error codes.
- Registered the generated four-file runtime closure in the 33-file controller
  inventory. Focused proof passed: protocol 31/31, metrics 5/5, parity 4/4,
  advisor-controller 206/206, distribution check/build `status: "ok"`, and build.

### 2026-09-18 — test(advisor): close controller closure and installer inventory parity (Phase 03)

**Status:** Phase 03 DONE (2026-09-18; 100%); review approved 10/10.  
**Plan:** [Phase 03 plan](../plans/260917-2308-advisor-visual-metrics/phase-03-controller-closure-and-inventory-migration.md)  
**Evidence:** [Closure parity evidence](../plans/reports/evidence-260918-1140-phase-03-33-file-closure-parity.json); [code review](../plans/reports/code-review-260918-1136-phase-03-controller-closure-inventory-migration.md)

- `install.sh` and `install.ps1` now carry the exact 33-file code-point-sorted
  controller inventory, including the four generated runtime modules.
- `tests/manifests/distribution-manifests.test.mjs` asserts exact count/hash parity
  and rejects an extra `viewer.js` or a foreign `require('lodash')`.
- Evidence records sequence-identical authority/generated/installer lists, 81
  validation checks, and zero failures. Historical dated 29/29 evidence remains
  unchanged; Phase 04 is complete and Phase 05 is next: browser history traversal
  and scanner.

### 2026-09-15 — docs(release): complete Windows qualification and bounded support cutover (Phases 09–10)

**Status:** Phases 09–10 DONE (10/10 Windows qualification phases; 100%; completed 2026-09-15).  
**Plan:** [Windows qualification master plan](../plans/260914-0636-windows-release-qualification/plan.md)  
**Evidence:** [Phase 09 integrated qualification](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md), [Phase 09 suite validation](../plans/reports/tester-260915-1119-phase-09-suite-validation.md), and [Phase 10 support cutover](../plans/260914-0636-windows-release-qualification/phase-10-post-proof-documentation-and-support-cutover.md)

- Completed the hosted `windows-2025` x64 matrix for PowerShell 5.1/7 and Node
  `22.19.0`/`24.21.0`, with standalone installer lifecycle (`install`,
  repeat-install, `repair`, upgrade, `rollback`, `uninstall`) and `version --json`
  qualification.
- Bounded support now covers the standalone installer and version reporting only.
  `publish`, `health`, advisor execution, live vendor qualification, and production
  HOME publication remain Linux-only or operator-gated.
- Reconciled README and architecture, standards, PDR, and roadmap documentation with
  package version `2.1.0`, Windows defaults, user PATH behavior, and project
  publication state.

### 2026-09-15 — feat(ci): unprivileged Windows PR smoke and qualified asset labels (Phase 08)

**Status:** Phase 08 DONE (2026-09-15; 100%).  
**Plan:** [Phase 08 plan](../plans/260914-0636-windows-release-qualification/phase-08-unprivileged-windows-pr-smoke-and-labels.md)  
**Evidence:** `tests/distribution/release-orchestration.test.mjs` (WRQ-042–044).

- Added `.github/workflows/windows-smoke.yml`: `pull_request`/manual-only, read-only
  `contents`, canceling concurrency, `windows-2025` x64, Node `22.19.0`, pinned
  v4 actions, `npm ci`, checked-in version/SHA fixture build, exact-seven verify,
  and explicit `pwsh.exe` smoke harness.
- Fixture identity uses `--allow-fixture-identity` and is diagnostic only: no
  secrets, write scope, upload, semantic-release, or privileged follow-up/handoff.
- `.releaserc.json` now labels the Windows ZIP `Windows x64 Archive` and
  `install.ps1` `Windows Installer Entrypoint (install.ps1)`; other labels,
  paths/order, and prepare command remain unchanged.
- WRQ-042 covers workflow isolation, WRQ-043 fixture/exact-seven/smoke wiring,
  and WRQ-044 exact labels plus preserved asset configuration. Native matrix,
  publication, and final byte proof remain Phase 09/operator gates.

### 2026-09-15 — feat(ci): split release workflow into producer, matrix, and publisher (Phase 07)

**Status:** Phase 07 DONE (2026-09-15; 100%); Cycle 2 review approved 10/10.  
**Plan:** [Phase 07 plan](../plans/260914-0636-windows-release-qualification/phase-07-release-workflow-producer-matrix-publisher.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260915-0155-phase-07-cycle-2.md)

- Replaced the monolithic release job with an unprivileged Ubuntu producer, a
  four-row `windows-2025` x64 qualification matrix, and a success-only publisher.
- Producer gates remain ordered; release handoff uses one immutable artifact ID,
  receipt, and producer hashes. Matrix rows consume the artifact without checkout/npm.
- Publisher is the sole writer, copies exactly seven assets, and runs semantic-release
  in verify mode. All eight action uses are pinned to full v4 SHAs.
- Static YAML/permissions/action-pin/expression checks passed; release orchestration
  passed 12/12. Native Windows execution and live publication remain Phase 09/operator gates.

### 2026-09-14 — feat(release): canonical semantic-release candidate, receipt, and publisher (Windows qualification Phase 06)

**Status:** Phase 06 DONE (2026-09-14; 100%); Cycle 2 code review approved 10/10.
**Plan:** [Phase 06 plan](../plans/260914-0636-windows-release-qualification/phase-06-semantic-release-candidate-receipt-and-publisher.md)
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260914-2236-phase-06-cycle-2-release-orchestration.md)

- Added the canonical candidate runner with strict `.releaserc.json` loading,
  disposable bare-mirror semantic-release execution, GitHub-plugin removal only,
  build-mode asset preparation, release-token stripping, clean checkout/source
  identity checks, exact seven/four staging, canonical `candidate.json`, atomic
  promotion, and exactly nine safe GitHub output scalars.
- Added the verify-only publisher wrapper: receipt and hash preflight, exact
  assets-only `dist/release` copy, forced `EVCRATE_RELEASE_ASSET_MODE=verify`,
  canonical semantic-release invocation, and version/tag/source equality checks.
- Bound `semantic-release`, `release:candidate`, `release:verify-assets`,
  `test:release`, and `test:installer:windows` in `package.json`; no new
  dependency or orchestration-only lockfile edit.
- `release-orchestration.test.mjs` passes 12/12; `npm run test:release` passes
  29/29; build and CLI help checks pass. Native Windows execution and live
  npm/GitHub publication remain downstream gates.



### 2026-09-14 — feat(test): self-contained Windows qualification harness (Phase 05)

**Status:** Phase 05 DONE (2026-09-14; 100%); Cycle 2 review approved 10/10.
**Plan:** [Phase 05 plan](../plans/260914-0636-windows-release-qualification/phase-05-self-contained-windows-qualification-harness.md)
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260914-2030-phase-05-self-contained-windows-qualification-harness-cycle-2.md)

- Delivered the Node-builtins-only qualification CLI with strict host,
  receipt, and exact-byte preflight; safe PowerShell/`cmd.exe` runners;
  smoke/full lifecycle controllers; immutable-state and PATH observers; and
  isolated negative scenarios.
- Scoped checks passed 60/60: distribution/harness 28/28, release artifacts
  17/17, and Linux installer wildcard 15/15. Direct `--help` invocation
  exited 0, confirming the standalone entrypoint.
- Native Windows smoke/full execution remains an explicit downstream Phase 09
  evidence gate; Phase 07 workflow wiring is complete but does not execute hosted
  rows. This deterministic host-independent evidence makes no runtime support claim.
- Handoff advanced to Phase 06 — semantic-release candidate, receipt, and
  publisher.

### 2026-09-14 — feat(release): deterministic Windows fixture and predecessor resolver (Phase 04)

**Status:** Phase 04 DONE (2026-09-14; 100%); Cycle 2 review approved 10/10.
**Plan:** [Phase 04 plan](../plans/260914-0636-windows-release-qualification/phase-04-deterministic-windows-fixture-and-predecessor.md)
**Evidence:** [Cycle 2 tests](../plans/reports/tester-260914-1803-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md)
and [Cycle 2 review](../plans/reports/code-review-260914-1805-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md).

- Factored shared fixture record ordering, controller/build-manifest digests, real
  installer bytes, and fixed timestamp metadata; `buildWindowsTestReleaseSet`
  now uses `buildReleaseArchives` and emits exactly four Windows assets.
- Added bounded stable-release enumeration and exact-label/canonical-name
  predecessor resolution. Bootstrap uses verified `1.0.0`/`v1.0.0` bytes with
  lowercase `a`×40 identity only before qualification history; latest stable is
  mandatory afterward, with no older/bootstrap fallback.
- Added private staged streaming downloads with cross-origin token stripping,
  bounded error/stream bytes, pre/post-promotion exact-four verification, strict
  CLI flags, and cleanup of partial output on failure.
- Focused Phase 04, release, and Linux installer suites pass 39/39 (100%).
  This deterministic Linux evidence does not qualify native Windows runtime.

### 2026-09-13 — docs(distribution): post-verification operator and architecture documentation (Phase 09)

**Status:** Phase 09 DONE (2026-09-13; 100%). Live operator and architecture documentation updated after full implementation proof, release gate verification, 14-suite `npm test` success (512/512), exact 29-file closure verification, and installed Linux release proof.
**Plan:** [Phase 09 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-09-post-verification-operator-documentation.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Reconciled code and design contracts against Phase 08 evidence.
- Updated `README.md` with operator CLI examples (`--scope home|project`, `--home`, `--project-root`, `--target`, recovery), the seven-target destination matrix, shared controller HOME invariant, partial failure semantics (`PUBLICATION_FAILED`/`ROLLBACK_FAILED`, exit 5), quiescence runbook, and the explicit distinction between standalone installer rollback (`install.sh rollback`) and harness publication recovery.
- Updated `docs/system-architecture.md` with the updated build-to-publication dataflow diagram, two-phase transaction execution, HOME-then-project lock ordering, preflight-before-mutation checks, schema-2 state roots, and scope-isolated recovery.
- Updated `docs/project-overview-pdr.md` with observable functional requirements for scope-aware publication (FR-10), partial exit codes, and Linux-only qualification status.
- Updated `docs/code-standards.md` with enforceable architectural bans (no project controller, no reverse lock acquisition, no arbitrary wrapper body rewriting, no ancestor project searches, no cross-volume atomicity fiction, no hand-editing generated files, no cross-scope recovery) and two-phase transaction standards.
- Updated `docs/codebase-summary.md` with exact current symbols, test suites, descriptor types, and the comprehensive scope distribution architecture summary.
- Updated `docs/pi-native-migration.md` with scope-aware publication commands, extension-derived EVCrate root derivation, and `PI_CODING_AGENT_DIR` runtime variable semantics.
- Updated `docs/project-roadmap.md` and `docs/project-changelog.md` with complete evidence traceability for Phases 01 through 09.
- Verification: [Cycle 2 validation](../plans/reports/tester-260913-1742-phase-09-cycle-2-test-suite-validation.md) records `npm run build`, `npm run distribute:check`, and `npm test` passing; [Cycle 2 review](../plans/reports/code-review-260913-1758-phase-09-operator-docs-cycle-2.md) approved the documentation set at 10/10.

### 2026-09-13 — feat(distribution): installed Linux release fixtures and regeneration (Phase 08)

**Status:** Phase 08 DONE (2026-09-13; 100%). Installed Linux fixtures and checked-in regeneration verified.
**Plan:** [Phase 08 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-08-installed-release-fixtures-and-regeneration.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Extended `verifyInstalledLauncherAndInvariance` to prove HOME non-mutation on install, all-seven HOME publication with shared controller, project publication to separate project directory without project controller, runtime entrypoint execution across all seven targets from third workspace, partial failure rollback and recovery isolation, and package snapshot byte invariance throughout.
- Modularized installed assertions into `scripts/release/installed-lifecycle-assertions.cjs` (< 200 LOC).
- All release gates passed sequentially: `npm run distribute:build`, `npm run generate:registry`, `npm run generate:manifests`, `npm run distribute:check`, `npm run test:release` (10/10), `npm run test:installer:linux` (15/15), `npm run test:validation-rollout` (6/6), `npm run test:distribution:rollout` (5/5), and full test suite (512/512).
- Terminal code review approved (Verdict: PASS) with zero blockers and full A43–A49 compliance.

### 2026-09-13 — feat(distribution): focused contract and runtime proof for scope distribution (Phase 07)

**Status:** Phase 07 DONE (2026-09-13; 100%). Focused proof gate passed across all protocol, adapter, publication, and recovery suites.
**Plan:** [Phase 07 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-07-focused-contract-and-runtime-proof.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Focused gates passed: build; protocol 21/21; CLI/context 47/47; primitives 31/31; adapters 26/26; publication 77/77; integration 14/14; cutover 7/7; and direct `distribute:check` returned `status: "ok"`.
- Tester passed five targeted checks; terminal code review approved with no findings; advisor reconciliation approved finalization.
- Canonical regeneration ran through `distribute:build`, `generate:registry`, and `generate:manifests` to restore controller-manifest hash integrity.
### 2026-09-13 — feat(distribution): schema-2 state migration and scope-isolated recovery (Phase 06)

**Status:** Phase 06 DONE (2026-09-13; 100%). Blocking review corrections resolved and implementation approved. Generated `.evcrate` artifacts remain Phase 08-owned; `docs/system-architecture.md` remains Phase 09-owned.
**Plan:** [Phase 06 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-06-state-migration-recovery-and-partial-orchestration.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Schema 2 separates shared controller state from HOME harness state. Valid schema-1 in-progress state is recovered first under the HOME lock; valid terminal state migrates atomically, while ambiguous ownership remains untouched and fails closed.
- Recovery is scope-isolated: HOME recovery reads only HOME state; project recovery validates the canonical project identity and reads only its identity-keyed project state. Project publication commits shared HOME first, then applies harness independently; harness failure rolls back only project work and returns a top-level `partial` (exit category 5), using `PUBLICATION_FAILED` after successful rollback or preserving the journal with `ROLLBACK_FAILED` when rollback fails.
- Blocking review corrections covered schema-2 binding/phase validation, project-root binding before HOME mutation, locked replanning after HOME recovery, durable ownership-pinned legacy cleanup retry, and same-volume preflight. Existing modes, hashes, CAS, ownership, and unmanaged-data protections remain fail-closed.
- **Direct local evidence:** `npm run build` passed; `node --test tests/distribution/publication-recovery.test.mjs` passed 19/19; `node --test tests/distribution/publication-apply.test.mjs` passed 12/12; `node --test tests/distribution/publication-plan.test.mjs` passed 6/6; `node --test tests/cli/publication.test.mjs` passed 6/6.
- The mandatory tester agent could not execute because its provider returned HTTP 429 before commands; no tester-agent execution is claimed. These local checks do not qualify live vendors/operators or authorize HOME publication.


### 2026-09-13 — feat(distribution): generic transaction engine and locking (Phase 05)

**Status:** Phase 05 DONE (2026-09-13; 100%). Generic transaction descriptor and execution engine implemented.
**Plan:** [Phase 05 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-05-generic-transaction-engine.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Generic immutable transaction descriptor/engine covering HOME and project publication with preflight-before-mutation, HOME-then-project locking, durable journal-before-workspace ordering, workspace identity/containment and same-volume checks, fsync/marker ordering, bounded HOME retention with project no-retention cleanup, and distinct recovery/error outcomes.
- Existing schema-1 HOME recovery compatibility preserved.
- Direct evidence: `npm run build` passed; `npm run test:publication` passed 66/66; `npm run test:integration` passed 14/14; focused recovery and oversized-result regressions passed.
### 2026-09-12 — feat(distribution): one-snapshot shared and harness phase planning (Phase 04)

**Status:** Phase 04 DONE (2026-09-12; 100%). Final authorized-scope review approved with no findings. Live operator documentation (`docs/system-architecture.md`) remains unchanged until Phase 09; generated outputs remain Phase 08-owned.
**Plan:** [Phase 04 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-04-one-snapshot-phase-planning.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Resolved one aggregate schema-2 `VerifiedCurrentBuild` and digest once, then passed the immutable snapshot to ordered shared and harness planning. Shared controller materialization remains fixed beneath `<home>/.evcrate/bin`; HOME uses strict target mappings/order, with only valid Gemini `.gemini` → Antigravity `.gemini/config` nesting; project roots/documents remain neutral and contained.
- Preserved selected-target ownership and stale cleanup bounds, shared JSON merges and user-owned bytes, hashes, modes, CAS snapshots, immutable defensive operation bytes, transformed/merged file-size bounds, and duplicate planned-destination rejection. Full overlap/path preflight runs before destination reads.
- Advisor correction state completed after user-approved bounded corrections. Final blocking code review verdict: approve with no findings.
- **Direct repository evidence:** `npm run build` passed; `node --test tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs` passed 8/8; `npm run test:publication` passed 57/57; `npm run test:adapters` passed 24/24; `npm run distribute:check` returned `status: "ok"`.
- The tester subagent could not execute because its external Cloud Code Assist backend returned HTTP 429; the direct commands above are the evidence. These deterministic repository checks do not qualify live vendors/operators or authorize HOME publication.
- Handoff: Phase 05 generic transaction engine; Phase 06 schema-2 state/recovery/partial orchestration; Phase 07 focused contract/runtime proof.
### 2026-09-12 — feat(distribution): neutral seven-target runtime closures and structured HOME rules (Phase 03)

**Status:** Phase 03 DONE (2026-09-12; 100%).  
**Plan:** [Phase 03 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-03-neutral-seven-target-runtime-closures.md)

- Completed installation-relative neutral runtime closures for all seven targets, structured HOME transforms, workspace `cwd`/environment separation, and fail-closed child validation.
- Evidence: `npm run build`, adapters 24/24, source-derived publication 54/54, integration 14/14, and the source-derived full suite passed. Checked-in generated outputs remained Phase 08-owned.


### 2026-09-12 — feat(distribution): context and manifest project bindings (Phase 02)

**Status:** Phase 02 DONE (2026-09-12; 100%). Live operator documentation (`docs/system-architecture.md`) remains unchanged until final proof in Phase 09 per design contracts and acceptance matrix A47/A50.  
**Plan:** [Phase 02 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-02-context-and-manifest-project-bindings.md)  
**Evidence:** [Advisor review](../plans/reports/advisor-260912-1035-phase02-context-and-manifest-project-bindings.md) and [context tests](../tests/context/invocation-context.test.mjs)

- Normalized project destinations: Added immutable `ProjectDirectoryDescriptor` and `ProjectDocumentDescriptor` unions to `SelectedTargetContext` and `InvocationContext` (`src/manifests/types.ts`, `src/context/invocation-context.ts`), derived strictly from manifest `outputRoots` and `projectDocs` in declaration order without filesystem ancestor traversal.
- Retained file/directory distinction: Root documents (Codex `AGENTS.md`, Gemini `GEMINI.md`) are explicitly represented as document descriptors, never traversed as directory bindings.
- Intra- and cross-target overlap validation: Added strict overlap rejection via `pathOverlaps` and `assertNoDescriptorOverlap` (`src/manifests/manifest.ts`, `src/manifests/registry.ts`, `src/context/invocation-context.ts`) that rejects equal, nested (ancestor/descendant), duplicate document, and root/document collisions before any destination inventory reads.
- Canonical project root and owner-controlled identity: Implemented `canonicalProjectRoot` in `src/scopes/identity.ts` enforcing real directory existence, non-symlink ancestry, owner control (`process.getuid()` or root), and native `realpath` canonicalization. Computed lowercase 64-hex SHA-256 `projectIdentity` over the validated canonical absolute path.
- Non-publication safety: Added `resolvePublicationProjectContext` for publication-boundary mutation checks while preserving lexical project root resolution and independent `projectId` for general `resolveInvocationContext` commands.
- Projection neutrality: Maintained exact byte-for-byte shape compatibility for `ProjectionBuildContext` in `src/adapters/types.ts`; adapters receive no scope or transaction context.
- Verification: 174/174 tests passing across primitives, CLI, adapters, publication, and protocol test suites (`npm run test:primitives`, `npm run test:cli`); `npm run distribute:check` status ok with zero drift.
### 2026-09-12 — feat(distribution): freeze scope publication protocol (Phase 01)

**Status:** Phase 01 DONE (2026-09-12; 100%).  
**Plan:** [Phase 01 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-01-cli-and-protocol-contract.md)

- Froze scalar `--scope home|project` parsing/defaults, exact publication/recovery wire shapes, ordered shared/harness phase correlation, partial results, and exit category 5.
- Evidence: protocol 21/21, CLI 42/42, integration 14/14, publication 53/53, and `npm run build` passed.


### 2026-09-11 — fix(advisor): resolve V2 evidence.files schema ambiguity and improve input diagnostics

- Resolved `PROTOCOL_INVALID` failure on caller-provided string `evidence.files` by differentiating client request validation from downstream adapter protocol errors.
- Parameterized `validateCheckpointV2(value, code = 'PROTOCOL_INVALID')`; request boundaries in `state-contract.cjs` and `task-state.cjs` pass `REQUEST_INVALID`.
- Updated `REQUEST_INVALID` in `errors.cjs` to provide version-neutral, actionable instructions indicating that V2 `evidence.files` requires `{ path, excerpt, digest }` objects and `intended_changed_paths` are strings. Preserved exact four-key error envelope.
- Populated empty `evidence.files` examples in canonical `advisor-mentoring.md` and `brief-contract.md` with schema-valid `{ path, excerpt, digest }` fixtures while maintaining exactly 10 extractable JSON blocks.
- Clarified agent instructions across all seven target projections (`advisor.md`, `SKILL.md`).
- Validated zero projection drift across all seven harnesses via `distribute:check` and 100% test pass rate across 230 tests (`test:advisor-controller` 207/207, `test:adapters` 23/23).
- Independent code review (9.5/10 Approved) and mentor review (`review:hard-fix` with GPT-5.6 Sol high effort: Approved).

## Historical entries

Older phase detail is preserved in the [project changelog archive](./project-changelog-archive.md).
The current changelog remains the maintained phase mirror for the active milestone.
