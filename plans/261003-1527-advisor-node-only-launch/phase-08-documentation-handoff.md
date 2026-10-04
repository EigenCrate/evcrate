# Phase 08 — Documentation and handoff

## Context Links
- [Architecture contract](architecture-contract.md); [Darwin runtime contract](darwin-runtime-contract.md); [acceptance matrix](acceptance-matrix.md).
- [Caller inventory](research/caller-inventory.md); [baseline](research/repository-baseline.md); [platform research](research/platform-qualification.md).
- [Darwin storage design](research/macos-storage-design.md); [Darwin process design](research/macos-process-design.md).
- [Linux candidate](phase-06-package-linux-qualification.md); [native Windows evidence](phase-07-native-windows-qualification.md).
- [Architecture authority](../../docs/system-architecture.md); [standards](../../docs/code-standards.md); [PDR](../../docs/project-overview-pdr.md); [README](../../README.md).

## Overview
- Date: 2026-10-03. Priority: P2.
- Implementation: pending. Review: pending. No gates, documentation cutover, publication or commit performed during planning.
- Dependency: accepted Linux final-candidate receipts, all required native Windows rows including separately recorded real console evidence, complete Darwin integration and both build-only artifacts/provenance.
- Outcome: truthful current documentation, complete maintained-caller disposition audit, final integration review and operator handoff; no automatic deployment/release.

## Key Insights
- Documentation is part of the launch contract: workflow, SKILL.md and brief-contract.md currently prescribe direct POSIX launch. Updating only runnable examples leaves a contradictory maintained caller.
- Generated target instructions must derive from canonical `.claude` resources. VSCode is currently target eight and a native projection, not another generated Claude workflow or a newly supported controller backend.
- Prior Windows/400-test history belongs to dated candidates. Do not promote it into evidence for this candidate or overwrite historical support facts.
- Darwin build-only success and Linux/Windows regressions cannot prove macOS module load, storage, SDK-declared libproc behavior, console or filesystem behavior. Actual source + built assets + full integration permits only **implementation present, untested/unqualified**. Follow the revised `proc_pid_rusage(RUSAGE_INFO_V0)` contract, not the superseded private flavor-18 design.
- Documentation changes can alter the npm/archive/projection bytes. A frozen candidate receipt cannot silently cover later README/brief/generated changes; final documentation must respect candidate identity.

## Requirements
- Synchronize architecture, code standards, current PDR, README, roadmap, project changelog and root changelog; update codebase summary when changed files/counts require it. Preserve historical sections/receipts and unrelated user edits.
- All current runnable callers/examples use `node <absolute HOME-owned advisor> [args]`, exact UTF-8 JSON stdin and operation argv; no OS-selected direct execution, shell fallback, alternate interpreter, wrapper, `--file`, entrypoint rename or provider retry change.
- State callers preserve canonical project cwd; health diagnostics retain intentional packageRoot cwd. Node-parent code can use `process.execPath`; Bun-hosted harness instructions must explicitly select Node instead of assuming Bun's execPath is Node. No new Bun CLI support claim.
- Current target wording follows `.evcrate/targets/manifest.json` and actual generation behavior, presently eight IDs including vscode; distinguish target IDs, companion roots, native resources and shared controller inventory count.
- Publish candidate-scoped evidence and nonclaims. No live vendor inference required; fake provider/real controller results are not production provider compatibility, model quality or all-platform parity.
- F01 and final reconciliation of N01/P01–P03/W01–W03/D01–D06 must have parent-reviewed evidence, without any unrun PASS or hidden macOS test gate.

## Architecture
- Disjoint units: **developer documentation** owns standards/architecture/codebase summary; **product documentation** owns PDR/README; **history/release notes** owns roadmap/changelogs; **caller audit** produces one-time disposition evidence only. Parent integrates overlaps/canonical-resource fixes, runs final gates and controls release authorization. Workers skip gates/formatters.
- Current architecture/standards/PDR are normative; this plan's contracts describe intended scope, not a replacement production architecture. Final docs reflect implemented/evidenced state and explicitly separate the deliberate macOS no-test boundary.
- Freeze rule: never edit Phase 06 payload or Phase 07 receipts. Changes to canonical/generated/runtime/package/test/manifest/publishable-document bytes create a **new candidate**, rerun Phase 06 Linux qualification and Phase 07 matrix before final acceptance. No speculative declaration that documentation-only package changes preserve byte identity.
- Pure phase/evidence annotations outside candidate may append supplemental relative-path/size/SHA-256 records; they do not change qualified payload or expand platform claims. Parent owns top-level plan/progress reconciliation; sealed advice-controlled plans stay immutable, with external receipts/current overview rather than status rewrites.
- Avoid endless receipt self-reference: docs describe approved scope and link to stable plan/evidence locations; candidate manifest/receipt digests live in external receipts. Do not embed a package's own final digest inside its payload.

## Related Code Files
- **Modify:** `docs/system-architecture.md`, `docs/code-standards.md`, `docs/project-overview-pdr.md`, `README.md`, `docs/project-roadmap.md`, `docs/project-changelog.md`, `CHANGELOG.md`.
- **Modify if current source map/counts changed:** `docs/codebase-summary.md`.
- **Verify-only historical boundaries:** `docs/workspace-advisor-pdr.md`, `docs/workspace-advisor-host-contract.md`, `docs/project-changelog-archive.md`; do not rewrite retired plugin instructions as current callers.
- **Verify-only canonical cutover; modify only actual residual active instruction:** `.evcrate/source/.claude/workflows/advisor-mentoring.md`, `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md`, `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`, `.evcrate/source/.claude/agents/advisor.md`.
- **Verify-only transport migration:** `scripts/consult-advisor-phase-e02.mjs`, `scripts/consult-advisor-phase-e03.mjs` (all four spawns each; never execute or alter historical payloads/snapshots).
- **Verify-only maintained programmatic boundary:** `src/cli/health.ts`, `src/cli/process-runner.ts`, `src/cli/dispatch.ts`.
- **Verify-only native target authority:** `.evcrate/targets/manifest.json`, `.evcrate/targets/vscode/manifest.json`, `src/adapters/vscode/workflows.ts`, `src/adapters/vscode/skills.ts`, `src/adapters/vscode/commands.ts`, `src/adapters/vscode/agents.ts`, `src/adapters/vscode/instructions.ts`, `src/adapters/vscode/runtime-sources.ts`, `src/adapters/vscode/lifecycle.ts`.
- **Verify-only tests:** `tests/adapters/phase08-mentoring-integration.test.mjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/cli/health.test.mjs`, plus all tests identified in Phase 02 caller audit; retain correct nested paths, not omitted root locations from research.
- **Generated if canonical instructions change:** `.evcrate/registry.json`, `.evcrate/build-manifest.json`, each target-specific `.evcrate/build-manifest-<target>.json`, declared projections under `.evcrate/source/`, `.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs`, `src/manifests/controller-inventory.generated.ts` when inventory changes.
- **Verify-only generation authority:** `package.json`, `scripts/generate-runtime-brief.mjs`, `scripts/generate-controller-inventory.mjs`, `scripts/build-manifests.mjs`.
- **External evidence, parent-owned:** final caller audit, final review/evidence index, supersession receipts and overview reconciliation. No old plan/report edits or live HOME publication.

## Implementation Steps
1. Parent verifies Phase 06/07 receipts refer to the same final candidate, real host rows, scenario IDs and artifact provenance. Missing Windows console, missing build assets, failed gates or incomplete Darwin callsites block completion; document real status rather than flattening it into DONE.
2. Capture exact documentation baseline and divide disjoint units above. Preserve concurrent user VSCode/registry work. Identify every changed file that is in candidate/npm/controller/projection inventories before authoring; plan its necessary return through 06→07, never patch immutable payload.
3. Developer-doc unit updates architecture sections 1/4/5/6/7 and applicable ownership/closure sections: one Node outer launch, project versus diagnostic cwd, strict HOME semantics, stdin/framing/error boundary, retained shebang/bin metadata, OS-native supervision and Darwin descriptor/process capability internals. Record real generated closure count/asset types, not a historical constant. If a genuine diagram needs change, use existing diagram conventions; no diagram for trivial launcher trivia.
4. Update standards with canonical authoring/generated boundaries, Node-parent versus shell/Bun-harness selection, no fallback/project controller/JSON argv, fixture isolation, binary classification before UTF-8 and provenance/build-only policy. Keep existing Windows native Job/C#/PowerShell and POSIX group/terminal constraints; do not remove unrelated execute-bit/installer policies.
5. Product-doc unit updates current PDR requirements/acceptance and README advisor usage; retain the unrelated `evcrate` CLI and its existing request-file contract, no new advisor `--file`. Explain supported Node engine, HOME installation, Bash and actual PowerShell syntax, Unicode/EOF behavior, project cwd and launch-failure classification. Avoid presenting an npm-generated bin shim/direct script path as the maintained invocation.
6. Reconcile current target counts from actual authority: antigravity, claude, codex, copilot, gemini, omp, pi, vscode. Explain `.agents` companion and native VSCode generated lifecycle/resources where applicable. Do not mass-replace historical "seven" wording: dated seven-target evidence stays historical; current normative statements change only with current-repo proof.
7. History-doc unit adds a dated current entry and roadmap status for this launch/Darwin work: actual phase states, candidate/environment/scenario scope, real gate totals/skips and evidence links. Root `CHANGELOG.md` gains an appropriate Unreleased entry only; no new version/release/tag/commit is fabricated. Retain old Windows support summaries as dated history, not proof of current bytes.
8. Use this support table consistently across README/PDR/architecture/roadmap/changelogs; populate concrete receipts only after observed gates:
   | Platform/evidence | Allowed final statement | Required limitation |
   |---|---|---|
   | Linux final candidate | Verified on recorded Node versions, architecture and behavioral/package scenarios | Not production rollout or live-provider quality |
   | Native Windows final candidate | Verified on recorded four-row Node/PowerShell matrix and advisor scenarios, with real console evidence separately identified | Not all providers, desktop/UAC/enterprise/ARM64 or general CLI parity |
   | macOS | Advisor behavior implementation present with arm64/x64 built assets and integrated native internals | **Untested/unqualified; no addon/advisor execution or tests on macOS** |
   | Fixture providers | Real controller/process lifecycle against explicit deterministic fake packages | Not vendor service/account/model qualification |
9. Perform a one-time maintained-caller audit using repository search/inspection, not permanent source-string tests. Scope canonical workflow/skill/brief/active commands, source spawns, both consult scripts, test helpers, current docs, every configured projection and native VSCode generated instructions/runtime resources. Reconcile with N01/caller inventory and list each path as migrated, already Node, non-launch metadata, historical immutable or unrelated CLI/provider boundary.
10. Explicitly confirm SKILL.md line-31 instruction **and** brief-contract.md line-25 instruction migrated; research initially missed these. Verify four Node spawns in **each** consult-e02/e03 without executing them. Health normally stays verify-only and retains packageRoot cwd. Inspect shebang/bin mapping as retained metadata, not permitted runtime fallback; do not add a counsel-agent launcher to the tool-less agent.
11. Audit all eight current target outputs. Resolve generated workflow/skill/reference links, Node wording and metadata with current adapter semantics. Native VSCode may not mirror workflow files: verify actual generated instructions, resources and any maintained runtime consumer; absence of an advisor process launcher is a recorded non-launch disposition, not permission to invent an integration. No source-string audit alone establishes runtime behavior.
12. If canonical resource text changed, parent regenerates in an approved disposable snapshot using existing scripts, not live publication:
    ```bash
    npm run generate:all
    npm run distribute:build
    ```
    Runtime brief generation comes through build/prebuild; generated inventory only via generator. Reconcile source/generated bytes and target count. Leave unrelated root harnesses intact; no `distribute`, `distribute:all`, `distribute:publish` or `publish --apply` to real HOME.
13. Parent runs final end-of-phase Linux gates once after all documentation/integration edits land, in the controlled snapshot:
    ```bash
    npm test
    node --test tests/cli/health.test.mjs tests/advisor-controller/node-launch.test.cjs
    node tests/advisor-controller/smoke-30s.cjs
    npm run release:check
    npm run distribute:check
    ```
    `node-launch.test.cjs` is proposed in Phase 03 until created. Record actual commands/environments/exits/counts/skips and installed behavioral receipts; do not use the echo-only lint script as evidence. Validate edited Markdown links/current references with available repository authority or manual inspection, without inventing a documentation/lint command.
14. Compare final approved output bytes against qualified candidate manifest. Unchanged payload means Phase 07 receipts remain applicable. **Any changed payload bytes**, including README/changelog/brief/projections or tests, require new Phase 06 freeze/qualification and same-new-candidate Phase 07 runs before final acceptance. Final Linux commands that regenerate outputs must run in a working copy, never the frozen archive. Pure external annotation files receive supplemental hashes and do not claim candidate qualification themselves.
15. Parent reviews architecture-versus-code behavior, caller disposition and all acceptance IDs. Evidence index records candidate identity, Linux and four Windows rows, genuine console versus headless outcomes, Darwin compiler/SDK/header/ABI/source/artifact provenance, static-review scope, unavailable/not-run limitations and owned fixture cleanup. Correct false wording before accepting F01; original failed/superseded receipts remain truthful.
16. Parent reconciles top-level plan/progress under the applicable ordinary/advice-controlled rule; planner never initializes controller runs or edits sealed baselines. Hand off final source/candidate/evidence paths, remaining operator prerequisites, and candidate invalidation rule. No commit, publication, release workflow, rollout or live vendor probe without separate explicit authorization.

## Todo List
- [ ] Current architecture/standards/PDR/README agree on launch and support boundaries.
- [ ] Roadmap/project/root changelog and changed codebase summary reflect observed results only.
- [ ] All active canonical, script, test and eight-target/native callers have disposition evidence.
- [ ] Final gates and candidate-byte reconciliation complete; changed payload requalified through 06→07.
- [ ] Parent accepts evidence index, nonclaims and operator handoff without production action.

## Success Criteria
- F01 accepted: one launch convention with correct stdin/HOME/cwd/failure semantics across all maintained documentation/callers; generated output derives from canonical authority.
- No old direct POSIX instruction survives in active workflow/skill/brief/examples; metadata/historical exceptions have explicit truthful dispositions.
- Linux/native Windows assertions point to exact final-candidate receipts; headless rejection cannot stand in for actual console success. No unrun PASS, signed-provenance fiction or live-provider/all-platform claim.
- macOS source and both packaged native assets exist with full integration; documentation always says implementation present **untested/unqualified** and records SDK/libproc compatibility, loader and filesystem uncertainty.
- Final generated/package bytes match qualified identity, or a new candidate has completed required Linux→Windows qualification. No live HOME writes, commits or publication.

## Risk Assessment
- Docs accidentally imply broader support: use one scoped evidence table and parent cross-document review.
- Generated/native target mismatch: inspect current output roots/adapter semantics; no seven-target assumption or hand-edited generated copies.
- Late docs alter packaged bytes: explicit candidate invalidation/requalification, not a stale receipt relabeled final.
- Broad search finds historical/direct shebang metadata: classify instead of modifying sealed reports or unrelated control-plane/provider launch paths.
- Fake fixture validation status could be mistaken for performed checks: require actual executed validation receipts and distinguish synthetic advice from live vendor results.

## Security Considerations
- Sanitized receipts only: no credentials, production policy/history, raw environment, sensitive project snapshots or full console dumps.
- Preserve owner-approved dirty work and baseline immutability; no staging/reset/stash/commit disguised as documentation cleanup.
- Keep human authorization genuine and native assets provenance-bound; do not document bypasses for console/identity/descriptor safety failures.

## Next Steps
- Deliver parent-reviewed pending-to-completed reconciliation only after all real implementation/evidence gates satisfy this plan.
- Operator may separately authorize deployment/publication/commit; this phase does not. Future macOS runtime testing needs separate user authorization, not an automatic final task.

## Unresolved Questions
- No remaining scope decision. Execution may still need owner-approved snapshot, controlled Apple builder/SDK/API pins, native Windows hosts and authentic console access; record unresolved gate prerequisites instead of claiming completion.
