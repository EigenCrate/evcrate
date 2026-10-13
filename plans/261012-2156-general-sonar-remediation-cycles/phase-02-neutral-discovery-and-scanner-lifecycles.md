# Phase 02 — Neutral discovery and scanner lifecycles

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); current execution requirements govern over historical brainstorm/research/receipts.
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 01](phase-01-contract-freeze-and-capability-preflight.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: complete (100%, completed 2026-10-12); review status: approved (Review Cycle 3).
- Scope: Neutral discovery and scanner lifecycles.
- Owner: Domain-policy author; exclusive discovery/local-analysis/testing references.
- Planning estimate: 6h; consumer live prerequisites do not gate extension completion.

## Key Insights

- Coverage freshness belongs before importing/submitting stage, not necessarily before scanner preparation.
- Native tests, execution reports, coverage reports and remote metrics are different evidence.

## Requirements

- Discover approved language/module/toolchain without pinning or upgrading tools.
- In actual consumer runs, required unsupported or unavailable tests/coverage/auth/analyzers block success; justified not-applicable is an explicit preflight decision. Extension behavior is exercised with labeled offline scenarios, not real credentials/uploads.

## Architecture

- Data-only approved execution profile maps native runner → ordered lifecycle → report producers/importers → targets.
- Dedicated scanner shape is discovered; existing Java recipes remain optional.
- Domain references resolve within the selected `.agents/skills/` or `.claude/skills/` installed root; one authored payload, no cross-root fallback.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/SKILL.md` | Neutral description and route table |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/project-discovery.md` | Execution profile and applicability |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/local-analysis.md` | Approved ordered lifecycle, auth, correlation and recovery |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/testing-and-coverage.md` | Neutral rules with optional Java/JaCoCo guidance |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/sonar-cli-commands.md` | Cross-link local analysis while retaining precise query guidance |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/full-scan-workflow.md` | Keep separately authorized Jenkins route |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Generalize SKILL.md description for Sonar discovery/remediation in any language; avoid claiming analyzer support for every framework. Link new discovery/local-analysis/cycle routes while retaining existing local/report/query/worktree/Jenkins routes.
2. Write profile discovery order: manifests, approved scripts/configuration and tracked CI, installed tool help, matching official documentation; ask only for conflicting/unresolved values or materially different choices. Treat scripts as execution candidates until approved.
3. Record repository/branch-or-PR/SHA, tracked and untracked input manifests, nonsecret effective config, source/test/exclusion/module/report-to-source/target mappings and generated-input provenance. Preserve unrelated changes.
4. Record OS/shell/runner/versions/dependencies/profiles, intended focused/full checks and smoke; distinguish required/optional/justified not-applicable from passed/failed/unsupported/unavailable. Applicable required tests must actually run and pass; never force Maven, XML or a nonzero count for justified no-test profiles.
5. Specify ordered preparation/instrumentation/build/test/coverage/import/submission/finalization stages and expected writes/network effects. Show lifecycle shapes only; dedicated scanners remain project-approved and versions remain unchanged.
6. Specify separate uninstrumented native verification when scanner changes semantics; explain .NET begin build-policy changes as optional matching-toolchain guidance. No universal CLI flags or credential variable.
7. Separate CLI session binding from scanner process credentials; use approved safe mechanisms without token extraction or literal-secret prompts/commands/logs. Client/version-specific TLS diagnosis stays owner-gated; never disable verification or automatically edit trust/proxies.
8. Record native coverage format/path/counters/denominators, thresholds/operators, source mappings, freshness/parseability and import parameters. Separate overall/new-code Sonar metrics, periods and local metrics; unsupported branch coverage is not implicit N/A; zero denominator is not 100%.
9. Define stage-specific failed preparation/build/submission recovery. Never blindly repeat preparation or run upload-capable end/finalization as cleanup. If only external CI can scan, stop local cycle route and hand off to existing separately authorized route.
10. Review neutral route behavior using labeled offline scenario traces; Phase 07 executes real-host behavioral proof. Preserve offline converter/helper limitations and optional Java recipes; no speculative adapters or live-project completion dependency.

## Todo list

- [x] Write neutral profile/discovery reference
- [x] Write ordered scanner/auth/recovery reference
- [x] Generalize entry and coverage rules without deleting optional recipes
- [x] Review retained local/Jenkins routes

## Success Criteria

- Each lifecycle shape can express correct ordering and freshness; no universal recipe/metric/version.
- Required missing evidence and unsupported analyzer/auth cases terminate blocked; ordinary local-only fixes require neither N nor Sonar login.

## Risk Assessment

- Build generators or scanner instrumentation can drift input identity; checks must invalidate evidence.
- Report timestamps are insufficient freshness proof without source/profile binding.
- Historical vendor/report lessons specify policy, not runtime proof; Phase 08 cannot claim new live toolchain qualification.

## Security Considerations

- Record only nonsecret config and approved side effects; raw evidence storage outside checkout or preapproved ignored location.
- No automatic trust/dependency/scanner upgrades or execution of unreviewed scripts.

## Next steps

Deliver profile contract to Phase 04; integrate entrypoint cycle links with Phase 05 after ledger policy is stable. Phase 08 reviews historical lessons/docs; approved actual scanner lifecycles remain future consumer-run prerequisites, not extension completion gates.

Unresolved design questions: none. Runtime owner/auth/toolchain approvals are not implicitly authorized; offline package/host/eval acceptance remains mandatory.
