# Darwin runtime implementation contract (proposed)

Status: design for later implementation. No macOS runtime/build/test executed during planning.

## Confirmed user decisions

- Actual advisor behavior on macOS, not only a launcher that starts then rejects state operations.
- No macOS tests, live advisor/provider probes, or runtime qualification.
- User explicitly approved **macOS build-only packaging** of the necessary native helper for arm64/x64. Compilation/linking/artifact inspection are allowed future work; executing the addon/controller/tests on macOS is not.
- Outer entrypoint always `node <absolute evcrate-advisor> [args]`; native support is internal, analogous in purpose to existing Windows native support, never an alternative launcher.

## Why this is a separate implementation phase

`state-io.cjs`, `state-baseline.cjs`, `history-store.cjs`, and `history-query.cjs` depend on Linux `/proc/self/fd`; state/history explicitly reject Darwin. Node's public path-based filesystem calls cannot substitute descriptor-relative mutations. Removing guards or rewriting `/proc` to `/dev/fd` would falsely advertise support and risk traversal races.

Selected design: one narrowly scoped C Node-API addon loaded only on Darwin. Preserve Linux descriptor-path algorithms and Windows bridge unchanged. No general platform framework, npm FFI runtime, native outer launcher, runtime compiler, source download or catch-and-fallback behavior.

## Produced interface and files

Detailed storage semantics: [storage research](research/macos-storage-design.md#exact-bridge-contract-for-phase-writers). Detailed process semantics: [process research](research/macos-process-design.md#mechanism-decision-shared-packaged-native-bridge). These reports are design evidence; this contract supersedes their older request for build authorization.

Proposed new files:
- `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs`: Darwin loader, error mapping and bounded adapter functions.
- `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.c`: Node-API exports; split into `storage.c`, `process.c`, and `advisor-native.h` in the same directory if needed for maintainable modules.
- `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node`.
- `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node`.
- `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/artifacts.json`: bounded provenance record.
- `scripts/build-darwin-advisor-native.mjs`: explicit build-authority script; never invoked at runtime/install.

Bridge ABI `1`; Node-API version `8` maximum for selected APIs. Explicit literal imports for both architecture-specific binaries, no path assembled from environment values. Reject unsupported architecture/ABI or missing artifact without loading another binary. Preserve existing controller error envelopes; native stderr/logs do not leak across public boundary.

Storage exports: `openRoot`, `openDirectory`, `verifyChain`, `statEntry`, `statHandle`, `openRegular`, `readInto`, `writeExclusive`, `commit`, `removeOwned`, `list`, `removeEmptyDirectory`, `sync`, `close`. Capability objects own CLOEXEC fds; reject foreign/closed handles and non-leaf names. Identity/stat fields remain BigInt. Bounded pread/write loops, no unnecessary intermediate buffer copies. Deterministic closure in finally; finalizers only leak protection.

`openDirectory` retains immutable creation provenance: true only after its own successful `mkdirat`, false on verified EEXIST reopen. Managed directory traversal may reopen existing directories; temporary workspace creation requires true and must never adopt or delete an existing foreign directory.

Creation uses descriptor-relative exclusive create or `renameatx_np(RENAME_EXCL)` as appropriate; replacement uses lock-serialized expected-stat/bytes check then descriptor-relative rename. This preserves the existing cooperative CAS guarantee; do not claim a kernel-level hostile-same-user conditional rename. Unsupported no-replace/sync operations fail closed. Keep existing file/parent fsync strength, with no new hardware power-loss promise.

Every Darwin state/baseline/history/export/prune/workspace filesystem operation must use the proper pinned capability, not fall through into Linux fd-path strings or reopen unchecked logical paths. Preserve baseline byte limits, stale evidence checks, replay/ledger semantics, history quotas/redaction, pending-record retention, lock token ownership, and unknown-cleanup failure.

## Darwin process identity

`processSnapshot(pid)` returns present with an opaque decimal start token, missing, or unknown. Use one SDK-declared `proc_pid_rusage(pid, RUSAGE_INFO_V0, ...)` call with a zero-initialized SDK struct. Convert `ri_proc_start_abstime` directly from uint64 to decimal (at most 20 digits), preserving the existing public `{pid,start}` wire shape and 1–32-digit limit. Apple source preserves this monotonic start across exec. Matching token => conservative live, including zombies until reaped; differing token or ESRCH => dead; other errors/invalid token => unknown. Required self-identity must succeed before new lock or pending writes. No PID-only, wall-clock, `ps`, TTL, second-lookup or interpreter fallback.

**Compatibility boundary:** pin reviewed Apple source, SDK declarations/layout, compiler and deployment target; libproc's header still warns about interface stability. The selected SDK-declared V0 call avoids copied private flavor/struct layouts and unnecessary 128-bit incarnation packing. Its return contract is 0/-1, not a byte count; do not claim short-result detection. A bounded start token is comparable to the existing Linux start-ticks model, not a globally unique process handle. Token collisions conservatively retain locks; matching zombies may delay recovery until reaped. See [process research](research/macos-process-design.md) for kernel references, exec-preservation evidence and rejected alternatives.

Existing POSIX process-group and `/dev/tty` behavior may be reused, with its current cooperative-process limitations. Lock identity is not an atomic PID/PGID signaling handle. Preserve current Linux/Windows guarantees rather than claiming Windows Job-style containment on Darwin.

## Canonical roots

A single Darwin root canonicalizer may recognize exact Apple `/var -> private/var` and `/tmp -> private/tmp` aliases only after pinned root-relative verification of target, trusted system entry and stable identity. Reject custom symlink roots/ancestors and unsafe components. Canonical project spelling must be shared by controller audit, state, baseline and history hashing; do not case-fold or Unicode-normalize it. Preserve explicit invalid HOME failure. Apply the same narrow policy to temporary workspace roots and export parents. Do not casually add owner/mode restrictions to general user-owned files; verified system-alias exceptions are distinct from the removed global private-mode policy.

## Build-only provenance and integration gates

- Proposed minimum deployment target: macOS 11, subject to Phase 04 SDK/API availability review and the selected Node version's actual minimum. Do not publish an unsupported version promise; record exact deployment target in provenance.
- Controlled Apple toolchain producer builds both architectures from the same approved C source/header digest. Record compiler, SDK, deployment target, Node-header digest, Node-API/bridge ABI, architecture, input source digest, output size and SHA-256.
- Node build orchestration on macOS is permitted; **do not `require` the built addon, invoke advisor, run tests, or probe OS behavior**. Static binary inspection is permitted. If compiler/SDK unavailable, artifact production is blocked; source-only files are not implementation completion.
- Ship both immutable binaries within the shared closure. No new top-level release asset set or macOS installer promise is necessary; existing package/distribution transports carry the bytes.
- Explicitly classify exact native assets before UTF-8 decoding in `src/manifests/controller.ts` and applicable release/install validators. Keep literal dependency closure, kind/no-symlink checks, inventory count authority, hashes and byte-identical publication. Generated inventory must come from its generator.
- Run Linux regressions and static native integration review, then qualify the identical fully packaged candidate on Windows. Those checks cannot establish Darwin runtime behavior.

## Completion labels

Only real source + both built packaged artifacts + every integrated Darwin callsite can be described as **macOS implementation present, untested/unqualified**. A source scaffold, removed OS guard, unavailable addon, or permanently unknown self-identity is incomplete. Future macOS testing requires separate user authorization and is not a hidden final gate in this plan.

## Unresolved prerequisites

Controlled Apple build producer, exact approved SDK/compiler/Node-header pins and reviewed Apple process-API source revision; actual Darwin filesystem/process-API behavior remains unverified by decision. These are explicit Phase 04 entry conditions, not permission to omit the macOS deliverable.
