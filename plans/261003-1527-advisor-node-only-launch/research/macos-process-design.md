# Darwin process identity, terminal and cleanup design

Status: proposed implementation contract; report-only research. Darwin execution, build and qualification **not performed**. No gates, tests, formatters, probes or controller calls run.
Scope: actual advisor behavior, not launch-only. Preserve Linux/Windows algorithms, wire schemas, provider policy and one explicit Node launcher. Parent owns architecture/top-level plan.

## Repository facts and exact change surface

All runtime paths below are relative to `.evcrate/source/.evcrate/bin/lib/advisor/`.
- `state-io.cjs:stateLocation` (75–119) rejects Darwin; `proc` (121–129) reads Linux `/proc/<pid>/stat`, extracting start ticks and state. `processIdentity` (130–135) otherwise returns null start outside Windows/Linux.
- `state-io.cjs:validIdentity` (136–141) already accepts exactly `{pid,start}` with positive int32 PID and null or **1–32 decimal digits**. `processStatus` (142–153) is tri-state; Linux combines kill-zero with start comparison, treating Z/X as dead. Keep Linux/Windows branches unchanged; add explicit Darwin dispatch before Linux path.
- `state-io.cjs:acquire` (293–329) reaps only proven-dead owners, serializes reapers with exclusive recovery guard, rechecks stat/token/status before unlink. Any existing state-recovery guard blocks, even if apparently dead: intentional crash-uncertainty rule, no TTL.
- `history-store.cjs:acquireHistoryLock` (166–225) also consumes exported identity/status, but **differs**: it may remove a proven-dead recovery guard; regular-lock recheck is `unchanged` stat, not state's second process/token check. Preserve existing algorithm; do not falsely document identical safeguards.
- `task-state.cjs:claimCheckpoint` pending persistence at 402–404 rejects null self-start; `humanDecision/preflightHumanDecision/executeStateRequest/attachControllerResult` checks at 209, 286, 314 and 427 govern pending recovery/ownership. Darwin must supply a real token; generic kill-zero identity cannot satisfy this.
- `runner.cjs:runInvocation` (738–745) already uses shell-free detached POSIX spawn. `processGroupAlive` (392–400), `terminateChild` (402–439), `checkProcessCleanup` (148–167) cover Darwin through existing non-Windows branch. `finishSuccess` (815–845) also terminates residual group and refuses success unless cleanup confirmed.
- `state-human.cjs:observeTerminalDecision` (11–60) already uses stderr TTY + `/dev/tty` read/write descriptors + `isatty`, exact nonce challenge and abort cleanup on POSIX; Windows delegates separately.
- `isolated-workspace.cjs:rootFor/assertRoot/createWorkspace/verifyWorkspace/cleanupWorkspace/safeRemoveTree` currently demand literal canonical, non-symlink roots and use path-based recursive cleanup; Darwin root aliases require narrow integration with storage report, not weaker global checks.
- `windows-platform.cjs:queryProcessCreationToken/getWindowsProcessIdentity/checkWindowsProcessStatus` (225–299) already use decimal Windows creation token and conservative unknown. Reuse its dispatch *pattern*, not PowerShell implementation or platform framework.

## Mechanism decision: shared, packaged native bridge

Choose one small **C Node-API addon**, shared with Darwin storage, not a separate executable/invoker or npm FFI framework. Agreed bridge paths with storage designer:
- JS: `lib/advisor/darwin-platform.cjs`; native source: `lib/advisor/native/darwin/advisor-native.c`.
- Assets: `lib/advisor/native/darwin/prebuilt/darwin-{arm64,x64}/advisor-native.node`; bridge contract ABI constant `1` (distinct from Node-API version).
- Synchronous export `processSnapshot(pid)` → `{kind:'present',start:string}`, `{kind:'missing'}` or `{kind:'unknown'}`. No BSD-state classification, fd/path process observation or shell call.
- JS loads only package-relative, architecture-matched trusted artifact; Linux/Windows never load it. Native calls link system libproc; no downloaded library, root privilege, runtime source compilation, `ps` fallback or guessed alternate asset.

**Selected after parent review: one SDK-declared `proc_pid_rusage(pid, RUSAGE_INFO_V0, (rusage_info_t *)&info)` call**, using zero-initialized SDK `struct rusage_info_v0`. Libproc documents live-or-zombie support and 0 success/-1 errno; kernel holds one referenced process/zombie while checking security and obtaining its resource snapshot [S1,S2]. No second BSD-status lookup; avoid copied private `PROC_PIDT_BSDINFOWITHUNIQID` declarations and stronger unique-incarnation machinery.
`ri_proc_start_abstime` is uint64. Kernel obtains it from `p_stats->ps_start`; fork code explicitly copies original `ps_start` for exec and initializes a new process with `microtime_with_abstime` [S3,S4,S5]. Emit positive start as exact decimal in C, at most 20 digits; no JS Number, time scaling, truncation or hash. Public `{pid,start}` still accepts 1–32 digits, without schema change.
Matching token conservatively means live, even for a zombie until reaped. Confirmed ESRCH or changed valid start means dead; API/permission uncertainty means unknown. Monotonic start avoids wall-clock rollback; finite clock resolution/token reuse across boots may conservatively retain locks. No mathematically exact incarnation/global uniqueness claim or new boot/schema field; this bounded start-token model aligns with existing Linux start ticks.

**Compatibility caveat:** SDK declaration avoids a copied private-header flavor/layout, not all libproc risk. `libproc.h` warns interfaces may change [S1]. Pin reviewed source revision, SDK/publicly declared struct layout, availability/deployment range and license obligations; compile-time sizes/offsets for both architectures. Unsupported V0/invalid start fails closed; never downgrade to wall-clock/PID-only.
Why not `ps -o lstart`? Apple formats only seconds via locale-dependent `%c`; same-second reuse is indistinguishable [S6]. Kill-zero establishes existence/permission, not durable identity [S7]. A second BSD-status lookup creates needless mixed-observation risks; conservative matching-token retention needs no such lookup.

## Identity/status semantics and recovery

- `getDarwinProcessIdentity(pid=process.pid)` wraps snapshot, returns existing `{pid,start}` shape. For failed self-observation, return null start; Darwin lock acquisition must reject before writing a new state/history lock (`STATE_IO_FAILED` / `AUDIT_DEGRADED` respectively), avoiding unrecoverable newly-created null-start locks. Existing malformed/null-start records remain conservative.
- `checkDarwinProcessStatus(identity)` validates existing exact identity shape first. Null start → unknown, including when PID happens to be absent. Do not invent fallback token from Date.now, command name, PID or controller uptime.
- Native sets `errno=0`, captures immediately. Return 0 plus positive uint64 start → present; -1 with ESRCH → missing; EPERM/EACCES, unsupported flavor, other errors/unexpected return or invalid start → unknown [S1,S2]. API returns status, not byte count: no short/oversized-result-count claim. SDK layout assertions and token validation are required. Exceptions/load failures normalize to unknown in status, operational error in required self-identity creation.
- Valid non-null identity: missing → dead; present with different token → dead; matching token → conservatively live, including zombie until reaped. Unknown → unknown. Do not inspect BSD flags/status or claim immediate zombie-death classification.
- `processStatus` is an instantaneous observation, not an OS process handle; it performs **no signaling**. One referenced resource observation prevents mixed PID start/status reads. A matching owner can exit afterward: conservative live/unknown blocks until a subsequent request, never unsafe recovery.
- Reuse state acquire guard/stat/token/dead-owner recheck and history's existing lock algorithm via descriptor operations from storage contract. No TTL or permission-error reaping; no automatic state-recovery-guard cleanup. Pending-operation recovery continues using the same tri-state result and existing human gate.

## POSIX process groups: reuse, not a new supervisor

- Reuse `detached:true`, `shell:false`, pipes, TERM → bounded grace → KILL, close wait and leader/group absence checks. Node documents detached POSIX child as new session/process-group leader [S8]; Apple documents negative PID targeting that group and `ESRCH` versus `EPERM` [S7].
- Kill-zero remains appropriate **only as cleanup occupancy check**, not durable identity. Group permission/error uncertainty must keep outcome unconfirmed; the current functions already treat non-ESRCH uncertainty as potentially alive. Failed group signal falling back to leader kill never proves descendants removed.
- No extra Darwin group cleanup algorithm needed for ordinary cooperating backends. Never persist/replay a PID/PGID later for cleanup. Group identifiers can be reused after a group disappears; separate lookup and signal are not atomic. Existing POSIX logic cannot be described as PID-handle-safe, and libproc lock tokens alone do not repair that limitation.
- Children escaping session/group (`setsid`/`setpgid`) are outside this existing cooperative supervision boundary. No claim of Windows Job-style containment, hostile-process sandbox, or comprehensive descendant-tree absence. Altering Linux's cleanup guarantee or adding a Darwin native spawn supervisor is out of this dispatch change; any stronger guarantee needs explicit architecture scope, not an implicit fallback.

## Human gate and canonical roots

- Keep `/dev/tty` gate unchanged on Darwin. Apple tty source recognizes controlling-terminal operations and `setsid` disconnects it [S9]. Node launcher must remain attached to caller terminal; backend detached spawn is separate. No stdin JSON authorization fallback, GUI prompt, automatic controlling-terminal assignment, or removal of stderr TTY prerequisite.
- Missing controlling terminal, redirected stderr, non-TTY descriptor, wrong nonce or permission failure → existing `HUMAN_EVENT_REQUIRED`; abort → `CANCELLED`; retain final fd/stream cleanup and cooperative same-user caveat. Native addon is unnecessary here.
- Apple root hierarchy explicitly creates root-owned `/var → private/var`, `/tmp → private/tmp` [S10]. macOS TMPDIR commonly traverses `/var`; rejecting all literal-vs-realpath differences makes ordinary roots unusable. Do not generalize that to arbitrary HOME/project symlinks.
- Adopt storage's native `openRoot` canonicalization policy: permit **only exact verified root-owned Apple aliases** `/var` and `/tmp`; canonical `/private/...` chain opened component-wise nofollow. Reject custom HOME/project/temp symlinks, replaced aliases, dot segments and unsafe roots; preserve explicit HOME authority, never fallback from invalid HOME.
- Darwin-only `stateLocation` canonical project root controls projectId hash; baseline/history/launcher/workspace must use same spelling. Root aliases must not create duplicate identities. `rootFor/assertRoot/createWorkspace` use returned canonical temp path; `verifyWorkspace/cleanupWorkspace` retain canonical root and pinned identities.
- Workspace removal must use storage bridge descriptor-relative traversal/checks, not broadly relax `assertRoot` then reuse path-based `safeRemoveTree`. Preserve symlink, cross-device and replacement refusal; unknown cleanup remains `CLEANUP_UNCONFIRMED`. Linux/Windows paths unchanged. No `/dev/fd` substitution for Linux pinning.

## Packaging prerequisites and proposed acceptance (not executed)

- Maintainer-approved source snapshot, minimum macOS/SDK range, supported Node baseline, reviewed SDK process API/layout/license integration and trusted arm64/x64 artifacts with source/compiler/SDK/architecture/Node-API/digest provenance are required. C Node-API avoids npm runtime dependency and V8/libuv ABI coupling; Node-API does **not** guarantee libproc compatibility [S11].
- User approved controlled macOS **build-only** compilation/linking/static inspection of both artifacts, not addon/advisor execution/tests/probes. Planning creates no binaries. Missing approved Apple SDK/toolchain producer blocks future real-artifact delivery, not plan authoring; no source-only completion claim.
- Packaging must explicitly include source and `.node` assets, content-hash inventories/projections, private-HOME test fixtures and transferred candidate; installer must not auto-build/download code. Storage report owns exact generator/inventory adjustments.
- Future **Linux-only JS logic fixtures/static review**: exact two-key wire shape; uint64 high-bit/20-digit precision and existing 32-digit validator boundary; changed start for same PID; preserved exec token; matching-token conservative retention including zombies; ESRCH/EPERM/EACCES/unknown/invalid result; null/malformed identity; self failure before lock write; replaced lock/two reapers/pending recovery. Observation fixtures are contract logic evidence, **not Darwin runtime evidence**.
- Future Linux POSIX regressions: successful leader with surviving group member; TERM/KILL/cancellation paths; permission/error uncertainty; no success with unconfirmed cleanup; TTY gate wrong nonce/no TTY/abort. Run existing Linux/Windows regressions only in parent-authorized implementation gates; no algorithm-wide refactor.
- Static Darwin review: SDK V0 sizes/offsets, 0/-1 errno contract, positive uint64 decimal encoding, one referenced call/no separate BSD status, package-relative artifact load, no runtime build/fallback, aliases/native workspace cleanup and unchanged provider/wire semantics. **macOS implementation present only after real assets/all integration; untested/unqualified**. Never list native runtime checks as passed.

## Primary sources

- [S1: Apple libproc header API warnings, live/zombie and 0/-1 errno contract](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h); [wrapper: one PROC_INFO_CALL_PIDRUSAGE forwarding call](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.c).
- [S2: Apple proc_info.c: referenced live/zombie proc, security and snapshot/release](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/proc_info.c#L3806-L3832).
- [S3: SDK resource.h: RUSAGE_INFO_V0 and uint64 start field](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/resource.h).
- [S4: Apple kern_fork.c: ps_start explicitly preserved across exec, new-process monotonic initialization](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_fork.c#L1122-L1130).
- [S5: Apple kern_resource.c: ps_start source, exact V0-size copyout and cached zombie snapshot](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_resource.c#L3404-L3460).
- [S6: Apple ps/print.c: lstarted uses tv_sec and %c](https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/print.c).
- [S7: Apple kill(2), negative PID and error semantics](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kill.2.html).
- [S8: Node detached POSIX session/group semantics](https://nodejs.org/api/child_process.html#optionsdetached).
- [S9: Apple tty(4) controlling terminal/setsid](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man4/tty.4).
- [S10: Apple files/Makefile root alias creation and ownership](https://github.com/apple-oss-distributions/files/blob/main/Makefile).
- [S11: Node-API ABI stability, external library limits, build prerequisites](https://nodejs.org/api/n-api.html#node-api).

## Blockers / unresolved questions

1. Which reviewed XNU revision, macOS deployment floor/compiler/SDK and trusted producer define both builds? SDK-declared V0 API/layout/availability and libproc's compatibility warning still require review; missing pins block future build gate, not this plan.
2. No native macOS execution evidence by user decision. Libproc/SDK behavior, loader/signing, actual terminal/group and APFS/firmlink handling remain unqualified; Linux fixtures/static review cannot remove that limitation.
3. Cross-boot/resolution token alias conservatively retains locks, with no global uniqueness assertion. Stronger cross-boot identity or hostile descendant containment requires separately authorized schema/supervisor design; no wall-clock/PID-only fallback.
