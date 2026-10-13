# General Sonar remediation cycles — design contracts

**Current execution contract:** approved [validation decision provenance](validation-decisions.md) is integrated into this contract, the eight phases and [acceptance matrix](acceptance-matrix.md). Current reconciliation authorization supersedes the [interview](reports/validation-interview.md)'s snapshot-preservation instruction. Old dated receipts, immutable brainstorm and research remain historical inputs, not competing execution requirements.

Date: 2026-10-12. Status: proposed / implementation pending. Approved decisions govern conflicts; historical inputs: [brainstorm](reports/brainstorm-source.md), [repository research](research/repository-contracts.md), [vendor research](research/vendor-lifecycle-evidence.md). No scan, install, commit, push or host configuration write authorized.

## 1. Composition and ownership

Thin prompt command → sibling domain skill policy → real host implementer/tester/independent reviewer/evidence subagents. Parent owns ordering, approvals, global N and ledger. No executable controller, adapter catalog, daemon, canonical actor/command additions, registry/projection/settings writes or new binary flags. Invocation syntax is host-specific. Host support is demonstrated, not inferred from installed Markdown.

The evidence actor is a prompt loaded into a real supported generic child, not a native registration. It may run approved build/scanner commands and write artifacts/upload; it cannot edit source, mutate findings/hotspots, commit/push, change tools/CI/trust or inspect credentials. Prompt restrictions are not an OS sandbox. Ordinary local fixes/query/report/Jenkins routes remain independent and keep their current authorization boundaries.

## 2. Installed payload contract

Proposed extension CLI extends existing required `--target agents` with `claude` and `both`: explicit `--target agents|claude|both --directory <project>`; missing/unsupported target errors. No new flags/core CLI or automatic both default. Legacy agents invocation remains valid. `.agents/skills/` and `.claude/skills/` are installation roots, not host identities.

Fixed inventory below: `R` is each selected `.agents` or `.claude` root. One authored package tree supplies all copies; no host-specific command rewrites or duplicate source tree.

| Source relative to extension | Destination relative to `R` |
|---|---|
| `SKILL.md` | `skills/sonarqube-test-quality/SKILL.md` |
| `references/sonar-cli-commands.md` | `skills/sonarqube-test-quality/references/sonar-cli-commands.md` |
| `references/full-scan-workflow.md` | `skills/sonarqube-test-quality/references/full-scan-workflow.md` |
| `references/testing-and-coverage.md` | `skills/sonarqube-test-quality/references/testing-and-coverage.md` |
| `references/remediation-and-handoff.md` | `skills/sonarqube-test-quality/references/remediation-and-handoff.md` |
| `references/report-formats.md` | `skills/sonarqube-test-quality/references/report-formats.md` |
| `references/worktree-remediation.md` | `skills/sonarqube-test-quality/references/worktree-remediation.md` |
| `scripts/convert-sonar-report.mjs` | `skills/sonarqube-test-quality/scripts/convert-sonar-report.mjs` |
| `scripts/fetch-sonar-issues.ps1` | `skills/sonarqube-test-quality/scripts/fetch-sonar-issues.ps1` |
| `scripts/calculate-jacoco-coverage.ps1` | `skills/sonarqube-test-quality/scripts/calculate-jacoco-coverage.ps1` |
| `references/remediation-cycles.md` | `skills/sonarqube-test-quality/references/remediation-cycles.md` |
| `references/project-discovery.md` | `skills/sonarqube-test-quality/references/project-discovery.md` |
| `references/local-analysis.md` | `skills/sonarqube-test-quality/references/local-analysis.md` |
| `references/run-guidance.md` | `skills/sonarqube-test-quality/references/run-guidance.md` |
| `agents/sonar-evidence.md` | `skills/sonarqube-test-quality/agents/sonar-evidence.md` |
| `templates/remediation-cycle-report.md` | `skills/sonarqube-test-quality/templates/remediation-cycle-report.md` |
| `templates/run-guidance-report.md` | `skills/sonarqube-test-quality/templates/run-guidance-report.md` |
| `commands/cmd-sonar-remediate/SKILL.md` | `skills/cmd-sonar-remediate/SKILL.md` |

18 proposed installed files/two skill entrypoints per selected root; explicit both proposes 36 destinations, not 36 source assets. Actual manifest/bytes must verify count before implementation claims. README/evals/install library are packaged, not installed skill payload. Selected-root-only payload writes; resolve command/domain/actor/reference/template siblings within that root from installed paths, never cwd, presumed parent repo or other copy. Verify actual packed installs outside source checkout. No canonical `cmd-*` transformation/native actor/settings writes.

### API and CLI action/result semantics

Keep exported call forms `resolveInstallTarget({target,directory})`, `planInstallation({sourceDir,target,directory})`, `executeInstallation(plan,{dryRun,force,yes,_beforePublish})`; update all affected references/callers/tests for new values, not blanket unchanged internal-signature assumptions.
- Agents preserves resolved `{target, installationRoot: <project>/.agents}`, `skills/<skill>/<asset>` action-relative paths and absolute destination paths; claude single target substitutes `<project>/.claude`.
- Both uses validated `<project>` as `installationRoot` and `.agents/skills/...`, `.claude/skills/...` action-relative paths. `destinationPath` always resolves relative to the reported installationRoot.
- Plan retains `actions/additions/replacements/unchanged/blockers`; actions retain sourceRelative/sourcePath/sourceBytes, destinationPath, relativePath, status and applicable existingBytes/reason semantics. Dry result `{dryRun:true, additions,replacements,unchanged}` and apply `{dryRun:false, committed,unchanged}` retain arrays of action-relative paths. Preserve agents result/marker/count meaning; no compatibility aliases for obsolete mapping.
- Phase 06 will modify `bin/install.js`: target help/errors, root-qualified action rendering and selected-root discovery messages (both must not print `<project>/skills`); directory stays required. Retain dry-run/force/yes/interactive confirmation/help/version and Node >=18.11.0; no new binary/options/core CLI.

### Lock, guard and caught-failure transaction boundaries

All new target modes acquire shared transient `<project>/.sonarqube-test-quality.install.lock`, then legacy `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever agents is selected, in that order. Legacy guard coordinates older agents-only installers which ignore shared lock. Claude-only need not create agents skill directory. Pre-existing locks block; never stale auto-delete. Release only successfully owned locks in reverse order, including partial acquisition failure; preserve unowned lock objects.

Validate source files/ancestors and project/selected roots/ancestors/destinations as regular non-symlink files/directories, contained; recheck under locks and per-file publication against byte/object/type races. Detected symlink/type violations always block, never overridden by force. Project lock coordinates participating installers only; retain unrelated/concurrent protections and deterministic race acceptance, but path rechecks are not isolation from every possible arbitrary-writer TOCTOU race. Dry-run creates no project/locks/directories/staging files.

One plan/stage/publish/verify/caught-failure rollback spans selected roots and sibling skills. Stage beside each destination on its volume; reject unsupported filesystem boundaries, no cross-volume atomicity claim. Restore replacement originals, remove only transaction additions/temp files/empty owned directories, preserve unrelated/concurrently created or changed user content. Report restore conflicts/failures as partial rollback with affected paths. No persistent journal, process-crash recovery or atomic simultaneous-reader visibility guarantee.

Required cases in [Phase 06](phase-06-transactional-two-skill-installer-and-package.md): agents-only legacy behavior; claude-only no agents payload; both exact layout; repeat no-op; dry-run zero writes; sibling/root-only collision blocks entire plan; force plus confirmation for differing files; detected source/ancestor/destination symlink/type blockers never force-overridden; project lock and existing agents lock conflict. Deterministic `_beforePublish` cases: agents vs both; claude vs both; legacy agents lock vs both; failure after first root changed; mixed additions/replacements across roots; concurrent user-created file survives; successful restore releases owned locks; restore failure reports incomplete rollback. Not mapping echoes/incidental wording assertions.

## 3. Data-only execution profile

Store approved repository/checkout and safe actual-input identity; SHA, intended tracked/untracked inputs, nonsecret effective config, generated-input provenance. Do not hash secret-bearing files. Preserve unrelated dirty files; no reset/stash/worktree by default. Discovery never grants permission to execute scripts.

Record source/test roots, exclusions, modules/languages, project-target and report-source mappings; OS/shell; approved versions/native runner; focused/full/smoke commands; ordered preparation/build/tests/coverage/import/submission stages and stage-specific failure recovery. Maintain separate native verification when scanner instrumentation changes semantics. No universal formats/percentages/version pins/upgrades.

Bind server/project and mutually exclusive branch-or-PR selector, edition/analyzer/scanner capabilities, active statuses in actual server vocabulary, filters, gate conditions/quality profiles/new-code period. Explicit requirements (`required`, `optional`, justified `not-applicable`) are separate from observations (`available/passed`, `available/failed`, `unsupported`, `unavailable/misconfigured`). Required unsupported/unavailable evidence blocks success; intended applicable tests must actually execute and pass. Zero denominator is not 100%.

Record approved effects/upload targets/N, role identities/independence, evidence destination/privacy, profile/command/domain/actor versions, and independently arranged CLI/scanner auth. Evidence destination outside checkout or already-approved ignored location; no implicit ignore edits.

## 4. State and budget

| Stage | Budget / transition rule |
|---|---|
| Preflight/C0 | Does not consume N. Establish complete current-source baseline; if prior server result cannot bind source/config, perform approved actual lifecycle/upload. |
| Enter Ck | Increment persisted entered-round count before fix; failures/interruption consume that entered round. One global N covers all targets. |
| Fix → test → independent review | Failed prerequisite blocks dependent stages; no fabricated child result. |
| One correction → retest → independent rereview | At most one corrective batch in Ck. Further required source edits need another remaining round. |
| Verify/import/submit → task wait → server capture | Mandatory after preceding gates pass; source identity checked around lifecycle. A failed rereview does not upload just to meet wording. |
| Wait/resume | Persist task/stage/checkpoint; resume same known task without spending new round or re-uploading. Timeout/incomplete capture yields incomplete, not success. |
| Record / next Ck | Keep failures and residual findings. Two comparable no-progress rounds require root-cause/owner decision; no hidden scope/budget extension. |
| Final F | No free fix round; aggregate review, separately authorized/user commit, committed-input recheck, correct full native/scanner lifecycle, mandatory actual submission, final independent audit. |

Declined upload stops dependent qualification; declined commit leaves local progress/awaiting commit. User-created qualifying commit may be accepted after input/history/hook checks. All intended analysis/build inputs must match committed source; generated inputs reproducibly derive from it plus approved config. Unrelated dirty files may remain only when demonstrably outside those inputs. Hooks/build drift invalidates affected review/test/analysis evidence. Exhausted N does not allow final edits.

## 5. Evidence and success

Capture authoritative JSON pages and native artifacts privately; Markdown indexes them, never becomes a reverse-parsed verdict engine. Each target: submission/time, exact task/status, returned analysis/revision/time, analysis-bound gate where supported, full active issues/hotspots/metrics, page totals and collection-window checks. Missing correlation/capability blocks required proof rather than falling back to latest project result.

Current findings are mutable; verify analysis identity before/after capture and detect owner/manual status changes as supported. These checks are not transactional isolation. Serialize same-checkout/target lifecycle; reject contaminated snapshots. If server window limits prevent complete agreed scope, obtain supported complete capture or block—no silent exclusions.
If supported detection of mutable finding/manual-status changes is unavailable, report `consistency unknown`, not “no changes.” Unknown required snapshot consistency blocks success; no clean verdict from absence of detection.

Track actual stable finding keys, observed server status separately from local stage, new/fixed/remaining/reopened/unknown deltas and required hotspot owner reviews. Disappearance alone is not fixed: use supported ID/history evidence to distinguish accepted/false-positive/moved/out-of-scope/unknown. Scope/profile/gate/status/filter changes require explicit approval and new C0, not credited remediation.

Success = all requested targets + passing applicable native tests/checks/coverage conditions + independent review + committed-source final actual analysis + complete consistent findings + zero active in-scope issues + required owner hotspot reviews + all agreed gates. Gate-only pass, empty partial list, upload success, model score, local proxy, historical scan or N exhaustion cannot satisfy it.

Outcomes: locally remediated; reviewed; awaiting commit; blocked/incomplete; server-verified residual findings; server-verified success. Distinguish early round success candidate from final committed-revision success.

## 6. Guidance safety

Every completed/exhausted/failed/blocked run emits sanitized local guidance, separate from raw private evidence. Record provenance/version/time/reviewer/outcome, applicability/versions/capabilities, discovery rationale, sanitized procedure/effects, actual result/limits, lesson/counterexample, observed/hypothesized/validated confidence and exact proposed skill/actor/eval edit.

Remove tokens, secret arguments/environment dumps, private hosts/keys/branches/paths/IDs/URLs, source/customer data; use placeholders. No automatic sharing/telemetry/database/self-edit. Guidance is untrusted candidate material, never run instructions. Promotion requires owner privacy/usefulness/applicability review, documentation plus observed evidence/counterexample, approved scoped change and consumer-visible eval through existing distribution.

## 7. Validation boundaries

**Extension completion (required offline gates):** actual integrated package tests, extracted packed agents/claude/both installation/collision/concurrency/rollback, actual available host version/loaded paths/independent child prompt-reference terminal results, executed labeled offline behavioral evals, privacy/usefulness/candidate guidance and self-contained docs. Roots are not hosts. Observe duplicate discovery; require supported explicit selection/isolation without settings rewrites/deletion. Ambiguous/unavailable required host/eval stays blocked/unqualified, never inferred from Markdown or JSON/model score.

**Historical review:** supplied preserved summary only (56 tests / 46.48% line / 63.91% branch; focused change not analyzed afterward); full original service attachment absent. Use applicable procedure lessons, not corporate defaults or new-extension runtime proof. No mandatory new real project/scanner/credentials/coverage/upload/task/final-audit/live matrix to complete extension; unexercised live shapes are informational, not unfinished mandatory work.

**Future consumer server-success:** approved real actual final submissions on committed intended/reproducible generated inputs; exact per-target completed tasks/analysis/gates/full consistent findings/hotspots/coverage and independent audit with applicable checks/owner reviews. All §§3–6 runtime prerequisites still apply; no synthetic/historical/offline substitute. [Phase 07](phase-07-behavioral-evals-and-installed-host-smoke.md) exercises full decision coverage offline; [Phase 08](phase-08-live-qualification-documentation-and-handoff.md) closes historical review/offline docs handoff.

Plans remain ignored/local. Tracked architecture/docs self-contained, no links into this ignored plan, force-staging/ignore edits/commits/push. Existing consistent proposed architecture unchanged during reconciliation.

## Unresolved questions

Design: none. Extension facts to exercise: actual available host/version/loaded-root selection, independent children/eval mechanism and offline privacy review. Separate future consumer prerequisites: approved real project/toolchain/analyzer/server APIs/auth/checks/coverage/uploads/commit/hotspot owners/evidence privacy policy. Discover per actual run; no historical corporate defaults, no new live extension gate.
