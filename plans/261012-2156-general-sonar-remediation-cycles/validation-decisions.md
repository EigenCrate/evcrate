# Approved validation decisions — decision provenance

Validated: 2026-10-12. Four substantive questions asked; approved answers preserved below. Implementation remains pending. Current reconciliation integrates these decisions into [plan](plan.md), [navigation](evc-cmd-plan.md), [design contracts](design-contracts.md), [acceptance matrix](acceptance-matrix.md) and all eight phases. Current authorization explicitly supersedes the [interview](reports/validation-interview.md)'s phase-snapshot-preservation instruction; dated receipts remain history. Immutable brainstorm/research are historical inputs and do not override approved current execution documents. No deferred Phase 01 apply-addendum work.

## Confirmed decisions

1. Root requirement: user answered `.agents` and `.claude`, then clarified **Install to both roots**. Support `.agents/skills/` and `.claude/skills/` as explicit installation destinations; these are roots, not two host identities.
2. Live gate: user said **no need live gate**, follow supplied report. No fresh live Sonar project, credential, coverage/upload/task audit or server-run matrix is required to complete extension implementation. Do not reintroduce that dependency.
3. Plan delivery: **Keep plans local**. No ignore-rule change, force-staging, plan commit or raw-evidence inclusion. Tracked architecture/documentation must remain self-contained without links to ignored planning files.
4. Shared-install-only interpretation rejected by explicit dual-root clarification. Native actor registration/settings/canonical resource writes remain out of scope.

## Historical-report evidence boundary

The named input is `plans/reports/brainstorm-261012-2113-sonar-remediation-cycles.md`, preserved as [brainstorm-source.md](reports/brainstorm-source.md). Its §2 “What the supplied report teaches” records the earlier supplied service report: 56 tests, 46.48% line coverage, 63.91% branch coverage; the latest focused change was not analyzed afterward. These are historical reported observations, not current extension qualification. The full original service attachment is not separately present in this planning input; use the preserved summary and lessons without inventing missing source identity or private values.

Reuse its applicable procedure lessons: separate query/scanner auth; exact target/source identity; fresh applicable tests/coverage; ordered submission; completed server tasks; pagination; overall/new-code separation; owner hotspot reviews; verified CI triggers before push; TLS enabled. Do not transplant its host/key/branch/scanner version/threshold/shell/report path into generic defaults. The historical report does not prove the future command, two-root installer, host child behavior or additional toolchains worked.

Removing release-time live qualification **does not** weaken the command's consumer contract. An actual future remediation run still requires approved actual submissions, exact task/analysis/gate/full findings and final committed-source audit before claiming server-verified success. Without them its result is local/reviewed/awaiting commit/blocked/residual, never fabricated clean. Synthetic host behavior checks remain labeled synthetic.

## Current execution map / approved precedence

| Current execution artifact | Integrated approved decision |
|---|---|
| [Phase 01](phase-01-contract-freeze-and-capability-preflight.md) | Freeze integrated dual-root inventory and offline acceptance. Actual host/eval capability still required; live project/credentials not completion prerequisites. |
| [Phase 02](phase-02-neutral-discovery-and-scanner-lifecycles.md) | Neutral discovery/runtime lifecycle policy retained; labeled offline proof, selected-root sibling resolution. |
| [Phase 03](phase-03-cycle-ledger-and-sanitized-run-guidance.md) | Full ledger/guidance contract; offline/historical privacy/candidate proof, no invented new real run lessons. |
| [Phase 04](phase-04-portable-sonar-evidence-actor.md) | Real actor/independence evidence, consumer actual task/analysis capture rules retained; no Phase 08 uploads dependency. |
| [Phase 05](phase-05-bounded-remediation-command-and-final-audit.md) | Full N/correction/refusal/final-success contract retained; future consumer actual final submissions separate from offline extension acceptance. |
| [Phase 06](phase-06-transactional-two-skill-installer-and-package.md) | Explicit agents/claude/both, exact map/API-result/CLI contract, shared then legacy locks, cross-root guards/rollback and all collision/concurrency/fault cases. |
| [Phase 07](phase-07-behavioral-evals-and-installed-host-smoke.md) | Actual three-mode packed installs; real host/version/loaded-root attribution, independent children, duplicate selection/isolation; full offline behavior coverage. |
| [Phase 08](phase-08-live-qualification-documentation-and-handoff.md) | Historical-report review, mandatory offline package/host/eval/privacy/docs handoff; filename retained, no mandatory new live matrix. |
| [Contracts §2](design-contracts.md#2-installed-payload-contract) | Fixed exact 18 proposed destinations/root, 36 both; one source tree, two entrypoints/root, API/result/root/lock/rollback semantics. |
| [Contracts §7](design-contracts.md#7-validation-boundaries) | Mandatory offline extension gates, historical evidence limits and separate future consumer runtime-success prerequisites. |
| [Acceptance matrix](acceptance-matrix.md) | Dual-root A02/A07/A08, offline D03/D08/C01/C08/E01/E02/E04/E06, historical/privacy E07/E08 and required installer/host/eval/docs inventory integrated. |
| Research / dated receipts | Historical observations/recommendations remain unchanged; former agents-only/live-gate/snapshot requirements do not govern current execution. |

The approval details below remain decision provenance; use the concrete current execution documents linked above, not a contradictory snapshot-plus-override workflow.

## Approved Phase 06 decision details

1. Confirm existing `--target` CLI semantics and exported references first. Keep existing `--target agents --directory <project>` behavior; missing/unsupported target still errors. Extend the same option with `claude` and `both`; no new binary flags or automatic default to both. Explicit `both` is required to write both roots.
2. Fixed inventory: ten existing domain assets plus four references, actor prompt and two templates, plus one sibling command entrypoint. Map each of these 18 proposed payload files into each selected root's `skills/sonarqube-test-quality/` or `skills/cmd-sonar-remediate/`. Same package source serves both roots; no duplicate authoring trees or host-specific command rewrites. `both` proposes 36 destination files, not 36 source assets.
3. Preserve agents exported call forms, single-target `installationRoot`/action path/result semantics. Current [API-result contract](design-contracts.md#api-and-cli-actionresult-semantics): agents `<project>/.agents`, claude `<project>/.claude`, both validated `<project>` with root-qualified action paths; plan collections and dry/apply result shapes retained. Update all affected callers/tests and `bin/install.js` root-aware help/actions/discovery; no obsolete-map aliases.
4. All new modes acquire transient project `<project>/.sonarqube-test-quality.install.lock`, then existing agents-domain `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever agents selected, deterministic order. Legacy guard coordinates older agents-only installers ignoring shared lock. Claude-only need not create agents skill directory. Release only successfully owned locks, reverse order including partial acquisition failure; pre-existing locks block, never stale auto-delete.
5. Validate source files/ancestors and every project/root/ancestor/destination regular-file/directory non-symlink type/containment before writes; recheck under locks and per file against byte/object/type races. Project lock coordinates participating installers, not arbitrary user writes. Retain unrelated/concurrent-file protection. Dry-run previews selected roots without creating project/locks/directories/staging files.
6. One plan/stage/publish/verify/caught-failure rollback spans selected roots. Stage beside each destination on its volume; reject unsupported filesystem boundaries, no cross-volume atomicity claim. Restore original replacement bytes, remove only owned additions/temp/empty directories, preserve unrelated/concurrent content; conflicts/restoration failures report partial rollback and affected paths. No persistent journal/crash recovery/atomic simultaneous-reader visibility promise.
7. Package commands/agents/templates/references through existing allowlist. No native `.claude/agents/` registration or configuration; the portable prompt under each selected `skills/sonarqube-test-quality/agents/` is payload only. Command → domain links resolve within that root from installed paths, never source cwd or presumed parent repo.
8. Permanent consumer-visible cases: agents-only preserves old behavior; claude-only touches no agents payload; both exact two-root layout; repeat no-op; dry-run no writes; sibling/root-only collision blocks entire plan; force+confirmation required for differing files; detected symlink/type blockers never overridden; project lock conflict; existing agents lock conflict. Retain race rechecks/specified concurrent-data preservation without claiming arbitrary-writer TOCTOU isolation.
9. Deterministic races/faults via existing hook: agents vs both and claude vs both concurrent installer attempts; legacy agents lock vs both; failure after first root already changed; mixed additions/replacements across roots; concurrent user-created file survives; successful restore releases owned locks; restore failure reports incomplete rollback. Do not test only mapping echoes or incidental wording.
10. Run consolidated extension package tests after integration; actual CLI install/reinstall/replacement/collision smoke in disposable roots for each target; extract packed package and repeat from outside source checkout. No Sonar network credentials/uploads needed.

## Approved Phase 07 host decision details

- Roots are installation targets, not runtime names. Identify available actual consuming host(s), version, explicit loaded skill path and invocation method using installed help/config. Do not infer `.claude` means Claude Code has loaded the intended asset.
- Exercise each root's sibling resolution and actual command/domain/actor-reference loading. Use real generic children and independent role terminal results for approved offline behavioral/snapshot-capability cases. No native actor registration/settings writes; no fabricated child execution.
- When one host discovers both copies, observe duplicate-name handling and actual loaded path. Do not assume precedence or count two installs as two host qualifications. Require unambiguous selected active copy using a supported explicit host invocation/isolation mechanism; if that runtime cannot select safely, mark both-root runtime ambiguous/unqualified and document single-root operation. Do not automatically rewrite settings/delete copies to fix it.
- Retain complete lifecycle/N/applicability/auth/refusal/identity/paging/mutable-consistency/final-success scenario coverage from Phase 07, but execute using labeled offline behavioral contexts. Report-backed lessons and models/synthetic fixtures cannot claim live server proof. Unavailable host/eval execution remains an honest host gate, distinct from removed live gate.

## Approved Phase 08 documentation / handoff decision details

1. Review the preserved report summary and matching vendor docs; record exactly which history/lessons inform policy and which version/toolchain restrictions remain optional. No live-project acquisition, new auth, scanner upload, fresh coverage/task/final audit required here.
2. Compile actual package tests, packed installation for three target values, collision/rollback proof, real available-host/root-attributed child behavior and privacy-reviewed guidance/eval receipts. Do not describe unexercised hosts/languages as qualified.
3. Update extension README and core docs with approved explicit root selection, package/host behavior, no native registration, rollback limits, no automatic commits/pushes and run-level real-server success rules. Label supplied report as historical; fresh live behavior remains unexercised, not release blocked.
4. Keep plans private/local. Tracked docs contain self-contained design/result prose and links only to tracked resources; remove/replace links into ignored plans. No ignore edits/force-staging/commit performed without separate authorization.
5. Remove throwaway scripts after actual smoke; retain approved local evidence privately. Deliver completed extension implementation only when required offline package/host/eval/doc gates pass. State clearly no fresh live server qualification was requested/performed; it is not an unfinished mandatory phase.

## Implementation entry / pending approved work

Contracts are reconciled now; this is planning work, not implementation progress. All phase status/implementation lists remain pending/unchecked.

- [ ] Phase 01 freezes current integrated contracts/capabilities before authoring; no addendum-application prerequisite.
- [ ] Phase 06 implements explicit agents/claude/both mapping, API/CLI actions/results and every approved transaction/race/fault check.
- [ ] Phase 07 proves actual packed install/root/host/independent-child behavior and complete offline eval, replacing obsolete agents-only assertions; no assumed duplicate precedence.
- [ ] Phase 08 closes supplied-history review, privacy/docs and mandatory offline handoff without a new live gate.

Recommendation: execute the current linked phases/contracts/matrix in dependency order. No unresolved user decisions. Actual consuming-host/version/root-selection/independent-child/eval capabilities remain discoverable required offline implementation facts; actual remediation-run Sonar access/checks/coverage/upload/commit/owner approvals remain separate consumer prerequisites, not extension-completion gates.
