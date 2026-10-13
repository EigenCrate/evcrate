# Phase 06 — Dual-root transactional two-skill installer and package

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); exact dual-root execution contract is integrated here and in [installed payload/API contract](design-contracts.md#2-installed-payload-contract).
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 04](phase-04-portable-sonar-evidence-actor.md), [Phase 05](phase-05-bounded-remediation-command-and-final-audit.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: DONE (100%, completed 2026-10-13); review status: approved (Review Cycle 2: 8.5/10, 0 critical issues, 4 warnings, 4 suggestions; 99/99 tests pass; see reports/code-reviewer-261013-0726-phase-06-review-cycle-2.md); non-blocking warnings carried as next steps.
- Scope: Explicit agents/claude/both selection and one guarded cross-root two-skill transaction.
- Owner: Installer/package author; exclusive lib/install.js, package.json, installer tests and required CLI docs.
- Planning estimate: 6h; no Sonar credentials/uploads required for installer/package acceptance.

## Key Insights

- Current ten-file mapping cannot install sibling skill; fixed explicit per-asset destinations are sufficient.
- Existing backups are in memory; caught-error rollback is not process-crash recovery or atomic reader visibility.

## Requirements

- Extend existing `--target` to required explicit `agents|claude|both`; missing/unsupported values error, no default both, no new flags/core CLI. Legacy `--target agents --directory <project>` remains valid.
- Install 18 proposed payload files and exactly two skill entrypoints per selected root; `both` writes 36 destinations from one authored source tree. Write no unselected root payload/settings/registration.
- Preserve Node >=18.11.0, force plus confirmation, source/ancestor/destination symlink/type/race guards and unrelated/concurrent content.

## Architecture

- Fixed source→destination inventory in [design contracts](design-contracts.md#2-installed-payload-contract); selected root sibling links, no source-cwd/cross-root fallback.
- One plan/stage/publish/verify/caught-failure rollback spans selected roots. Shared project bundle lock then legacy agents-domain lock if selected; release successfully owned locks in reverse order.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/lib/install.js` | Explicit targets/map/API-results, shared and legacy locking, complete cross-root transaction |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/package.json` | Include commands/agents/templates in files allowlist |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/tests/install.test.mjs` | Exact root layout/API/CLI, collision/concurrency/fault/rollback regressions |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/bin/install.js` | Extend existing target help/errors; render selected action paths/root-aware discovery and preserve agents result behavior |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/README.md` | Explicit roots, two entrypoints/root and honest failure guarantees |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Query available exported references and inspect all callers before changing target semantics. Keep `resolveInstallTarget({target,directory})`, `planInstallation({sourceDir,target,directory})` and `executeInstallation(plan,{dryRun,force,yes,_beforePublish})` call forms. No missing-target default. Update every affected caller/test; remove obsolete single-domain map assumptions, no aliases/shims.
2. Freeze exact result contract: agents keeps `{target, installationRoot: <project>/.agents}`, action `relativePath: skills/<skill>/<asset>` and absolute `destinationPath`; claude uses the same paths under `<project>/.claude`; both uses validated `<project>` as `installationRoot` with `.agents/skills/...` and `.claude/skills/...` action paths. Preserve plan `actions/additions/replacements/unchanged/blockers`; dry result `{dryRun:true, additions,replacements,unchanged}` and apply result `{dryRun:false, committed,unchanged}`, containing action-relative paths. CLI prints both root-qualified actions and discovery locations, not `<project>/skills`; preserve agents markers/count/result meaning.
3. Replace implicit SKILL_FILES prefixing with the fixed 18-asset map in design contracts, once per selected root. Original ten plus four references, actor prompt, two templates and command entrypoint; no recursive copying, duplicate authoring/host rewrites, second installer or adapter registry.
4. All new modes acquire project `<project>/.sonarqube-test-quality.install.lock`, then existing `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever agents is selected. Deterministic order coordinates older agents-only installers; claude-only creates no agents skill directory. Pre-existing locks block, no stale auto-delete. On partial acquisition/failure release only successfully owned locks in reverse order; never delete another installer's lock.
5. Preview all selected roots without creating project/locks/directories/staging files. Validate source files and ancestors plus project/root/ancestor/destination regular-file/directory non-symlink types and containment before writes; recheck under locks and per file during publish. Root or sibling blocker stops entire plan; force cannot override path/type safety. Shared lock coordinates participating installers only, not arbitrary user writes.
6. Stage beside each destination on its volume; reject unsupported filesystem boundaries, no cross-volume atomicity claim. One publish/byte verification spans selected roots. On caught failure restore replacement original bytes across roots, remove only owned additions/temp files and empty owned directories, preserve unrelated/concurrently changed content. Report restoration conflicts/failures as partial rollback with affected paths; no persistent journal, crash recovery or atomic simultaneous-reader visibility promise.
7. Extend package allowlist for commands/agents/templates/references through existing packaging. Preserve engine/bin/scripts; no core Node requirement/tool pin or native `.claude/agents/` registration/settings writes. Nested portable actor prompt is selected-root skill payload, not native registration.
8. Permanent consumer cases: agents-only legacy behavior; claude-only no agents payload; both exact layout/two entrypoints per root; repeat no-op; dry-run no writes; sibling-only/root-only collision blocks whole plan; differing files require force plus confirmation; detected source/ancestor/destination symlink/type violations never force-overridden; project lock conflict and existing agents lock conflict. Independent expected destination inventory, not production-map echo. Path/race rechecks do not isolate every possible arbitrary-writer TOCTOU race; retain all specified concurrent-data preservation/fault cases.
9. Use existing `_beforePublish` seam for deterministic agents vs both and claude vs both concurrency; legacy agents lock vs both; failure after first root already changed; mixed additions/replacements across roots; concurrent user-created file survives; successful restoration releases owned locks; restoration failure reports incomplete rollback/affected paths. Retain destination byte/object race checks, no incidental wording assertions.
10. After all implementation edits integrate, validation owner runs consolidated extension npm test once, actual CLI dry-run/install/reinstall/authorized replacement/collision smoke for agents, claude and both in disposable roots, then extracts actual packed package and repeats outside checkout. Count remains proposed until actual manifest/installed bytes verified. No tests/build/lint mid-flight; no Sonar auth/network uploads needed.

## Todo list

- [x] Implement explicit agents/claude/both 18-per-root mapping and API/CLI results
- [x] Preserve project-then-legacy locking, guards and cross-root rollback
- [x] Package all new nested assets from one source tree
- [x] Exercise exact collision/concurrency/fault scenarios and update install docs

## Success Criteria

- Actual packed installs prove 18 files/two entrypoints per selected root and 36 for both; same-root links resolve outside source checkout; repeat writes zero payload files, dry-run creates nothing.
- Legacy agents invocation/action/results retained; claude touches no agents payload; unsafe sibling/root collisions block entire plan. Cross-root caught failures restore owned prior state or explicitly report partial rollback; concurrent/unrelated data and unowned locks survive.

## Risk Assessment

- Existing rollback swallows restoration errors; implementation must surface incomplete rollback, not promise restoration without evidence.
- New shared lock alone cannot coordinate old agents installers; retain legacy guard and partial-acquisition reverse release. Arbitrary writers remain outside lock coordination.
- In-memory backups do not qualify process-crash recovery or atomic all-root reader visibility.

## Security Considerations

- Never follow symlinks or force-overwrite user paths outside declared payload.
- Unrelated host settings/skills and private evidence remain untouched.

## Next steps

Phase 07 consolidates actual package, all three packed-install modes and root-attributed host smoke. Phase 08 documents only verified offline guarantees; no fresh live Sonar gate.

Unresolved design questions: none. Actual package/host/eval acceptance remains pending; future consumer Sonar auth/uploads are separate prerequisites.
