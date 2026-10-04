# Phase 04 — Darwin native build

## Context Links
- [Architecture contract](architecture-contract.md), [approved Darwin runtime contract](darwin-runtime-contract.md).
- [Storage bridge exports and invariants](research/macos-storage-design.md#exact-bridge-contract-for-phase-writers), [SDK-declared process mechanism](research/macos-process-design.md#mechanism-decision-shared-packaged-native-bridge).
- [Repository baseline](research/repository-baseline.md), [qualification research](research/platform-qualification.md).
- [Acceptance matrix](acceptance-matrix.md): this phase owns D01/D02 and its D04/D06/P01 interface/package contribution; static/build-only evidence never becomes Darwin runtime evidence.
- Repository authorities: [package scripts](../../package.json), [controller validator](../../src/manifests/controller.ts), [inventory generator](../../scripts/generate-controller-inventory.mjs).

## Overview
- Date: 2026-10-04. Priority: P1. Implementation: complete. Review: complete.
- Dependency: Phase 03 Linux launch verification accepted; Phase 01 approved source/ownership contract retained.
- Produce the actual bounded Darwin addon, loader, licensed source, two architecture binaries and complete package closure. Phase 05 consumes these real artifacts, not source-only promises.
- Future controlled macOS compilation/linking/static inspection is authorized. Addon/controller execution, `require()` probes, tests and advisor/provider probes on macOS are not authorized. All commands below are future implementation instructions; none ran during planning.

## Key Insights
- Node filesystem path APIs cannot preserve descriptor-relative mutations here; `/dev/fd`, shell helpers and guard removal are not replacements.
- One C Node-API bridge serves storage and process identity. Bridge ABI `1` and Node-API `8` are different contracts; no V8/libuv ABI dependency.
- One SDK-declared `proc_pid_rusage` V0 snapshot supplies a monotonic process-start token without copied private flavor structs or a separate BSD-status lookup. Reviewed source/layout/license/SDK pins remain required; libproc's general interface-change warning still applies.
- Closure validation currently decodes every file as UTF-8; `.node` bytes require exact classification before decoding. Existing embedded installer inventories also need migration.
- The source manifest currently has eight targets including user-owned VSCode work. Discover the approved current target set; neither target count nor native closure size is frozen at a historical value.

## Requirements
- Entry: nominate controlled Apple build producer; pin reviewed Apple source revision, SDK `rusage_info_v0` declarations/sizes/offsets, RUSAGE_INFO_V0 availability and license obligations. Confirm `proc_pid_rusage` linkage, SDK availability and both architecture layouts; no copied private-header ABI.
- Pin compiler/Xcode toolchain, SDK version/digest, trusted Node header version/digest and minimum deployment target. Proposed macOS 11 floor is subject to this review and the selected Node runtime's actual floor; do not publish it as guaranteed.
- Stop implementation gate if SDK/API/deployment review cannot satisfy the contract. Missing producer, compilation failure, missing binary or failed static inspection blocks Phase 04; no downgrade to wall-clock/PID-only identity.
- Build arm64 and x64 from the same approved C/header input digest. Ship both immutable `.node` files and bounded JSON provenance, with source and licenses in the owned closure.
- Linux/Windows never load the native addon. Darwin rejects missing/unsupported architecture, load failure or wrong bridge ABI; no alternate binary, compiler, installer hook, download or search-path fallback.
- Preserve strict request schemas, public errors, limits, provider/retry policy and the explicit Node outer launcher.

## Architecture
### Owned boundary
- `darwin-platform.cjs` is the Darwin-only loader and bounded synchronous adapter. Use explicit literal package-relative imports for both binaries inside architecture branches; never an environment-derived module path.
- `advisor-native.c` registers exports; bounded `storage.c` and `process.c` contain OS implementations; `advisor-native.h` owns reviewed internal/ABI declarations. Split further only if needed for readable bounded modules, then explicitly inventory every added source/header/license asset.
- All exports synchronous. Addon-owned opaque capabilities retain CLOEXEC descriptors, type, identity, parent/name links and closed state internally. Reject foreign/closed objects and non-leaf names: empty, NUL, `/`, `.` or `..`. `close` is idempotent; all other stale-handle operations reject.
- Stats: `{type,dev,ino,nlink,size,mtimeNs}`, all numeric identity/size/time fields BigInt. Adapter may expose existing `isFile/isDirectory/isSymbolicLink` shape. ENOENT alone permits missing/null; other errno remains an internal failure.

### Exact storage exports
| Export | Required implementation |
|---|---|
| `abiVersion` | Literal `1`; loader rejects incompatible interface. |
| `openRoot(absoluteDirectory)` | Return `{directory,canonicalPath}`; walk from `/` with `openat` directory/nofollow/CLOEXEC, entry/handle identity checks and narrowly verified Apple root aliases. |
| `openDirectory(parent,leaf,create)` | Descriptor-relative directory open; optional `mkdirat`, parent sync, verified EEXIST reopen; retain parent. Null only missing with create=false. Capability exposes immutable creation provenance `created`: true only after this call's successful mkdirat, never EEXIST adoption; workspace requires true. |
| `verifyChain(directory)` | Check pinned parent-entry identities and root/alias chain before/after sensitive operations. Changed or missing ancestor fails. |
| `statEntry(directory,leaf)` / `statHandle(file)` | `fstatat(AT_SYMLINK_NOFOLLOW)` / `fstat`; no following final symlink. |
| `openRegular(directory,leaf,maxBytes)` | Nofollow/nonblocking open; unchanged initial/opened regular+nlink1 stats; reject oversize before reading. |
| `readInto(file,buffer,offset,length,position)` | Checked ranges and bounded `pread` directly into supplied Buffer; no intermediate copy. Caller handles short reads/EOF and final stats. |
| `writeExclusive(directory,leaf,bytes)` | `openat(CREAT|EXCL|NOFOLLOW)`, full bounded writes, file fsync, regular+nlink1/entry checks; return stat. |
| `commit(directory,tempLeaf,tempStat,targetLeaf,expected)` | `expected=null` means absent; otherwise `{stat,bytes}`. Verify chain/temp, bounded target stat+bytes; conflict on mismatch. `renameatx_np(RENAME_EXCL)` create; `renameat` replacement; parent sync and final identity check. |
| `removeOwned(directory,leaf,expectedStat)` | Verify unchanged regular+nlink1 then `unlinkat`; parent sync; changed ownership fails. |
| `list(directory,maxEntries)` | Bounded `readdir` via `fdopendir` on independently owned CLOEXEC descriptor; no d_type trust or accidental capability closure. |
| `removeEmptyDirectory(parent,leaf,expectedIdentity)` | Verify identity then `unlinkat(AT_REMOVEDIR)` and parent sync; retain nonempty; never report uncertain deletion as success. |
| `sync(directory)` / `close(capability)` | Descriptor fsync / deterministic owned closure; finalizers only leak protection. |

### Exact process export
- `processSnapshot(pid)` returns `{kind:'present',start:string}`, `{kind:'missing'}` or `{kind:'unknown'}`. It does not classify BSD state or expose a process signaling handle.
- One SDK-declared `proc_pid_rusage(pid, RUSAGE_INFO_V0, (rusage_info_t *)&info)` call fills zero-initialized `struct rusage_info_v0`. Apple references a live process or zombie through that observation; start comes from `ps_start`, explicitly preserved across exec. Use compile-time SDK size/offset assertions for both architectures.
- Require positive `ri_proc_start_abstime` uint64 and emit its exact decimal representation directly in C: at most 20 digits, no Number, scaling, truncation or hash. Existing public validator still accepts 1–32 digits; no wire/schema migration.
- Clear errno before call and capture immediately. Return 0 plus valid start => present; -1+ESRCH => missing; EPERM/EACCES, unsupported flavor, unexpected return/errno or invalid start => unknown. This API returns status, not byte count: do not invent a short-result-size check. No BSD-state second lookup, `ps`, kill-zero identity or wall-clock fallback.
- Same token => conservatively live, including zombie until reaped; missing/different valid token => dead. Token resolution/cross-boot alias can conservatively retain a lock; no exact incarnation/global uniqueness claim. SDK/source provenance review remains necessary despite avoiding copied private structs.

### Canonicalization, commit and durability
- Permit only first-component `/var -> private/var` and `/tmp -> private/tmp`, verified from pinned `/` with exact readlink target, root ownership, trusted root entry/permissions and stable identity. Open `/private/...` nofollow independently and revalidate alias/root. Reject every custom symlink/unsafe component; no case-folding/Unicode normalization.
- Creation never overwrites. Unsupported exclusive rename/sync fails closed; no overwrite retry. Replacement is lock-serialized stat+byte expectation then rename, not hostile-same-user kernel CAS.
- Match existing file-before-parent fsync ordering, not new hardware power-loss guarantees. Errors after rename/sync may leave changed disk; do not fabricate rollback or success.

## Related Code Files
Paths below are exact repo-relative authoring/output paths; new files remain proposed until implementation.

| Action | Path(s) | Purpose |
|---|---|---|
| Create | `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs` | Darwin loader, stat/error adapters and process identity/status wrappers. |
| Create | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.c` | Node-API registration. |
| Create | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/storage.c` | Descriptor storage and canonical roots. |
| Create | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/process.c` | Single-snapshot libproc identity. |
| Create | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.h` | Internal types, SDK layout assertions and applicable license notices; no copied private process ABI. |
| Generated | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node` | Real arm64 output. |
| Generated | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node` | Real x64 output. |
| Generated | `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/prebuilt/artifacts.json` | Build pins/input-output provenance; never handwritten binary hashes. |
| Create | `scripts/build-darwin-advisor-native.mjs` | Proposed explicit build-only authority; no runtime/install invocation. |
| Modify | `scripts/generate-controller-inventory.mjs` | Exact file/kind inventory; generate TS plus both embedded installer inventory blocks. |
| Generated | `src/manifests/controller-inventory.generated.ts` | Authoritative complete closure/kinds/count; do not hand-edit. |
| Modify | `src/manifests/controller.ts` | Classify exact bytes before UTF-8; literal import/provenance validation. |
| Modify/generated blocks | `install.sh`, `install.ps1` | Generated complete inventories; preserve raw-byte closure digest checks. |
| Verify-only; modify only concrete omission | `scripts/release/runtime-closure.cjs`, `scripts/release/pack-inventory.cjs`, `scripts/prepare-release-assets.cjs`, `package.json` | Delegated controller validation, byte-preserving archive/package inclusion. No new release platform. |
| Modify | `tests/manifests/distribution-manifests.test.mjs`, `tests/installers/fixtures/fixture-records.mjs` | Behavior-level classification/closure fixtures, count from generated authority, typed binary fixtures. |
| Verify-only; extend behavior if needed | `tests/distribution/private-release-artifacts.test.mjs`, `tests/installers/fixtures/release-fixture-shared-helpers.mjs` | Complete packaged file sets and raw hashes. |
| Generated later | `.evcrate/build-manifest.json`, `.evcrate/build-manifest-antigravity.json`, `.evcrate/build-manifest-claude.json`, `.evcrate/build-manifest-codex.json`, `.evcrate/build-manifest-copilot.json`, `.evcrate/build-manifest-gemini.json`, `.evcrate/build-manifest-omp.json`, `.evcrate/build-manifest-pi.json`; proposed `.evcrate/build-manifest-vscode.json` if still configured | Recompute native-inclusive hashes through current generator/current target authority, never manual edits or a historical target-count assumption. |

## Implementation Steps
1. **Enter build authority gate.** Record approved producer and source snapshot. Review/pin Apple revision/license/SDK layout and selected compiler/Node headers/deployment floor before native authoring. Inspect toolchain with `xcrun --find clang`, `xcrun --show-sdk-path`, `xcrun --show-sdk-version`; these are build metadata inspection, not OS runtime probes. Missing/unsupported prerequisites stop this future phase, not plan authoring.
2. **Implement native units.** Storage owner writes `storage.c`; process owner writes `process.c`. They may work in parallel only after header/export contract freezes. Integration owner alone owns `advisor-native.c`, `advisor-native.h` and loader. All workers skip builds/tests/lint/formatters; no Phase 05 state-io edits yet.
3. **Implement loader.** Literal arm64/x64 `.node` requires under Darwin-only selection; verify Node-API availability, supported arch and bridge ABI. Preserve internal errno classification and existing public routing error boundaries. Define report-named `getDarwinProcessIdentity`/`checkDarwinProcessStatus` wrappers with required-self failure and conservative status handling; no logging leak or fallback.
4. **Implement proposed build script.** `node scripts/build-darwin-advisor-native.mjs` is a **proposed command, unavailable until this script exists**. Script uses the entry-approved fixed toolchain/header/SDK pins, invokes compiler with argv arrays, Node-API=8 and approved deployment target, builds both architectures against system libSystem/libproc, and stages outputs only after both succeed. No auto-install/download or post-build `require`, advisor invocation or tests. Capture exact compiler argv; do not guess unavailable SDK flags.
5. **Build-only producer gate, parent/operator only.** Run that script on the controlled Apple producer. Statically inspect both Mach-O architectures, deployment/load commands, dependencies and Node-API symbols with the selected toolchain's `file`, `lipo -info`, `otool -l`, `otool -L` and `nm` commands. Review relocations/system paths and distribution signing constraints without loading either addon. A host-side Node build orchestrator is allowed; executing addon initialization is not.
6. **Bind provenance.** Emit bounded `artifacts.json` with reviewed Apple source revision/SDK layout/license pins, compiler/SDK/deployment target, Node header digest/version, Node-API=8, bridge ABI=1, all C/header input digests and aggregate digest, architecture, output size/SHA-256. Keep credentials/machine-private paths out. Parent checks recorded inputs match packaged source and both outputs; modification requires rebuilding, never relabeling stale bytes.
7. **Integrate exact closure.** Extend inventory generator with loader, selected C/header/license assets, JSON and two binaries; generate installer blocks from the same list. `npm run generate:inventory` is existing authority. Classify only exact enumerated binaries before fatal UTF-8 decode; C/header/JSON remain validated text data, never JS imports. Only loader's two literal native imports are permitted; other imports retain existing closure/builtin rules. Validate bounded provenance and raw artifact hashes without `require()`.
8. **Complete transports.** Audit delegated release validators, npm files whitelist, archive writers and install inventories; use raw byte hashing/copy throughout. Keep regular-file/no-symlink, unexpected-file rejection, exact dependency closure and byte-identical projection. No broad `.node`/`.c` extension exemption, installer auto-build or new macOS release/installer promise.
9. **Parent Linux phase-end gate only.** After all native/source/inventory edits land: `npm run build`, `npm run test:primitives`, `npm run release:check`, `npm run test:release`, then `npm run test:advisor-controller`. Behavior fixtures cover allowed binary bytes, missing/tampered/unlisted assets, invalid text/imports and complete inventory; replace frozen-36 assertions with generated list/set/count, not another magic count. No permanent source-string/wiring/mock-echo tests. Phase 06 owns full regenerated projection/package qualification. None of these gates qualifies Darwin runtime.

## Todo List
- [x] Approve producer and reviewed Apple source/SDK/layout/toolchain/header/deployment pins.
- [x] Complete native implementations and literal Darwin loader; freeze bridge interface.
- [x] Compile both real binaries; record inspect-only evidence and source-bound provenance.
- [x] Migrate exact generator/TS/install inventory/closure classification and behavior fixtures.
- [x] Parent accept Linux regression/static native/package review evidence; hand real artifacts to Phase 05.

## Success Criteria
- Complete native source, reviewed SDK layout/license integration, both actual compiled artifacts and reproducible provenance exist; no stubs, runtime compiler/download or absent-helper success.
- Generated closure includes every selected source/header/JSON/binary, with raw hashes and generated count. Validators/import policy reject unrelated native assets; Linux/Windows do not load the helper.
- Build receipt distinguishes **compiled/link-inspected** from **runtime-tested**. Phase 04 alone is not macOS implementation completion; Phase 05 callsites remain required. macOS remains untested/unqualified.

## Risk Assessment
- SDK/libproc compatibility drift or unavailable toolchain: stop and revise approved design; never wall-clock/PID fallback. Node-API stability does not settle libproc compatibility; general header warning remains.
- Compilation/static inspection cannot establish APFS exclusive rename/directory fsync/alias behavior or addon loading/signing. Runtime remains deliberately unverified; operations fail closed.
- Stale or swapped output/source, inventory drift and UTF-8 corruption: bind reviewed snapshot to both artifacts, generated exact closure and raw-byte hashes. No fixed 36-file claim.

## Security Considerations
- Least privilege, CLOEXEC ownership, checked Buffer ranges and bounded loops; no arbitrary native library paths, dynamic downloads or secret-bearing provenance.
- Pin parents/entries and narrow trusted aliases; reject links/hardlinked managed files. Explicit close in finally; finalizers are not normal lifecycle.
- Preserve cooperative CAS/fsync limits honestly; uncertain process or cleanup cannot authorize mutation/reaping or success.

## Next Steps
- Phase 05 starts only after real-artifact/interface gate passes. Its integration owner consumes these files; changes to native source require new paired builds/provenance before final packaging.
- Phase 06 later qualifies the complete Linux candidate; Phase 07 transfers that exact immutable bundle to native Windows. Neither establishes macOS runtime evidence.

## Unresolved Questions
- Execution prerequisites: controlled Apple producer identity and exact reviewed source/SDK/layout/compiler/Node-header/deployment pins remain to be supplied/approved at entry.
- Actual libproc/filesystem/addon-signing behavior remains untested by user decision; no hidden macOS test gate or reduced source-only deliverable.
