# Phase 07 — Behavioral evals and installed host smoke

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); current offline extension gate is integrated here, separate from actual consumer server-success prerequisites.
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 02](phase-02-neutral-discovery-and-scanner-lifecycles.md), [Phase 03](phase-03-cycle-ledger-and-sanitized-run-guidance.md), [Phase 04](phase-04-portable-sonar-evidence-actor.md), [Phase 05](phase-05-bounded-remediation-command-and-final-audit.md), [Phase 06](phase-06-transactional-two-skill-installer-and-package.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: DONE (100%, completed 2026-10-13); review status: approved (Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 114/114 tests pass).
- Scope: Behavioral evals and installed host smoke.
- Owner: Validation owner; exclusive evals and plan qualification receipts; no production policy edits without integration owner.
- Planning estimate: 8h; available actual host/independent-child/eval proof required, not fresh live Sonar access.

## Key Insights

- An eval JSON file has no execution power; actual host behavior and terminal artifacts are required.
- Synthetic behavioral contexts test decisions, not real Sonar qualification.

## Requirements

- Cover full N/lifecycle/applicability/identity/paging/auth/refusal/final-success and ordinary-route behavior in labeled offline scenarios; no literal secrets, real credentials or uploads required.
- Prove actual packed agents-only, claude-only and both installs, consuming host/version/loaded paths and real independent generic children without native registration/settings writes. Roots are not hosts.
- Duplicate discovery requires observed handling and safe supported explicit selection/isolation; no assumed precedence, automatic configuration rewrite or copy deletion.

## Architecture

- Existing package tests → actual packed install smoke → actual host scenario transcripts → assertion/result matrix.
- Capability limits and unexercised rows stay explicit; no new controller or eval framework.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/evals/evals.json` | Cycle cases and neutral applicability without incidental wording assertions |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/tests/install.test.mjs` | Installer behavioral proof |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/tests/report-format.test.mjs` | Offline fidelity retained |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/plans/261012-2156-general-sonar-remediation-cycles/reports/behavioral-qualification.md` | Actual cases/transcripts/assertions and limits |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/plans/261012-2156-general-sonar-remediation-cycles/reports/installed-host-smoke.md` | Packed installation/discovery/real-child receipts |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Read acceptance matrix and define isolated deterministic offline behavioral contexts for four lifecycle shapes: build-integrated, standalone-after-native, preparation/build/submission, mixed-module/multiple-target. Label synthetic inputs/results; real host behavior is observed, live Sonar results are not. Final-success cases assert committed-input validation, mandatory final actual submission policy, exact per-target tasks/analysis/gates/full consistent findings/hotspots/coverage and independent audit; no fixture qualifies a live run.
2. Add scenarios for omitted/invalid N, N=1 failure/exhaustion, interrupted actor, known-task wait/resume, one correction/rereview, second correction needing next round, two no-progress rounds, exhausted final no edits and all-target conjunction.
3. Add applicability cases: required zero executed tests, justified no-test profile with appropriate validation, required unsupported coverage, no branch metric, zero denominator, stale/malformed non-XML coverage, incompatible metric aggregation and scanner instrumentation altering native semantics.
4. Add authority/auth/refusal cases: declined upload, declined commit, secure query/scanner-auth gap, missing real independent child, unsafe discovered scripts, attempted TLS/trust/tool upgrade, actor source/status mutation and unauthorized guidance sharing/self-edit. Use placeholders/fake nonsecret markers; never real credentials or literal-secret prompts/logs.
5. Add evidence cases: wrong branch/PR or combined selector, failed preparation/build/upload/CE and canceled task, interrupted wait without resubmission, partial paging/window ceiling, concurrent analysis/manual transitions and unavailable detection (`consistency unknown`), scope/gate/profile changes, generator/hook/untracked-input drift, disappearing finding unknown and gate-pass residual issues/hotspot review pending. Historical/round-only results must not pass final committed-success audit.
6. Retain consumer regressions for local Java warning fix in current checkout, applicable intended tests, optional recipes, offline converter fidelity and separately authorized Jenkins push route. Author explicit prose `assertions` arrays for existing catalog scenarios 2–7 (which currently have `expected_output` only). Replace obsolete agents-only target assertions in existing `evals/evals.json:174–192` with approved explicit agents/claude/both selected-root behavior; remove incidental wording/source assertions, never meaningful safety/ordinary-route coverage.
7. Execute all scenarios with approved available actual host/eval mechanism; record model/tool behavior, separate implementer/tester/independent-reviewer/evidence child identities, actual prompt/reference reads, terminal results and assertion artifacts. Missing/interrupted child or unavailable host/eval blocks the offline gate, not fabricated success; JSON syntax/model score alone does not pass.
8. Validation owner runs consolidated package tests once after integration (reuse exact Phase 06 receipts if already exercised, no redundant run); actual extracted packed installs from unrelated cwd for agents, claude, both, repeat no-op, replacement/collision and injected rollback/concurrency cases. Record commands/exits/action/result boundaries and manifest/installed-byte inventory; no mapping-echo-only proof or root lint echo.
9. For each selected root in approved disposable consuming workspaces identify actual available host/version/invocation from installed help/config and explicitly record loaded command/domain/actor/reference/template paths. Use real independent generic children returning terminal offline snapshot-capability results; verify same-root resolution outside checkout and no native actor/settings writes. Installing `.claude` does not establish Claude Code consumption; two roots do not count as two hosts.
10. In both-root discovery observe duplicate-name behavior and actual chosen path. Require supported explicit invocation/isolation selecting one unambiguous active copy without changing settings/deleting files. If host cannot select safely, mark both-root runtime ambiguous/unqualified, document single-root operation and keep required qualification visibly blocked; do not silently drop acceptance or invent precedence.
11. Review privacy/redaction of offline guidance for completed/exhausted/failed/blocked/declined outcomes, sanitized historical context and hostile embedded instructions. Exercise proposed-rule candidate behavior with owner-approved usefulness/privacy/applicability review, not self-modification or invented live lessons.
12. Record pass/fail/blocked/unexercised per row plus package/source/profile/host/version/loaded-root identities and independent role terminal receipts. Resolve failures through integration owner and rerun affected scenarios; never weaken required gates to fill matrix.

## Todo list

- [x] Add consumer-visible cycle and retained-route scenarios
- [x] Execute actual host offline behavioral evals with independent-child transcripts
- [x] Prove agents/claude/both packed installs, loaded paths and duplicate selection
- [x] Record capabilities/unqualified limits and privacy/candidate review

## Success Criteria

- Every required acceptance-matrix scenario passes observed offline behavioral assertions; unavailable host/eval remains an honest blocked gate, not waived by removed live qualification.
- Actual installed host/version/loaded paths and independent child terminal results prove prompt/reference consumption for selected copies; all three packed layouts and duplicate selection/isolation are exercised. Root count is not host count; unsafe ambiguity remains unqualified and explicit.
- Unsupported mutable/manual-status detection yields explicit `consistency unknown` and blocks required capture qualification; assert it never becomes “no changes” or success.

## Risk Assessment

- Host-dependent invocation syntax and permissions can differ; no all-host parity claim.
- A mocked server success path cannot qualify task correlation on live servers.
- Duplicate names can silently load the wrong root; require actual path attribution and supported explicit selection/isolation without native settings changes.

## Security Considerations

- Disposable isolated contexts use no real secrets/source/customer data; clean throwaway artifacts after smoke.
- Actual host installation/discovery smoke must not write HOME or native actor registry/settings.

## Next steps

Phase 08 reviews supplied historical summary and closes offline package/install/host/behavior/privacy/docs handoff. No new real project, scanner credential, coverage/upload/task/live matrix is required; actual future consumer server-success still needs complete final committed-source evidence.

Unresolved design questions: none. Actual host/eval facts remain mandatory to exercise; future consumer projects/auth/owner approvals are separate, not a restored live gate.
