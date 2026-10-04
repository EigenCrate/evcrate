# Proposed architecture: one Node-only advisor launch contract

Status: proposed implementation design; not implemented or qualified. Created 2026-10-03.

## Decision and scope

Standardize **evcrate-advisor**, not the separate `evcrate` control-plane CLI, on one invocation tuple for Linux, native Windows, and macOS:

```text
executable = supported Node executable
argv       = [absolute HOME-owned evcrate-advisor path, ...operation arguments]
stdin      = exact request JSON encoded as UTF-8, then EOF
cwd        = canonical caller project directory
```

All maintained caller paths must use this tuple. No Linux direct execution, shebang-based retry, `.cmd`/`.bat` advisor shim, alternative interpreter, project-local controller search, or shell fallback after launch failure. This is a caller contract, not an attempt to make manual direct execution physically impossible.

User clarification: macOS means **enable actual advisor behavior**, not merely permit Node to start. Include Darwin durable state, baseline, history, and process-identity portability; do not execute macOS tests or claim macOS qualification. This expands runtime work beyond the common launcher.

## Non-goals

- No controller rename, `.js` extension requirement, new wrapper/invoker, `--file` input, daemon, CLI redesign, or new protocol.
- No change to backend qualification, supported provider selection, provider retry/backup semantics, state/history schemas, evidence digests, human approval, or cleanup guarantees.
- No removal of Windows PowerShell/C# provider supervision or POSIX process-group/terminal logic.
- No macOS test run, advisor/addon runtime probe, or qualification claim. User approved controlled macOS **build-only** packaging; see [Darwin runtime contract](darwin-runtime-contract.md). No macOS test matrix.
- No production publication, release, commit, or unrelated dirty-work cleanup during planning.

## Runtime and path resolution

1. The package currently requires Node `>=22.19.0`; verify engine and existing qualification pins at implementation start. Reuse the package requirement; do not invent another version policy.
2. A caller known to be running under **Node** uses `process.execPath`. A Bun-hosted harness must not assume its `process.execPath` is Node. A shell/harness caller invokes the configured/available supported `node` executable. Resolve once for the invocation; failure does not trigger alternative executable selection.
3. Resolve a native absolute controller path beneath the authoritative home. Explicit `HOME` being present is distinct from being nonempty. Empty, invalid, or unsafe explicit HOME fails; never replace it using `HOME || os.homedir()`.
4. Retain current host home-resolution authority. Windows may use native user-profile resolution only when HOME is absent; POSIX caller/controller behavior must be inspected and preserved rather than silently widened.
5. Do not pass `~` to a shell-free spawn expecting expansion. Use native path joining, preserve spaces and Unicode, and reject unsafe roots using existing policy rather than adding a second validator.
6. Production controller is `<home>/.evcrate/bin/evcrate-advisor`; repository source path is permitted only for explicit development fixtures. Stateful advice launches preserve the actual project cwd; using controller/package cwd can select the wrong state/history identity. Existing diagnostic `runHealth` uses package-root cwd and retains that distinct contract.

## Invocation and response

Programmatic Node callers use the existing process-runner boundary or `spawn`/`spawnSync` patterns as appropriate, with an argv array and `shell: false`. Node is always the executable; the controller script is always argv[0]. Register existing error/output/close handling before writing input. Preserve current byte limits, fatal response decoding, cancellation and timing semantics; no new arbitrary generation deadline.

Operations retain their exact arguments: `[]` inference; `['state', operation]`; `['history', operation]`. Diagnostic requests retain their existing envelope and empty argv. Preserve strict request JSON, ordering where digest-bound, and UTF-8 stdin. Never put JSON into argv, interpolate it into `node -e`, or repair malformed payloads.

Validate each operation's expected protocol/version/status, identity/revisions where applicable, framing, and exit status after process settlement. A launch failure may occur before any controller JSON exists; report transport failure, do not invent a `FAILED` controller envelope or mark an advice gate satisfied.

## Shell boundary is separate from OS launch selection

Both shell families invoke Node. Bash syntax and PowerShell syntax may differ; this is not a second launch mechanism. Retain PowerShell 5.1 BOM-free UTF-8 stdin handling and restore encoding in `finally`. Retain shell quoting appropriate to the actual shell, not merely the host OS. Do not emit Bash heredocs just because a harness tool is named `bash`.

A programmatic Node caller needs no Linux/Windows/macOS branch to choose its launcher. OS-specific home validation, native process supervision, path safety and console behavior remain inside their existing boundaries.

## Packaging and shebang

Retain the entrypoint name, shebang, npm `bin` mapping, and existing installer/publication permission policy. Those metadata are not a permitted fallback. Update closure inventory through its generator only if required Darwin runtime assets are added. All maintained callers/examples migrate to explicit Node. Do not claim the script's execute bit is required for Node to read it; test a private non-executable script copy on Linux to prove launch independence. Do not delete shared execute-bit rules that also serve the unrelated control-plane CLI.

## Support and acceptance boundary

| Host | Required work | Allowed conclusion |
|---|---|---|
| Linux | Primary implementation, focused regressions, real local smoke, package/projection gates | Verified for recorded candidate, Node version, architecture and scenarios |
| Native Windows | Dedicated same-candidate transfer and native tests, PowerShell 5.1 and 7, existing supported Node baselines | Verified only for recorded native environment and advisor scenarios |
| macOS | Implement actual Darwin state/baseline/history/process support, compile/package arm64+x64 helper, static review only for runtime behavior | Implementation present only with real artifacts and complete integration; explicitly untested/unqualified |

No broad Windows support, all-provider qualification, macOS runtime parity, or production rollout claim follows from launch standardization. Known Darwin blockers are `state-io.cjs:stateLocation/openTask/proc`, `state-baseline.cjs:rootChain/captureFile`, `history-store.cjs:historyContext/openHistoryRoot/openConsultationDir`, and `history-query.cjs:exportHistory`. Replacing the OS guard alone is not macOS support. [Darwin runtime contract](darwin-runtime-contract.md) specifies the selected native capability design; do not substitute `/dev/fd` for `/proc/self/fd` or weaken descriptor pinning/CAS/process-start identity.

## Source ownership and execution discipline

Author canonical workflow/skill/agent resources under `.evcrate/source/.claude/`; regenerate configured targets using current build authority. Current dirty VSCode/registry work means the implementation must discover the actual target set rather than hardcode historical seven-target documentation. Generated artifacts and immutable old plans/reports are not authoring surfaces.

This plan owns only its new directory. Reconcile the existing dirty tree with its owner before implementation. Use a coherent approved snapshot for qualification; a commit SHA alone does not identify uncommitted source. Never reset, stash, stage, or commit unrelated work. Do not publish to the real HOME while testing.

## Architecture gate and future documentation

Current implementation authority: `docs/system-architecture.md` sections 1, 4, 5, 6 and 7; `docs/code-standards.md`; canonical `advisor-mentoring.md`. This separate proposed contract preserves their truthful current-state wording during planning. Phase 01 records the approved design in the architecture authority before implementation, clearly separating proposed and verified behavior; final docs update follows actual smoke evidence.

## Unresolved questions

Product scope is settled: Linux first, native Windows tests, actual macOS runtime enablement without macOS tests, controlled macOS build-only packaging approved. Execution prerequisites: owner-approved source snapshot, native Windows machine/runner, controlled Apple toolchain producer, reviewed SDK/process-API source pins and real native artifacts. These gate later phases; missing evidence remains explicitly unverified. Live provider checks are optional separately authorized work, not a hidden completion condition.
