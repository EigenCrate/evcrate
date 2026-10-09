# Phase12 whole-phase code review — cycle 2

## Code Review Summary

### Scope
- Authority: `local://phase12-review-cycle2-scope.json`: **136 authorized paths, 128 existing deliverables, 13 nonoverlapping bounded runs**. Inventory counts are supplied scope counts, not test counts or completed receipt counts.
- Reviewed current changes plus relevant callers against canonical `.evcrate/source/.claude/AGENTS.md`, PDR, architecture, code standards, development rules, protected Phase12/Phase08 contracts. Read `code-review` skill and verification reference directly.
- Focus: R1 predecessor/current durable-state policy, ownership preservation/rebase, CAS/raw journal digest/CLI correlation; R2 actual Pi installed command/main/child references and once-only context; R3 live seven-target docs/exact versions; R4 generated AGY deadline. Also canonical build safety, package/helper/hash closure, native leaf ownership and retired-selector boundary.
- Approximately **4,500 tracked changed lines**, plus new files and relevant unchanged callers; not a measured total-code or coverage figure. Deleted source/target modules reviewed through diff. Historical tracked projections/aggregate and goldens are not current acceptance inputs.
- Updated plans: none; protected plans and external ignored symlink descendants remain untouched. Only this existing report updated under parent-authorized scope2. No source/test/controller/index/stage/commit edits.

### Overall Assessment
**Score: 9/10 — reviewer judgment, not a coverage metric.** Cycle1's four accepted corrections are implemented with consumer-level evidence. No remaining critical/high implementation blocker identified in reviewed changes. Narrow legacy input handling restores the Phase08 ownership handoff without restoring retired selectors; Pi now resolves required resources against the installed extension; AGY hangs fail closed; live documentation matches the current contract.

This is a code-review recommendation for the selected Phase12 boundary, **not user approval, finalization, frozen-release qualification or durable completion**. Independent security analysis remains separate; parent must await both terminal reviews and truthfully record actual outcomes.

### Critical Issues
**None remaining identified.** No new broad-parent ownership, credential exposure or destructive user-file replacement found in reviewed changes. This does not replace the independent security report.

### High Priority Findings
**None remaining identified.** R1/R2 closure below is based on inspected consumers plus expressly parent/tester-reported executions, not reviewer reruns.

### Cycle1 Findings / Resolution History
Cycle1 score **7/10**; user selected **Fix all**, not approval. Retain original causes and boundaries:

| Finding | Original cause / consumer impact | Cycle2 disposition |
|---|---|---|
| **R1 — Critical: predecessor ownership inaccessible** | Current-only binding/target decoding rejected old Codex `.agents`, old project AGY/Copilot orders and retired Gemini durable records before migration/recovery could use them. Ignoring markers would lose CAS/ownership safeguards. | **Resolved within Phase12 reader/handoff scope.** `src/protocol/publication-payloads.ts:61-205` separates exact predecessor/current layouts and validates retained ownership; retired Gemini is durable-input compatibility, not a selector alias. `publication-plan.ts:189-229,470-481` rebases only owned Codex `skills/` paths, preserves historical residual ownership, and does not prune predecessor leftovers as current stale files. `publication-recovery.ts:327-399,472-476,1080-1308` retains raw operations digest, journal/marker identities, snapshots and scope-specific CAS through finalize/rollback. `src/cli/dispatch.ts:301-328` correlates historical recovery results without weakening current publish correlation. Actual prior Codex HOME/project dry/apply and four historical CLI recoveries reported PASS; full pinned-release upgrade/pruning still Phase08. |
| **R2 — High: Pi ordinary paths became cwd-relative** | Individual workflow/script/hook translation loop disappeared; command expansion and main/child payload insertion left ordinary references unresolved, permitting foreign-cwd lookalikes. | **Resolved.** `src/adapters/pi/transforms.ts:79-100` applies installed-resource markers with URI protection. `.evcrate/targets/pi/files/agent/extensions/evcrate/paths.js:71-137` bounds instruction reads and resolves markers against the actual installation; `hooks.js` admits once and supersedes only owned startup context; `child-context.js:1-78` resolves child context before delegation. Actual generated command/main/child foreign-cwd consumer in `command-files.test.mjs:169-292` covers wrong-root decoys, URI/raw-argument preservation, missing-resource refusal and recovery. Reported final Pi/adapter selection PASS. |
| **R3 — Medium: live docs contradicted current target/version contract** | README/architecture/skills/codebase summary retained eight targets/standalone Gemini; evidence shortened exact native versions. | **Resolved.** Live docs now identify seven targets, six translated families plus independent VS Code, eight manifest views including aggregate, package `2.10.0`. Native evidence preserves Codex `0.160.0`, VS Code `1.140.0`; post-correction OMP `18.8.6`/Pi `0.85.1` distinguished from earlier observations. Historical eight-target records are not rewritten as current acceptance. |
| **R4 — Medium: AGY context subprocess had no deadline** | New synchronous context bridge could block invocation indefinitely despite an output bound. | **Resolved.** `src/adapters/antigravity.ts:438-453` uses `timeout: 25_000`, `killSignal: 'SIGKILL'`, bounded output and error/status refusal. Generated hanging-hook consumer `tests/adapters/antigravity-context.test.mjs:252-301` reports exit2, no stdout and reaped child. No retry or permissive fallback. |

Historical validation preserved, not relabeled: initial **222/231**, corrected **209/212**, separate final **10/10** supplement; earlier build-generation **65/65**, Pi selection **8/8**. Never a single 212/212/full-suite pass. First post-fix publication selection **80/82** exposed two CLI fixture issues; fresh isolated all-view package and current Codex binding fixed those, assertions unchanged. Final **82/82** and **77/77** supersede that failed attempt for their selected boundaries only.

### Medium Priority Improvements / Warnings
- **Qualification limits, not remaining Phase12 corrective defects:** protected Phase07 owns tracked regeneration; Phase08 full pinned predecessor upgrade, removed-document pruning and leftover reporting; Phase09 goldens/full suite; Phase11 exact frozen qualification. Selected historical fixture recovery does not complete those contracts.
- **Native-surface limits:** AGY executable and VS Code GUI unavailable. AGY generated bridge/native registration and VS Code files/runtime closure are reviewed/tested boundaries, not native GUI/executable activation proof.
- **Package evidence age:** offline pack's 6,967-member proof predates accepted review corrections. Do not promote it into new/frozen package qualification.
- **Lint evidence unavailable:** `package.json:51` is an echo placeholder, not a real lint assessment. No issue count or lint pass inferred from it.

### Low Priority Suggestions
- Retained portability issue: `tests/adapters/contracts.test.mjs:35` hardcodes `/tmp` on non-Windows, bypassing `TMPDIR`; reported quota failures required private disk-backed bind mounts. Document/use a trusted scratch-root arrangement that meets capacity and ancestor-safety requirements. Do not weaken ownership/path checks just to relocate tests. Nonblocking for this reviewed implementation.

### Positive Observations
- Single graph-owned canonical AGENTS authority; no sibling instruction fallback. Shared physical `.claude-projection` mapping preserves logical `.claude` publication and canonical source bytes. Freshness checks stay before journaling and at promotion.
- Ownership remains narrow: Codex `.agents/skills`, AGY exact project hooks/rule leaves and HOME `.gemini/config`, Copilot exact `.github/copilot-instructions.md`. Unmanaged collision refusal and unrelated sibling preservation are retained.
- Durable legacy compatibility is explicit and input-only. Unknown/mixed layouts still fail; historical residual claims remain visible rather than silently abandoned or broadly pruned. Raw digest preservation avoids normalizing old wire operations before integrity verification.
- Pi/OMP payloads validate regular files, ancestors/no-follow, bounded size, strict UTF-8, NUL and nonempty content. Provider admission accounts for swallowed host lifecycle failures. Pi preserves reminders, user/other-extension instructions and history while superseding only its old startup body.
- Installed helper/scanner/catalog authority replaces cwd guessing. Operational references transform without renaming semantic targets/vendor/model identities. Adapter hash closure includes shared/native helper dependencies; consumer tests exercise invalidation and rejection, not merely exact prose/roster strings.
- Current selectors remain seven-target; standalone Gemini has no alias. AGY's vendor `.gemini` namespace is not mistaken for a retired Gemini target or ownership of the whole parent.
- Actual stale protected aggregate rejects with `PUBLICATION_FAILED`/exit5 while fresh current aggregate accepts. Fixture isolation repairs tests rather than weakening production validation.

### Actual Validation Commands / Results
**Reviewer execution:** read/grep/glob, scoped `git diff` and diff-stat inspection only. **No build, typecheck, test, lint, formatter, native check, pack, staging or controller operation rerun.**

**Parent/tester-reported**, grounded in `plans/reports/qa-261009-phase12-final-regressions.md` and `plans/reports/phase12-review-evidence.md`:

```bash
npm run build:clean && npm run typecheck:omp-runtime && unshare --user --map-root-user --mount sh -c 'mount --bind /home/loidinh/WS/evcrate-ws/evc-unified-naming/.phase12-verification-6CkJ4o/disk-tmp /tmp && TMPDIR=/tmp node --test --test-concurrency=1 tests/distribution/publication-recovery.test.mjs tests/distribution/publication-plan.test.mjs tests/distribution/publication-apply.test.mjs tests/distribution/publication-native-document-ownership.test.mjs tests/protocol/contracts.test.mjs tests/cli/publication.test.mjs'
```
- Reported **82/82 PASS**, exit0, zero failures/cancellations/skips/todos; 201529.65ms. Clean build and OMP typecheck PASS. Includes real CLI apply/repeat and handler binding correlation, historical publication decoding/recovery and native leaf ownership.

```bash
npm run build:clean && npm run typecheck:omp-runtime && unshare --user --map-root-user --mount sh -c 'mount --bind /home/loidinh/WS/evcrate-ws/evc-unified-naming/.phase12-verification-6CkJ4o/disk-tmp /tmp && TMPDIR=/tmp node --test --test-concurrency=1 .evcrate/targets/pi/tests/hooks.test.mjs .evcrate/targets/pi/tests/extension-smoke.test.mjs .evcrate/targets/pi/tests/runtime-integration.test.mjs .evcrate/targets/pi/tests/command-files.test.mjs tests/adapters/antigravity-context.test.mjs tests/adapters/omp-native-activation.test.mjs tests/adapters/help-consumer.test.mjs tests/manifests/adapter-runtime-identity.test.mjs'
```
- Reported **77/77 PASS**, exit0, zero failures/cancellations/skips/todos; 253949.91ms. Clean build and OMP typecheck PASS. Includes actual generated Pi foreign-cwd command/main/child consumers and AGY hanging-hook refusal.
- **159 selected tests across two separate commands**, not whole-suite coverage, not a new frozen-release qualification.

| Additional exact command / boundary | Parent-reported result and limits |
|---|---|
| `npm run build:clean && npm run typecheck:omp-runtime && node .phase12-verification-6CkJ4o/build-smoke.cjs` | Fresh seven-target `runAllManifestsBuild` PASS; views/aggregate derived together; canonical bytes unchanged. |
| `node .phase12-verification-6CkJ4o/predecessor-entry.cjs` | Actual prior Codex HOME/project dry/apply PASS; current leaf ownership/rebase, historical residual/user preservation, retired/unknown selector rejection. Not pinned release upgrade. |
| `node .phase12-verification-6CkJ4o/historical-cli-recovery.mjs` | Four actual CLI historical cases PASS: Gemini schema2 with mode, Codex schema3 without mode, finalized and interrupted rollback; raw digest/identities preserved, journal/workspace removed, user siblings untouched. |
| `unshare --user --map-root-user --net sh -c 'ip link set lo up && node .phase12-verification-6CkJ4o/native-bridges.cjs omp'` and identical command ending `pi` | Current OMP `18.8.6` and Pi `0.85.1`, each **11 distinct scenarios** PASS/exit0: startup body1; real compaction contexts `[1,0,1]`; four unsafe print and four unsafe RPC cases with zero provider requests; failed rebuild/recovery body1. Pi preserves user/other-extension content. |
| `node .phase12-verification-6CkJ4o/omp-repeat.cjs` | Fresh OMP apply then repeated dry-run exit0; only noop/preserve. Distinct from stale protected-root rejection. |
| Seven-target HOME/project owned-fixture updates, resolver authority discriminator | Updates PASS, three foreign files preserved; Copilot unmanaged collision exit5. Old protected aggregate rejected exit5/`PUBLICATION_FAILED`, fresh current accepted. Complete invocation strings not supplied; not invented. Updates not labeled fresh installs. |
| `npm pack --dry-run --json --ignore-scripts --offline` with isolated HOME/cache | Earlier exit0, 6,967 members; pre-review-corrections offline local proof only. No new package/frozen qualification claim. |

### Task Completeness / Recommended Actions
1. **No remaining must-fix identified in this code review.** R1–R4 closed for the selected Phase12 implementation, with deferred release qualification explicitly separate.
2. Parent must await independent security terminal report, reconcile any findings, and record actual declared checks/outcomes before a fresh canonical review checkpoint. This review does not write controller state or authorize commit/seal.
3. Explicit user approval remains pending. Neither Fix all nor passing bounded tests substitutes for approval or all 13 required receipts.
4. Preserve Phase07/08/09/11 deferred boundaries; do not mark protected historical checklists or the full plan complete. No remaining TODO/FIXME/HACK found in searched affected runtime areas; that search is not a declaration that every historical plan task is done.
5. Keep future regression fixtures fresh and isolated, current publish binding correlation strict, and historical durable input compatibility exact. Subsequent qualification should use its declared build/test/native/package commands; no broader check pass is claimed here.

### Metrics
- Remaining findings: **0 critical, 0 high, 0 medium implementation must-fix**; qualification/evidence warnings above; 1 retained low portability suggestion.
- Type coverage: not measured; parent/tester build and OMP typecheck PASS, no percentage inferred.
- Test coverage: not measured; 82/82 and 77/77 are bounded execution counts, not coverage percentages.
- Linting issues: unknown/not run; placeholder cannot produce a meaningful severity count.

### Reviewed Files
Exact scope inventory grouped below; brace notation enumerates files, not a whole-directory claim. Existing report/evidence files assessed as records; deleted files through diff. Authorized but absent `plans/reports/phase12-finalization.md` is not a reviewed implementation or completion artifact.
- `.evcrate/source/.claude/AGENTS.md`; deleted `.evcrate/source/CLAUDE.md`; `.evcrate/source/.claude/commands/{evc-cmd-bootstrap-x-auto-x-fast,evc-cmd-bootstrap-x-auto,evc-cmd-bootstrap,evc-cmd-code-x-auto,evc-cmd-code-x-no-test,evc-cmd-code,evc-cmd-help,evc-cmd-take}.md`; `.evcrate/source/.claude/scripts/ev-help.py`; `.evcrate/source/.claude/skills/code-review/references/code-review-reception.md`; `.evcrate/source/.claude/skills/planning/references/architecture-first-design.md`.
- `.evcrate/targets/{antigravity,codex,copilot,gemini,omp,pi,vscode}/manifest.json` (Gemini deleted); `.evcrate/targets/manifest.json`; `.evcrate/targets/pi/files/agent/extensions/evcrate/{hook-adapter.cjs,hooks.js,paths.js,child-context.js,index.js}`; `.evcrate/targets/pi/tests/{extension-smoke,hooks,runtime-integration,command-files}.test.mjs`.
- `CHANGELOG.md`; `README.md`; `docs/{code-standards,codebase-summary,project-overview-pdr,system-architecture}.md`; `guide/SKILLS.md`; `package.json`; `scripts/release/{installed-lifecycle-assertions,pack-inventory}.cjs`.
- `src/adapters/{advisory,antigravity,claude,index,markdown-frontmatter,projection-utils,registry}.ts`; `src/adapters/codex/{index,transforms}.ts`; `src/adapters/copilot/{adapter,common,instructions,inventory,prompts}.ts`; deleted `src/adapters/gemini/{frontmatter,index,replacements,resources,runtime}.ts`; `src/adapters/omp/{commands,index,templates}.ts`; `src/adapters/pi/{index,resources,transforms}.ts`; `src/adapters/vscode/{catalogs,common,hooks,instructions,inventory,references}.ts`.
- `src/context/invocation-context.ts`; `src/distribution/{build-resolution,cutover,input-snapshot,local-build-staging,local-build,manifest-view-derivation,output-paths,publication-inventory,publication-plan,publication-recovery,publication-rules,publication}.ts`; `src/cli/dispatch.ts`; `src/manifests/{manifest,types}.ts`; `src/protocol/{publication-payloads,validation}.ts`; `src/registry/{legacy-registry-reader,schema}.ts`.
- `tests/adapters/{antigravity-context,contracts,copilot-native-instructions,help-consumer,native-instruction-delivery,omp-native-activation,phase08-mentoring-integration,qualification,uri-restoration-differential,vscode-behavior,vscode-reference-closure}.test.mjs`; `tests/advisor-controller/{native-windows-qualification,qualification-bundle}.cjs`; `tests/context/invocation-context.test.mjs`; `tests/cli/publication.test.mjs`.
- `tests/distribution/{bounded-worker-staging,parity-verification-and-benchmarks,phase10-commands-and-evaluation,platform-and-lifecycle-contracts,publication-apply,publication-native-document-ownership,publication-parity,publication-plan,publication-recovery,release-and-cutover,single-projection-manifest-reuse,typescript-package-contracts,validation-and-rollout}.test.mjs`.
- `tests/fixtures/control-plane-v1/contracts.json`; `tests/fixtures/dam-hopper-v1/{discovery,import-apply,import-preview}.json`; `tests/fixtures/resource-registry-v1/record.json`; `tests/integration/dam-hopper-test-fixture.mjs`; `tests/manifests/{adapter-runtime-identity,distribution-manifests}.test.mjs`; `tests/protocol/contracts.test.mjs`; `tests/registry/target-schema-migration.test.mjs`; `tests/resource-fixture.mjs`.
- `plans/reports/{phase12-code-review,phase12-review-evidence,qa-261009-phase12-corrected-boundaries,qa-261009-phase12-final-focused,qa-261009-phase12-final-regressions}.md`.
- Additional relevant callers/contracts: Pi `commands.js`/`delegation-tool.js`, installed helper/scanner/catalog paths, protected aggregate/Phase12/Phase08 plan contracts, native development rules and code-review skill/reference. Protected/external references remain read-only, not current captured deliverables.

### Unresolved Questions
- None requiring an implementation decision in this code review. Explicit user approval and independent security disposition remain pending parent gates; deferred pinned-release/native qualification remains an acknowledged boundary, not an implied pass.
