# Repository baseline and planning decisions

Observed 2026-10-03; planning only. No build, test, controller, publication or provider command executed.

## Current facts

- Branch `main`; initial `git status --short --branch`: 48 modified, 32 untracked, zero staged entries. User-owned work spans registry, target discovery, distribution and VSCode projection. Do not reset/stash/stage it or count it as this plan's implementation.
- `.evcrate/targets/manifest.json:10-18` currently declares antigravity, claude, codex, copilot, gemini, omp, pi and vscode. VSCode adapter/manifest/tests are untracked user work. Docs' seven-target statements lag this working tree; re-inventory at Phase 01 rather than overwrite either side.
- `package.json`: version 2.6.0; Node engine `>=22.19.0`; `test` builds then runs the complete existing Linux-oriented suite. `lint` only echoes success and is not a meaningful quality gate.
- `docs/codebase-summary.md` updated 2026-10-02; current enough for source navigation. Former plugin runtime retired; do not use `docs/workspace-advisor-host-contract.md` as the new controller launch authority.
- `src/cli/health.ts:55-71` already launches `runtime.execPath ?? process.execPath` with controller path in args. Its diagnostic cwd is package root intentionally; do not change it to project cwd merely to standardize the launcher. Stateful advice callers must preserve project cwd.
- `.evcrate/source/.claude/workflows/advisor-mentoring.md:79-145` still prescribes direct POSIX execution versus explicit Windows Node. `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md:31` repeats that distinction. Canonical source edits must precede generated projection updates.
- `scripts/consult-advisor-phase-e02.mjs` and `scripts/consult-advisor-phase-e03.mjs` contain runnable direct controller spawns with historical plugin payloads. Do not execute them as smoke. Classify/migrate transport while preserving historical payload/evidence; do not revive retired plugin implementation.
- `state-io.cjs:77`, `history-store.cjs:52`, and `state-baseline.cjs:73` block Darwin. State/baseline/history traversal and export depend on `/proc/self/fd`. `state-io.cjs:proc` reads Linux `/proc/<pid>/stat` for process-start identity. Node launch standardization cannot fix those requirements alone.
- Windows release workflow uses Node 22.19.0/24.21.0 and PowerShell 5.1/7 on windows-2025 x64. These are observed repository pins, not independently verified availability. Existing release qualification is installer/version-specific, not advisor qualification.

## User-confirmed scope

1. Standardize **evcrate-advisor**, not the unrelated `evcrate` CLI bin.
2. Explicit Node invocation on all hosts; no Linux direct-execution fallback.
3. Detailed implementation phases, Linux primary, dedicated native Windows transfer/testing phase.
4. Asked whether macOS allowance meant launcher-only or actual runtime enablement. User selected **Enable macOS advisor behavior, untested**. Include real Darwin storage/process work; no macOS testing or qualification.
5. Planning only now; code changes, tests, install/publish, commits and live vendor calls remain future work.
6. User approved **macOS build-only packaging** of the internal native helper for arm64/x64; no macOS addon/controller execution or tests. See `../darwin-runtime-contract.md`.

## Workflow execution

Read and followed published `/cmd-plan__hard` and `planning/SKILL.md` instructions directly; no automatic skill-loading claim. Read primary/development/orchestration/documentation workflows. Plan path: `plans/261003-1527-advisor-node-only-launch`.

Attempted session activation using the published `set-active-plan.cjs`. It exited 0 with `EVCRATE_SESSION_ID not set - session state will not persist`. The plan exists on disk; active-plan persistence is unavailable in this session. Do not invent a session ID or modify harness configuration.

Architecture-first design is recorded in this plan's `architecture-contract.md`; current production architecture docs stay truthful and unchanged during planning. Future Phase 01 must record approved proposed design before code changes, followed by evidence-based final documentation.

## Verification policy for later implementation

- Parent orchestrator runs gates once after each edit batch; workers skip builds/tests/lint/formatters.
- Every behavior change needs a real runtime smoke on a requested tested platform, not merely source-string assertions or mocked argv forwarding. Darwin runtime is the user's explicit no-macOS-testing exception; record build provenance/static review plus Linux/Windows regression evidence only.
- No `process.platform` spoofing presented as native Windows/macOS proof. No live model credentials in fixtures; deterministic fixture process output is explicitly distinguished from live provider qualification.
- Do not rewrite sealed plans/reports. If implementation later uses explicit advice state, apply the canonical writer barriers and outside-baseline receipts; plan creation itself has not initialized controller state.

## Unresolved prerequisites

Owner-approved coherent implementation snapshot; native Windows machine/runner access; controlled Apple build producer and exact SDK/compiler/Node-header/process-API source pins. Native helper/build approach is approved; macOS runtime remains intentionally untested. These prerequisites do not block writing the plan but must gate relevant implementation phases. Optional live-provider credentials are not a hidden completion requirement.
