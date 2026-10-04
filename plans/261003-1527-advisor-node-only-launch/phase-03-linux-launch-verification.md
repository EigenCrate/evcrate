# Phase 03 — Linux real-launch verification and portable fixtures

## Context Links

- [Phase 02 caller cutover](./phase-02-node-only-callers.md); coherent interim source/generated batch required.
- [Architecture contract](./architecture-contract.md), [Darwin runtime contract](./darwin-runtime-contract.md).
- [Acceptance matrix](./acceptance-matrix.md): N02–N13, N15; N11/N12/N13 also rechecked in Phase 06.
- [Caller inventory](./research/caller-inventory.md), [platform fixture research](./research/platform-qualification.md).
- [Existing complete CLI lifecycle](../../tests/advisor-controller/verification-lifecycle.test.cjs), [real controller scenarios](../../tests/distribution/phase10-controller-scenarios.test.mjs).
- [Private-HOME publication precedent](../../tests/distribution/publication-apply.test.mjs), [human gate implementation](../../.evcrate/source/.evcrate/bin/lib/advisor/state-human.cjs).

## Overview

- Date: 2026-10-04. Priority: P1. Implementation: complete. Review: complete.
- Dependency: Phase 02 caller edits, regenerated brief/build identity and coherent projections. No Darwin implementation prerequisite yet.
- Outcome: real Node-driven Linux installed/private-HOME advisor lifecycle proof and bounded fixture preparation for later native Windows qualification.
- This is **interim Linux launch evidence**, not the final packaged candidate or proof of Windows/Darwin behavior. Phase 06 repeats relevant gates after Darwin assets/integration.
- Tests/builds/console runs below are future parent-owned implementation gates. None are executed during planning; workers skip all gates/formatters.

## Key Insights

- Existing Node-driven lifecycle already covers state/inference/history with package-shaped fake Codex. Extend behavior, not a parallel protocol or mock echo harness.
- Source-entrypoint tests alone do not prove installed HOME resolution. Publish through real existing authority into a disposable HOME, then execute that complete installed closure.
- Linux executable-bit independence must be demonstrated on a **private script copy**, not by chmodding repository/shared HOME source.
- Cwd identity is project-scoped for state/history; health diagnostic remains package-root scoped. Fake provider cwd is an isolated workspace, not necessarily project cwd.
- Existing fake-provider symlink/chmod patterns are not portable Windows proof. Reuse real package layout and `.cmd` backend recognition without advisor `.cmd` shims.
- Linux passing files with skipped/early-return Win32 sections does not count as Windows evidence. No platform spoofing, paid vendor calls or macOS execution.

## Requirements

- Run actual installed advisor via Node using UTF-8 stdin/EOF and unchanged state/history/inference argv; validate one terminal envelope and exit status after close.
- Complete v2 init → reserve → advice → get → disposition → truthful no-change outcome → complete; match run/checkpoint/digests/revisions and resulting stored history.
- Cover spaces/non-ASCII HOME/project/controller paths and payload, explicit invalid HOME, Node/script failure, non-executable Linux script and two-project isolation.
- Malformed/oversized requests and provider/controller failures leave required gate incomplete; no fabricated success or direct-exec fallback.
- Retain existing streaming/EOF, cancellation, slow generation, retries/backup and cleanup guarantees.
- N15 requires both automated no-TTY failure and separately recorded actual interactive console confirmation; chat approval or fake challenge echoes are not console evidence.
- Port only selected qualification fixtures and environment construction. Do not globally rewrite tests, weaken ownership assertions, skip required Windows scenarios, or add a generic platform framework.

## Architecture

Proposed `tests/advisor-controller/node-launch.test.cjs`:

- An async Node test imports existing `dist/index.js` publication APIs, or invokes existing `dist/cli/evcrate.js` through Node; no new production launcher.
- Use `resolveInvocationContext({packageRoot, cwd: packageRoot, home, targets: ['omp']})`, `publishDryRun(context)` then `publishApply(context)` as demonstrated in publication tests. All writes target owned disposable roots; shared controller must appear under HOME, never project.
- Test operation helpers use `spawn(process.execPath, [installedController, ...args], {cwd: project, env, shell: false})`, bounded pipes and close/error handling. Controller path is actual installed HOME path.
- Deterministic fakes are full existing `fake-codex.cjs` / `fake-omp.cjs` implementations copied into package-shaped bin directories. They probe/respond using existing protocol and record input/argv; no empty scripts or synthetic advisor envelope.
- A small proposed `tests/advisor-controller/fixtures/provider-fixture.cjs` owns repeated test-only package/PATH setup if reuse warrants it. It is not an outer advisor invoker, provider resolver or public platform API.
- Keep runtime failure distinction: missing Node is launch/transport failure; Node unable to read script is interpreter failure without advisor JSON; malformed request is actual controller error envelope.

Disjoint parallel units:

| Unit | Exclusive edits | Shared interface / integration |
|---|---|---|
| Installed lifecycle author | New `node-launch.test.cjs` | Consume package-shaped provider fixture and real publication authority; N02–N12 |
| Portable fixture author | Proposed provider fixture + selected existing controller/history/state/mentor/retry/smoke/lifecycle fixture setup | Real fake scripts, native delimiters, case-clean PATH; one owner for all helper edits |
| Diagnostic regression author | `tests/cli/health.test.mjs` | Real existing health caller; non-executable/Unicode/error/cwd cases; production health verify-only |
| Parent integration owner | Shared-file conflicts, console fixture/runbook and receipt; all phase-end execution | Establish fixture interface first; wait for workers; no simultaneous builds/test runs |

## Related Code Files

| Classification | Exact repository paths / purpose |
|---|---|
| Create, proposed | `tests/advisor-controller/node-launch.test.cjs`: installed real-entrypoint launch/lifecycle regression |
| Create if shared setup needed, proposed | `tests/advisor-controller/fixtures/provider-fixture.cjs`: bounded package-shaped real fake setup |
| Modify | `tests/cli/health.test.mjs`: behavioral diagnostic launch, transport failure and cwd/env coverage |
| Modify fixture setup only as needed | `tests/advisor-controller/controller.test.cjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-controller/mentor-brief.test.cjs`, `tests/advisor-controller/history-controller-integration.test.cjs` |
| Modify fixture setup only as needed | `tests/advisor-controller/retry-orchestration.test.cjs`, `tests/advisor-controller/smoke-30s.cjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/adapters/phase08-mentoring-integration.test.mjs` |
| Verify-only fixtures | `tests/advisor-controller/fixtures/checkpoint.json`, `tests/advisor-controller/fixtures/fake-codex.cjs`, `tests/advisor-controller/fixtures/fake-omp.cjs` — reuse real behavior/output capture |
| Verify-only runtime | `src/cli/health.ts`, `src/cli/process-runner.ts`, `.evcrate/source/.evcrate/bin/evcrate-advisor`, `.evcrate/source/.evcrate/bin/lib/advisor/state-human.cjs` |
| Verify-only behavioral suites | `tests/advisor-controller/runner.test.cjs`, `tests/advisor-controller/provider-launch-identity.test.cjs`, `tests/distribution/phase10-human-gate.test.mjs`, `tests/distribution/phase10-test-helpers.mjs` |
| Verify-only publication pattern | `tests/distribution/publication-apply.test.mjs`, `tests/cli/publication.test.mjs`, `src/distribution/publication.ts` |
| Generated prerequisite; do not hand-edit | `dist/`, `.evcrate/source/.omp/`, `.evcrate/build-manifest-omp.json`, `.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs` |
| Create, proposed receipt | `plans/261003-1527-advisor-node-only-launch/reports/phase-03-linux-launch.md` — scenario/command/console evidence and limits |

## Implementation Steps

1. Parent records approved snapshot identity and Phase 02 generated identity, OS/architecture and supported Node version/executable. Future command: `node -p "JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,execPath:process.execPath})"`. Require native Linux; release research pins 24.21.0, package floor 22.19.0. Record actual selection rather than claiming an unavailable baseline ran.
2. Fixture owner prepares real package-shaped fake backends using `verification-lifecycle.test.cjs:236–250`: scoped package metadata, copied fake script and Windows `.cmd` backend launcher. Preserve Linux fake provider behavior; never chmod repository fixture files. Copy/chmod private fixtures only. Use `path.delimiter`; remove case-insensitive duplicate PATH keys before assigning one PATH. Set private HOME/temp/profile fields and clear recursion markers.
3. Limit portability edits to selected future Windows end-to-end suites; retain meaningful POSIX permission/signal checks as Linux-only evidence rather than pretending Windows mode bits behave identically. Do not port Linux `runner.test.cjs` `ps` assertions into Windows via skips claimed as success. Package-shaped retry fixtures with empty scripts are metadata precedent only, not the fake used for end-to-end inference.
4. Lifecycle author creates owned HOME/project/temp/bin roots containing spaces and non-ASCII names, plus a second distinct project. Publish the current interim generated snapshot through real dry-run/apply authority into private HOME only. Verify policy bytes preserved and installed controller closure exists; no controller copied into project by publication. Do not invoke real-HOME `distribute:all` or generic publish scripts.
5. Installed smoke drives valid v2 requests through Node: init and reserve from actual state revisions, inference using exact reserved checkpoint bytes, get to read fresh revision/correlation, no-change disposition, then a truthful outcome and complete. Reuse existing contract fields; do not hardcode fresh revision guesses beyond initial init contract. Run a real bounded validation (for example supported `node --version`) before recording its passed result; do not inherit existing fixture's unexecuted success text as real evidence.
6. Assert state/history identities, checkpoint digest, run/checkpoint IDs, receipt/build identity and completed gate. Compare captured fake provider UTF-8 prompt/checkpoint to request data and digest; generated mentor prefix is expected, not raw stdin equality at the provider. Assert state-only operations launch zero providers and one primary success launches once. Preserve isolated provider-workspace safety, not project cwd equivalence.
7. Exercise history list/show/metrics, no-clobber export dry-run/apply and prune dry-run/apply using actual known terminal records. Preview must create nothing; apply deletes only eligible owned terminal records, protects a separately reserved pending record, preserves other-project records and yields accurate deletion counts. Never recursively erase stray files or use production history.
8. N03/N04/N07: repeat state/history operations from the two canonical projects under the same Unicode HOME; assert distinct hashed scope paths and no cross-project state/history leakage. Test empty/relative/unsafe explicit HOME and POSIX absent HOME using existing error authority, with no writes to profile/project fallback roots. Health tests must separately verify **packageRoot** cwd even when projectRoot differs.
9. N08: remove all execute bits from the private installed advisor leaf, keep read permission and complete adjacent closure, then repeat real `state get`/fresh init via Node. Record mode and correct result; restore private mode for later negative cases if needed. Do not change source shebang, bin mapping, shared CLI rules or real installed user files.
10. N05/N06: through existing caller boundary (health `runtime.execPath` injection and workflow shell selection), select missing/unlaunchable Node while a valid default Node and executable real advisor remain available. Observe transport failure, no fabricated envelope, unchanged private state/provider logs; fallback would produce detectable real diagnostic/lifecycle side effects. Also remove/unreadably stage the private script and place a **real copied controller** at project-local decoy path; expected failure must not search/run it. Missing script case always runs; permission-denial assertions require a genuinely unprivileged context, not root-mode assumptions. No echo sentinel or production invoker is needed.
11. N12/N13: exercise malformed/truncated/oversized stdin, failed response/framing/UTF-8/nonzero exit and cancellation. Use actual controller plus existing protocol/fake-provider failure modes; existing health malformed-output regressions remain diagnostic parser evidence, not advisor smoke substitutes. Check failure classification and no required-gate completion; register process error handlers before writing stdin and await settlement.
12. N15 automated negative: use the real human-decision request for private `needs_human` state without a controlling terminal/TTY stderr; assert `HUMAN_EVENT_REQUIRED` and unchanged gate. Parent separately provisions an **actual interactive Linux terminal** and runs `node "$controller" state human-decision` with the canonical request JSON on stdin, private HOME/project cwd and terminal stderr; wrong/replayed nonce refuses, current exact challenge accepts, abort cancels. Existing workflow/state-human semantics define the challenge; do not pipe a fabricated answer or treat automated `isTTY` mocks as console evidence. Record source `local-terminal-confirmation`. Missing real console blocks this scenario, not writing the plan.
13. After worker barrier, parent executes future gates from coherent snapshot root. Existing package scripts are authority; direct commands below narrow coverage or run existing standalone smoke, not invented npm scripts:

    ```bash
    npm run test:cli
    npm run test:advisor-controller
    node --test tests/adapters/phase08-mentoring-integration.test.mjs
    node --test tests/distribution/phase10-controller-scenarios.test.mjs tests/distribution/phase10-human-gate.test.mjs
    node tests/advisor-controller/smoke-30s.cjs
    ```

    `test:advisor-controller` includes proposed `node-launch.test.cjs` once created. Do not repeat it merely for a second passing count. These tests consume Phase 02 build; if implementation changed compiled source, parent schedules a single `npm run build` before gates. No lint/formatter gate (`lint` currently only echoes success).
14. Parent records exact commands/cwd/exits, pass/fail/skip counts, Node executable, request/response identities, fake counts, console outcome and private-root cleanup. Record failures or unavailable prerequisites honestly; no paid vendors, consult-script execution or macOS runtime. Preserve sanitized receipts, remove only owned fixture trees after child settlement.
15. Parent reviews launch behavior and fixture interface. Handoff to Phase 04 with interim Linux evidence and portability notes; Phase 06 repeats final package/closure/installed checks and Phase 07 executes the unchanged candidate on native Windows. Do not freeze this pre-Darwin intermediate as the final transfer bundle.

## Todo List

- [x] Add installed/private-HOME real Node lifecycle and error cases.
- [x] Reuse real provider package fixtures and prepare bounded Windows-safe setup.
- [x] Prove non-executable script, Unicode, HOME failure and cwd isolation.
- [x] Preserve history/export/prune and required-gate/cleanup behavior.
- [x] Parent run focused Linux gates and separate actual console scenario; record truthful receipt.

## Success Criteria

- N02–N10: actual installed controller lifecycle succeeds through Node; Unicode data, revisions/digests, HOME authority, project scope and execute-bit independence demonstrated.
- N05/N06: failed selected Node/script produces failure without direct/PATH/project-local execution, state/provider side effects or invented advisor JSON.
- N11–N13: history scope and safe export/prune survive; malformed/cancelled/failed calls never close required gates; retry/cleanup suites retain observable behavior.
- N15 has both headless refusal **and real interactive console** evidence, or explicitly remains blocked. Synthetic TTY logic cannot satisfy it.
- Package-shaped fixtures are ready for native Windows without requiring symlink privilege; skipped Win32 code is explicitly not qualified.
- Evidence identifies exact interim snapshot/runtime; final candidate acceptance still belongs to Phase 06. Darwin remains not executed/untested/unqualified.

## Risk Assessment

- Isolation leakage into actual provider/user config: fake-only bin/policy/HOME/temp, real provider path excluded, deterministic fixture receipt required.
- Async smoke hangs/leaves processes: reuse bounded test watchdogs/error/close cleanup; no new generation timeout or provider retry policy.
- Installed publication exposes stale projection inputs: require coherent Phase 02 batch first, distinguish stale-output prerequisites from launch failures.
- Fake provider stdout alone gives false confidence: inspect durable state/history and exact request/response identity, not nonempty output.
- Native Windows portability incomplete on Linux: Phase 06 completes remaining pre-freeze gaps; Phase 07 is the only native Windows evidence gate.

## Security Considerations

- Preserve nofollow/regular-file closure checks, project digest authority, explicit-HOME rejection and shell-free argv.
- Never retain actual credentials/policy/history, hidden reasoning or raw vendor logs in receipts; deterministic fakes are not vendor qualification.
- Human authorization stays controlling-terminal challenge, not JSON, chat consent or environment override.
- All negative chmod/remove/decoy/prune operations are confined to owned private copies. Restore/cleanup only owned roots; await process settlement before deletion.

## Next Steps

Phase 03 Linux launch verification deliverables reviewed and approved (Score: 9.9/10). All test suites pass (68/68 CLI, 243/243 advisor-controller, 16/16 cross-suite integration, 1/1 smoke-30s, 3/3 interactive console). Proceed to [Phase 04 — Darwin native build](./phase-04-darwin-native-build.md). Real arm64/x64 build-only assets are required before Phase 05 runtime integration; no macOS tests. Final Linux-qualified immutable transfer bundle is produced only in Phase 06.

## Unresolved Questions

- Which supported Node runtime and actual interactive Linux terminal will parent use? Record before runtime/console acceptance; unavailable scenarios remain blocked/not-run.
- Windows host and Apple producer remain later implementation prerequisites, not justification for omitting this phase or claiming platform proof.
