# macOS advisor storage: bounded implementation design

Status: proposed, report-only. No implementation, builds, probes, tests, lint, formatting, controller calls or publication performed. macOS remains **untested/unqualified**.
Scope: actual Darwin state/baseline/history behavior, not guard removal alone. Preserve Linux/Windows algorithms, public protocols, schemas, limits and provider policy.

## Evidence and concrete blockers

Paths below are relative to `.evcrate/source/.evcrate/bin/lib/advisor/` unless stated otherwise.

| File/function | Observed blocker or required integration |
|---|---|
| `state-io.cjs:stateLocation` (75–119) | 77 rejects Darwin; project/home `chain` rejects every symlink and requires textual `realpath` equality. |
| `absolute/chain/stable` (45–74) | Lexical absolute validation is useful; canonical system-alias handling cannot be blanket `realpath` acceptance. |
| `openTask` (156–225) | Non-Windows branch creates/traverses via `/proc/self/fd`, then returns a synthetic descriptor path. |
| `readFile/writeExclusive/removeOwned` (226–292) | Final-file nofollow, regular-file/nlink checks, identity/stat stability; mutation paths depend on pinned parents supplied by callers. |
| `acquire/transactState` (293–413) | Locks/reaper guard, byte+stat comparison, temporary creation, no-replace hardlink create or replacement rename, parent fsync, owned cleanup all need Darwin pinned operations. |
| `proc/processIdentity/processStatus` (121–153) | Linux `/proc` start identity; Darwin currently yields null/unknown. Storage consumes the process-design report's real implementation. |
| `state-baseline.cjs:rootChain` (67–85) | 73 hard-rejects non-Linux POSIX. |
| `captureFile/rehashFile/captureBaseline` (39–62,93–211,379–409) | Traversal uses `/proc/self/fd`; final observation recheck/rehash uses logical absolute paths. Both passes need Darwin descriptor traversal, including missing-path observations. |
| `history-store.cjs:historyContext` (51–76) | 52 rejects Darwin; same canonical project/home issue. |
| `openHistoryRoot/openConsultationDir` (78–164,241–359) | Every POSIX directory capability is represented as a `/proc/self/fd` string. |
| `acquireHistoryLock/withHistoryLock` (166–239) | Exclusive lock/recovery ownership and process-status checks need Darwin primitives; do not silently unify its recovery behavior with state locks. |
| `scanProjectRecords` (365–446) | Nested `readdir/lstat` and record reads need pinned Darwin traversal; quota includes temporary/stray file sizes. |
| `ensureProjectMetadata/recordStartedExecution/updateStartedAttempts/recordTerminalExecution/recordOutcome` | Metadata and record create/replace/cleanup/fsync branches all require explicit Darwin dispatch, not Linux fall-through. |
| `history-query.cjs:listHistory/getHistoryEntry/getHistoryMetrics` | Injected read function must read Darwin records safely, including scan-returned logical paths after scanner closure. |
| `exportHistory` (169–277) | Parent pinning is path-based; POSIX write uses `/proc/self/fd`. Preserve all-record collection, scope, redaction and exclusive destination semantics. |
| `history-prune.cjs:pruneOldestTerminalRecords/pruneHistory` (33–112,141–276) | Adjacent required caller: unlink/rmdir/readdir/fsync and explicit fd closure; must not bypass addon or double-close capabilities. |
| `src/manifests/controller.ts:closure` (21–59) | Fatal UTF-8 decoding occurs before asset classification; only JS/CJS and CS/PS1 allowed. A `.node` asset currently fails. |
| `validateRoot/controllerHashes/validateAdvisorControllerProjection` (60–103) | Inventory, exact regular-file closure, byte hashing and projection parity must include shipped native artifacts. |

Current invariants: `same` = dev+ino; `unchanged` = identity, regular type, nlink, size, mtimeNs; `regular` additionally requires nlink=1. State compares previous bytes before commit; Windows additionally passes identity+digest to its native writer. Preserve these rather than advertising a new transaction model.
Important bound: Linux replacement does a check followed by `renameSync`, and owned deletion does a check followed by `unlinkSync`. Neither is a kernel inode/content-conditioned CAS against an uncooperative same-user writer. Darwin can preserve this lock-serialized check-and-commit guarantee, **not manufacture stronger atomic CAS**. Directory pinning prevents following swapped ancestors, not arbitrary same-UID tampering with entries in an already writable directory.

## Recommendation: one shipped Darwin Node-API addon

Pure Node is insufficient for the existing descriptor-relative mutation boundary: documented `openSync`, `renameSync`, `linkSync`, `unlinkSync`, `mkdirSync` take paths, not directory fd+leaf pairs. File fstat/read/fsync is available, but an open fd is not a replacement for `openat/mkdirat/renameat/unlinkat`.
Do not substitute `/dev/fd`, use process-wide `chdir`, create shell helpers, accept all symlinks after `realpath`, add a database, or fetch/compile an addon during an advisor request.
Use Apple's descriptor-relative syscalls through a small C Node-API addon, shared with Darwin process identity. No third-party runtime dependency, external invoker or public protocol changes. Node-API ABI stability does not guarantee macOS/SDK ABI or filesystem behavior.

### Proposed owned paths and delivery

- JS loader/adapter: `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs`.
- Native source: `.evcrate/source/.evcrate/bin/lib/advisor/native/darwin/advisor-native.c`; split bounded storage/process implementation files there if needed, not a generic platform framework.
- Artifacts: `lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node` and `.../darwin-x64/advisor-native.node` under the same source controller root.
- Owned artifact identity file: `lib/advisor/native/darwin/prebuilt/artifacts.json` containing source digest, compiler/SDK/Node-header versions, deployment target, architecture and artifact SHA-256; build-authority script proposed at `scripts/build-darwin-advisor-native.mjs` (release build only).
- Loader uses explicit literal relative requires for the two artifacts inside Darwin-only branches; check ABI=1, Node-API compatibility and `process.arch`; no environment-selected library, search path or catch-and-fallback. Linux/Windows never load `.node`.
- Use C Node-API v8 or lower APIs sufficient for buffers/BigInt; no V8/libuv ABI dependency. System SDK/libSystem and process slice's libproc linkage only; trusted Node headers and Apple SDK required.
- Recommend x64+arm64, Node 22.19 baseline's macOS >=11 deployment baseline, subject to SDK symbol-availability review; newer supported Node versions still impose their own OS requirements.
- Ship both binaries as ordinary immutable controller assets; no install scripts, runtime builds or binary download. Author inventory in `scripts/generate-controller-inventory.mjs`, regenerate TS inventory through existing authority during implementation.
- In `controller.ts`, classify only explicitly enumerated native binaries before UTF-8 decoding; retain regular-file/no-symlink/hashing/parity checks. Treat owned C/JSON assets as explicit text data, not imported JS; no broad extension bypass. Extend literal closure classification narrowly to the two allowed `.node` imports; keep all other JS dependency restrictions.
- Projection/package/install/update/uninstall must preserve these bytes and use existing managed ownership; inspect packaging rules for binary transforms/exclusions. No new executable-bit requirement or installation into project roots.
- **Prerequisite:** owner-supplied trusted prebuilt artifacts with provenance. This assignment cannot produce them without a trusted release build. A separately authorized macOS compile is not a macOS test, but this plan must not silently authorize it. No source-only addon scaffold may be called enabled advisor behavior.

## Exact bridge contract for phase writers

All operations synchronous; export `abiVersion: 1`. Capabilities are addon-owned opaque JS objects with fd, type, identity, parent/name links and closed flag retained internally. Reject foreign/closed capabilities and invalid leaf names (`/`, NUL, empty, `.`/`..`); never expose a pathname masquerading as an fd. All descriptors CLOEXEC. Explicit close in `finally`, finalizer only leak protection; close idempotent, stale capability reuse rejected.
Return stat records `{type,dev,ino,nlink,size,mtimeNs}` with numeric identity/size/time fields as BigInt, not lossy Number. JS adapter supplies existing `isFile/isDirectory/isSymbolicLink` shape if shared checks need it. Return null only for genuine ENOENT; other errno survives internal error mapping.

| Export | Required semantics |
|---|---|
| `openRoot(absoluteDirectory)` | Canonical policy below; open `/`, then one component at a time with `openat(O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC)`, fstatat(NO_FOLLOW)/fstat identity checks; return `{directory,canonicalPath}`. |
| `openDirectory(parent,leaf,create)` | Check regular directory identity; optional mkdirat then parent fsync; tolerate EEXIST only after reopening/verifying directory; retain parent capability. Missing with create=false returns null. |
| `verifyChain(directory)` | Revalidate retained parent-entry identities and canonical root chain before/after sensitive work; fstatat must not follow links; changed/missing ancestor fails closed. |
| `statEntry(directory,leaf)` / `statHandle(file)` | lstat-equivalent fstatat(AT_SYMLINK_NOFOLLOW) and fstat snapshots; managed files require regular type+nlink1 in higher operations. |
| `openRegular(directory,leaf,maxBytes)` | Nofollow/nonblocking open; require initial/opened regular+nlink1 and unchanged stat; reject oversize before read; return file capability or null. |
| `readInto(file,buffer,offset,length,position)` | Bounded pread directly into existing Buffer, no intermediary copy; caller loops short reads, rejects unexpected EOF, verifies handle+entry stats afterward. |
| `writeExclusive(directory,leaf,bytes)` | openat CREAT|EXCL|NOFOLLOW, complete writes with bounded input, file fsync, regular+nlink1 and handle/entry identity checks; return stat. No overwrite. |
| `commit(directory,tempLeaf,tempStat,targetLeaf,expected)` | Expected=null means absent target; otherwise `{stat,bytes}`. Recheck chain, owned temp and target's bounded bytes/stat through pinned reads. Return conflict on expectation mismatch. Replace with renameat; create with renameatx_np(RENAME_EXCL). Parent fsync and final regular+nlink1/identity check. |
| `removeOwned(directory,leaf,expectedStat)` | Recheck unchanged regular+nlink1 entry; unlinkat leaf; parent fsync. Reject ownership changes, never unlink a logical reopened path. |
| `list(directory,maxEntries)` | fdopendir on CLOEXEC duplicated/opened directory descriptor; bounded readdir excluding dot entries, close iterator without closing the capability; entries not trusted by d_type alone. |
| `removeEmptyDirectory(parent,leaf,expectedIdentity)` | Verify directory identity, unlinkat(AT_REMOVEDIR), parent fsync; nonempty is retained, other uncertainty is not reported as deletion. |
| `sync(directory)` / `close(capability)` | fsync pinned descriptor / deterministic owned-fd closure. Unsupported fsync is failure, not success. |
| `processSnapshot(pid)` | Shared addon export; exact identity/status semantics owned by `macos-process-design.md`, consumed by existing `{pid,start}` lock records. |

Darwin create deliberately uses RENAME_EXCL, avoiding transient nlink=2 and Darwin linkat flag/filesystem caveats. Apple documents filesystem-dependent support: unsupported no-replace rename fails closed, never retries using overwrite rename. Linux hardlink create stays unchanged. Temp names remain crypto-random, same parent/filesystem; cleanup only with verified ownership. Commit errors after rename/sync cannot promise rollback or unchanged disk; retain existing error contracts, do not invent success.

## Canonical roots, /var and temporary directories

Apple's `files/Makefile` explicitly creates root-owned `/var -> private/var` and macOS `/tmp -> private/tmp`; this is source evidence, not an observation of a tested machine.
Native `openRoot` may expand **only these exact first-component system aliases**, after pinned root-relative lstat/readlink verifies the expected link target, root ownership and stable identity. Open the `/private/...` target independently component-by-component without following links, and revalidate the alias/root identities. Accept direct canonical `/private/var/...` and `/private/tmp/...` likewise.
Do not require symlink mode bits to prove nonwritability: root-directory entry ownership/permissions and stable pinned identity are the meaningful boundary. Never let an unexpected target silently replace the canonical mapping.
All other symlinks in project root, HOME, selected baseline paths, state/history trees and export parents remain rejected. A user-created symlink under `/var/folders/...`, or a custom symlink-valued TMPDIR/HOME, gets no exception. Missing HOME remains an error; no new POSIX home fallback.
Hash canonical project path bytes once for project_id in both state and history; `/var` spelling and `/private/var` spelling must converge. Preserve project-relative evidence paths. Resolve export **parent** with the same policy, then validate the destination leaf separately; never `realpath` the nonexistent output.
Do not case-fold, Unicode-normalize or generalize aliases. Filesystem case sensitivity/firmlinks/APFS behavior is untested; descriptor identity remains the check, and canonical textual equality after permitted alias expansion remains required. Canonical temp-root handling is no reason to move state/history out of HOME.

## Runtime integration and durability

1. `stateLocation/historyContext`: explicit Darwin canonical-root path; share one Darwin canonicalizer and project-id calculation. Retain pin context until operation completion. Keep Linux/Windows branches byte-for-byte algorithms unless narrow dispatch factoring is necessary.
2. `openTask/openHistoryRoot/openConsultationDir`: add actual Darwin directory capabilities, not fake `base` fd-path strings. Logical `base/path/projectBase/taskBase` may remain display metadata only. Route **every** Darwin managed inspect/read/write/mkdir/rename/unlink/readdir/rmdir/sync through the bridge.
3. `readFile`: Darwin logical scan-record paths reopen safely from `/` through `openRoot(dirname)` and `openRegular`; pinned contexts read directly from their existing directory capability. Never fall through to Node path mutations. Inject existing query read hook; no public result-schema change.
4. State transaction: reuse JSON/callback validation and limits; acquire exclusive token/process lock, guard stale reaper, invoke callback, temp write, expected-byte/stat commit, owned cleanup/release. `change.state=null` remains read-only apart from lock lifecycle. State recovery guard stays fail-closed/no TTL; history recovery keeps its existing separate policy.
5. Baseline: keep 32-path/16MiB-file/64MiB-total/48KiB-record limits and Git before/after observations. Pin each parent through final recheck; hash via reusable 64KiB Buffer/readInto. Missing observations retain last-existing parent and remaining components, then rewalk nofollow to confirm absence. Rehash after Git pass via a fresh verified file handle relative to the pinned parent, never plain logical-path `rehashFile`.
6. History: create metadata/started/outcome no-replace; attempts/terminal replace with expected bytes/stat under current history lock. Preserve quotas, idempotence, count bounds and scope. Scan pins each project/task/consultation before enumerating children; release deterministically, reads independently re-pin logical paths when needed.
7. Export: pin full canonical destination parent; keep filters/redaction/dry-run and skipped-record behavior; exclusive native create+file/parent fsync. Dry-run never creates output. Prune: re-open pinned consultation, protect started records, verify owned files, remove leaves then empty directories via parent capabilities; count only successful deletions, do not recursively erase stray files or double-close fd handles.
8. Durability: mirror existing file-before-parent fsync ordering for temp/lock writes, directory creation, commit, release/reap, export and prune. Propagate unsupported sync/I/O errors through existing state/audit/export errors. Preserve intentional metadata best-effort semantics; do not broaden swallowed errors.
9. Apple explicitly warns fsync does not guarantee physical drive-cache flush/order after power loss; F_FULLFSYNC is stronger and filesystem-dependent. Existing Linux code uses fsync only: recommend matching that strength, **no new power-loss claim** and no automatic F_FULLFSYNC fallback ladder. Directory fsync success on supported deployment filesystems is an unverified runtime prerequisite, not established by this report.

## Plan decomposition and permitted acceptance

- **Design/package contract:** record bridge signatures, alias rules, bounded CAS meaning, exact artifact provenance and closure asset types before runtime edits; source/BOM identity ties C code to each shipped binary.
- **Native assets:** obtain trusted prebuilt x64+arm64 artifacts; review Node-API/SDK availability, dependency paths and architecture statically. Source without real assets is blocked delivery, not macOS enablement. No macOS execution or new macOS CI test matrix.
- **State/baseline integration:** implement Darwin dispatch and pin lifetimes; review lock recovery, limits, missing-path recheck, exact callback/result parity and no logical-path mutation leaks.
- **History/export/prune integration:** migrate every above caller; preserve scope/redaction/metrics/quota/prune semantics and error boundaries; inventory/package/projection include native bytes on all hosts.
- **Later main-agent Linux checks only:** existing `state-io`, `storage-safety`, `task-state`, `state-cli`, `history-store`, `history-cli`, integration and lifecycle suites; focused Linux regressions assert addon is never loaded, pinning/CAS/lock behavior unchanged and export/prune safety retained. Use actual repository commands, not guessed scripts.
- **Static acceptance:** exhaustive Darwin branch/callsite review; no Darwin `/proc`/`/dev/fd`, no string fd capabilities, no install/runtime build/fetch or fake fallback; literal native closure imports and binary-byte hashes/projection parity reviewed. No static review is a substitute for native execution evidence.
- Report macOS as implementation-present only with all paths **and real packaged artifacts**, always untested/unqualified. Separate native Windows transfer/testing belongs to the parent plan; this slice adds no Windows/macOS execution gate.

## Authoritative external references

- [Node 22 filesystem signatures](https://nodejs.org/docs/latest-v22.x/api/fs.html#fsopensyncpath-flags-mode), [rename](https://nodejs.org/docs/latest-v22.x/api/fs.html#fsrenamesyncoldpath-newpath), [Node-API ABI limits](https://nodejs.org/docs/latest-v22.x/api/n-api.html#implications-of-abi-stability).
- [Apple open/openat](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/open.2), [stat/mkdirat declarations](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/sys/stat.h), [renameat/RENAME_EXCL](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/rename.2).
- [Apple unlinkat/AT_REMOVEDIR](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/unlink.2), [linkat caveats](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/link.2), [fsync/F_FULLFSYNC](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/fsync.2).
- [Apple root aliases](https://raw.githubusercontent.com/apple-oss-distributions/files/main/Makefile), [Node v22.19 platform baseline](https://github.com/nodejs/node/blob/v22.19.0/BUILDING.md#platform-list). Apple main-branch source is API/design evidence, not a pinned tested deployment SDK.

## Unresolved questions / prerequisites

- Confirmed after initial research: user approved controlled macOS build-only production of both native artifacts; no addon/controller execution or tests. Nominate the trusted builder at Phase 04 entry. Node-only **launcher** does not imply Node-only runtime internals; no runtime compilation or third-party download.
- Exact pinned SDK/compiler/source/BOM and supplied x64+arm64 artifacts remain future prerequisites. The [Darwin contract](../darwin-runtime-contract.md) selects SDK-declared `proc_pid_rusage(RUSAGE_INFO_V0)`, avoiding the earlier private snapshot proposal; [process research](macos-process-design.md) records evidence and conservative semantics.
- macOS filesystem no-replace rename, directory fsync, canonical alias/firmlink and process behavior remain unexecuted. Unsupported operations fail closed; neither these risks nor absence of binaries may be described as qualified macOS support.
