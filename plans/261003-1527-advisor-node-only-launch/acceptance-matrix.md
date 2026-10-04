# Acceptance matrix and evidence boundaries

Status: planned scenarios only; no runtime gate executed. Every required row needs phase-owned evidence before implementation completion. Static inspection is not native execution proof.

## Required scenarios

| ID | Scenario / observable result | Phase / host | Evidence |
|---|---|---|---|
| N01 | Maintained workflow, skill, script and test calls name Node and absolute advisor script; no direct-launch branch/fallback remains | 01–02 / source audit | Exact caller disposition inventory; historical frozen artifacts explicitly excluded |
| N02 | Existing operation argv and UTF-8 JSON stdin preserved; no JSON command-line interpolation | 02–03 / Linux; 07 / Windows | Actual controller state/inference/history responses and input identity, not only mock argv |
| N03 | Stateful caller retains canonical project cwd; two private projects keep distinct state/history identities | 03 / Linux; 07 / Windows | Project/run-specific state paths and response identities; health diagnostic cwd intentionally unchanged |
| N04 | Spaces and non-ASCII HOME/project paths and payload survive without wrong-path launch or corrupted request | 03 / Linux; 07 / Windows | UTF-8 payload digest, task/evidence fields, terminal envelope |
| N05 | Missing/unlaunchable selected Node yields transport failure; never executes advisor directly, retries another interpreter or invents controller JSON | 03 / Linux; 07 / Windows | Spawn attempt/failure and absence of fallback side effects; existing caller boundary reused |
| N06 | Missing/unreadable controller script fails; no ancestor/project-local/PATH script search | 03 / Linux; 07 / Windows | Nonzero/error outcome, unchanged private state, sentinel project-local script untouched |
| N07 | Invalid/empty explicit HOME rejected rather than replaced with another home; HOME-absent behavior follows existing host authority | 03 / Linux; 07 / Windows | Error/result and absence of writes outside owned fixture; no HOME\|\|homedir shortcut |
| N08 | Linux copy of advisor script with execute bits removed still runs through Node; source shebang/bin metadata remains intact | 03 / Linux only | Real state operation through private complete controller closure, expected result |
| N09 | Node-parent caller uses actual Node execPath; Bun-hosted instructions select Node explicitly, not Bun execPath | 02 / static; 03 / Node runtime | Documented launcher contract and actual executable/runtime evidence; Bun support not newly claimed |
| N10 | V2 lifecycle init → reserve → advice → get → disposition → truthful outcome → complete succeeds without invented changes | 03 / Linux; 07 / Windows | Matching run/checkpoint/revisions, no-change outcome, completed state, fixture-backed ADVICE_READY |
| N11 | History list/show/metrics, export dry-run/apply, prune dry-run/apply preserve project scope and active records | 03,06 / Linux; 07 / Windows | Known records/filters, no-clobber export, deletion receipts limited to eligible owned records |
| N12 | Malformed/oversized input, bad response/framing, nonzero exit and cancellation leave required gate incomplete | 03,06 / Linux; 07 / Windows | Actual failure classification; no result fabricated; no later direct launch |
| N13 | Existing provider retries/backup, process cleanup and unknown-cleanup failure semantics unchanged | 03,06 / Linux; 07 / native Windows-focused suites | Existing behavioral suites + real fixture process lifecycle; not paid vendor quality proof |
| N14 | PowerShell 5.1 and 7 preserve BOM-free UTF-8 stdin and restore encoding after success/failure | 07 / Windows | Shell versions, non-ASCII request/result checks; PS pipeline scenario distinct from Node pipes |
| N15 | No-TTY/headless human decision remains fail-closed; actual interactive console accepts only correct current challenge | 03 / Linux; 07 / Windows | Negative automated evidence and separately identified real console evidence; redirected chat approval never substitutes |
| D01 | Darwin native code exports bridge ABI1 with owned descriptor capabilities, bounded I/O and exact identity fields | 04 / source review | Reviewed C/JS interface, resource/error/overflow paths; no Darwin runtime assertion |
| D02 | Real arm64 and x64 native assets are built from pinned source/toolchain/SDK/Node headers; not loaded during build | 04 / macOS build-only | Build commands/exits, static format/architecture/dependency inspection, source + artifact SHA-256 provenance |
| D03 | Every Darwin state/baseline/history/export/prune/workspace operation uses safe native capability path; no /proc or /dev/fd fall-through | 05 / static review | Function-by-function dispatch and lifetime checklist including read/recheck/cleanup/error paths |
| D04 | Required Darwin process self-token precedes lock/pending writes; exec-stable token, PID reuse/unknown/permission and conservative zombie semantics preserve wire shape | 04–05 / static + host-independent logic only | SDK-declared V0/layout and kernel-source review, uint64 decimal bounds, tri-state decisions; matching zombies stay live until reaped; fixtures cannot count as Darwin execution |
| D05 | Canonical Darwin system aliases handled narrowly and consistently; arbitrary symlinks still rejected | 05 / static review | Root/project/hash/temp/export path dataflow review; no native filesystem claim |
| D06 | Linux and Windows never load Darwin addon or compile/download at runtime; unsupported/missing Darwin asset fails closed | 04–07 / static + Linux/Windows | Loader review, actual Linux/Windows controller smoke and closure hashes |
| P01 | Exact generated closure includes required C/JSON/native assets without broad UTF-8 or dependency bypass | 04,06 / Linux | Inventory generator output, release/manifests checks and byte-parity evidence |
| P02 | Canonical instruction change reaches every currently configured target; no hand edits to generated copies | 02,06 / Linux | Current target inventory, build/check results, one-time invocation wording audit |
| P03 | Candidate includes controller, projections, source identity, needed tests/fixtures and real native assets; excludes credentials/history | 06 / Linux | Relative-path/size/SHA-256 manifest, archive digest, explicit selection list and provenance |
| W01 | Native Windows runs exact transferred candidate; archive and every candidate file match Linux manifest before use | 07 / Windows | Artifact digest + file verification; process.platform=win32; source commit plus dirty-content identity if applicable |
| W02 | All four PowerShell/Node rows complete required scenarios; symlink privilege and POSIX ps not required | 07 / Windows | Node 22.19.0/24.21.0 × Windows PowerShell 5.1/PowerShell7 results; skip reasons not counted as pass |
| W03 | Windows repair produces new Linux-qualified candidate and reruns affected matrix; no in-place patch under old receipt | 06–07 / both | Superseded/new candidate identities and matching regression/transfer receipts |
| F01 | Final documentation distinguishes Linux/Windows evidence, macOS implementation untested, provider/production limits | 08 / documentation review | Architecture/standards/PDR/README/roadmap/changelog coherent; no historical evidence rewrite |

## Evidence receipt minimum

- Phase and scenario IDs; exact source snapshot and candidate manifest/archive digest.
- Host OS/architecture, Node version and executable; PowerShell version where applicable.
- Commands and cwd, start/end/exit status, pass/fail/skip counts and relevant sanitized terminal output.
- Private fixture root ownership and cleanup result; never retain credentials or real user policy/history.
- Request/run/checkpoint identity and result fields for lifecycle smoke, not only non-empty stdout.
- Linux-only, native-Windows-only, compile-only and static-review evidence recorded separately.
- Native artifact receipt adds compiler/SDK/deployment target/Node-header and source digests, architecture, ABI and binary hashes.
- Failed or unavailable checks stay failed/blocked/not-run; no `process.platform` spoof or skipped Win32 test becomes Windows proof.

## Completion / no-test exception

Linux/Windows behavioral work requires actual runtime observation. macOS is the user's explicit no-runtime-testing exception: only compilation, static artifact inspection, source review and other-platform regressions. Build-only success is not native module load success. Darwin implementation is incomplete without both real assets and complete integration, but never gains a tested/qualified label under this plan.

Missing Apple toolchain, Windows runner or interactive console is a concrete future gate prerequisite. Do not substitute WSL, fake console success, public-policy weakening or source-only artifacts. Do not automatically run paid vendor inference; deterministic real controller/fixture-provider behavior and live vendor qualification are distinct.

## Unresolved questions

No additional scope decision. Exact Apple SDK/process-API source pins and execution-host provisioning are recorded Phase 01/04/07 prerequisites; phase receipts must state them before claiming completion.
