# Project Changelog

## Unreleased

**Updated:** 2026-10-13
**Status:** Core package release history; General Sonar remediation cycles partial offline handoff (8/8 phases offline verified; live host unexercised); General Snyk remediation cycles Phase 08 documentation and closeout (DONE 2026-10-13T00:57:00+07:00), Phase 07 operational qualification index delivered (BLOCKED on operator prerequisites / 0% operational), Phase 06 local integration review and corrections (DONE 2026-10-12T23:41:05+07:00), Phase 05 delivery and acceptance scenarios (DONE 2026-10-12T22:54:45+07:00), Phase 04 main-owned command and correction loop (DONE 2026-10-12T22:20:46+07:00), Phase 03 specialist and skill cutover (DONE 2026-10-12T22:02:47+07:00), Phase 02 procedure and ledger contracts (DONE 2026-10-12T21:39:21+07:00), Advisor subsystem retirement with inline `/evc-cmd-advise`, VS Code `evc` plugin identity and container-local `cmd-*` command mapping, VS Code subagent frontmatter tool-reference correction, Unified evc-* naming and AGENTS.md instructions across all harnesses, Hook Materialization Scope Distribution, and Windows release qualification milestones recorded below. Dated entries describe their original candidates, not current runtime qualification.

### 2026-10-13 — fix(vscode): normalize Windows launcher path fragments and decouple local artifact path platform

- **Windows resolver path normalization:** Normalized backslashes in captured `%~dp0` operand fragments within `src/cli/vscode-editor-launcher.ts` before host-native `resolve()`; existing regular-file, containment, and symlink checks remain unchanged.
- **Local artifact path and editor resolver split:** Local artifact path resolution in `src/cli/vscode-companion-installation.ts` uses host `process.platform` because plugin artifacts are opened on the actual host filesystem, while injected `runtime.platform` continues to select the Windows editor resolver; coordinator regressions in `tests/cli/vscode-companion-installation.test.mjs` now exercise this split on POSIX with injected `runtime.platform: 'win32'`, covering Windows launch-target resolution and fail-closed behavior alongside companion regressions verifying traversal and missing layouts yield exit 5, a validated failure notice, and zero runner calls. Direct resolver tests cover forward, mixed, and backslash versioned path layouts alongside unversioned and fallback modes.
- **Final fresh local verification:** Local `npm run build` succeeded (exit 0), focused test suite `node --test tests/cli/vscode-companion-installation.test.mjs` passed 20/20 (exit 0), and broader CLI test suite `npm run test:cli` passed with exit 0 (88 passed, 1 Windows-only skipped; Node deprecation warning DEP0190 observed) on Linux x64 (Node 24.16.0).
- **Broader test suite and rollout status:** An earlier monolithic `npm test` run timed out at 600s during `test:cutover`. In separate invocations, `npm run test:validation-rollout` (5/6 passed) and `npm run test:distribution:rollout` (2/5 passed) failed while ignored stale `dist/release/` v2.11.0 assets were present (v1 metadata schema / stale inventory); no clean rerun established those stale assets as the cause (they were left untouched), and causal attribution remains explicitly unconfirmed. Full-suite completion and rollout success remain unverified.
- **Verification boundaries:** Native Windows host execution and external GitHub Actions CI workflow runs remain unverified.

### 2026-10-13 — feat(snyk): usage documentation, ledger templates, and evidence-bound closeout (Phase 08)

- Completed Phase 08 documentation and closeout of General Snyk remediation cycles: documentation deliverables complete; operational qualification blocked; end-to-end implementation incomplete pending operator prerequisites (plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-08-documentation-and-closeout.md`).
- Reconciled installer syntax and safety boundaries: updated all installation documentation across `ext/snyk-expert/README.md`, `ext/snyk-expert/docs/usage.md`, and `docs/snyk-expert-cli.md` to `--target agents --directory <project-root>`; reconciled safety documentation to reflect process-level locking (`.install.lock`), pre-execution drift checks, staged temporary files with best-effort rollback, and the trusted exclusive writer boundary without claiming adversarial race-proof concurrency.
- Documented 4-skill bundle and main-owned coordinator: documented the explicit 12-asset bundle with `cmd-snyk-remediate`, role ownership (Main owns budget, gates, live scans, terminal review; specialist owns single-set execution and local verification), host-neutral invocation, and honest explicit-read inline fallback mode.
- Documented 8-stage review/correction loop and attempt accounting: detailed the full 8-stage sequence (Steps 1–8), restart-safe attempt counting ($N \ge 1$, increment before first dependency-input/resolution-capable operation including failing native updates, zero refunds, evidence-only writes at zero $N$, clean runs consuming zero attempts), and Step 8 post-review correction returning to Step 1 fresh changed-state scan without duplicate label-only scans.
- Documented private target-contained evidence safeguards: formalized directory containment, access permissions, git-ignored untracked isolation, non-input/non-coverage verification, and immediate fail-closed pause on unsafe storage without silent external fallback.
- Provided illustrative abbreviated ledger templates: documented structural templates for immutable first-scan source inventory (distinguishing report assertions from authentic scan-zero presence), occurrence ledger, every-attempt observation ledger tracking every original finding after every started attempt, separate post-only findings ledger, license decisions, and durable run record summary, linking authoritative lossless schemas in reference contracts.
- Documented procedure learning and inert candidate recipes: codified append-only procedure learning observations within run records and inert sanitized `UNTRUSTED` candidate notes without automated runtime skill mutation or promotion prerequisites.
- Mandatory failed-attempt ledger finalization: encoded explicit Main-owned branch appending observations for every original record upon Step 4/5 failure (`Post-scan observation: failed/unavailable`; `Disposition: unverified` for attempted set and `remaining` for unattempted set), persisting failure logs/recovery requirements, retaining consumed attempts with `in_flight_state: 'started'`, and prohibiting next-set selection until resolution; verified via evaluation scenario 50 and focused test.
- Preserved truthful operational closeout boundary: documented delivery and specification completeness while maintaining that end-to-end operational qualification remains blocked pending operator provision of Phase 07 live prerequisites.

### 2026-10-13 — test(snyk): evaluate live operational qualification prerequisites and deliver qualification index (Phase 07)

- Delivered Phase 07 qualification index at [reports/qualification-index.md](../plans/261012-1944-general-snyk-remediation-cycles/reports/qualification-index.md) (plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-07-live-operational-qualification.md`).
- Categorized all 36 acceptance cases into Delivery, Specification, and Operational evidence classes. Verified delivery case SNYK-002 (package layout, inventory, and collision refusal) passed; verified 35 specification-covered cases.
- Recorded operational gate disposition: confirmed that live operational qualification requires real runtime host/model execution traces, native graph/consumer verification on isolated targets, and live authenticated same-scope Snyk scans. With Snyk CLI absent on `$PATH` (`PREREQ-05`), `SNYK_TOKEN` unverified/unset (`PREREQ-06`), isolated consuming targets unbound (`PREREQ-01..03`), target-contained evidence storage unbound (`PREREQ-08`), and network/registry access unvalidated (`PREREQ-07`), live operational cases (SNYK-001 partial, SNYK-003 through SNYK-031, SNYK-032a, SNYK-033 through SNYK-036) are recorded as **blocked on operator prerequisites**, and the conditional network troubleshooting branch of SNYK-032b is recorded as **unqualified**.
- Preserved zero mocks or synthetic waivers: no mock scanner or synthetic token check substituted; operational gate remains strictly fail-closed pending operator provision of live prerequisites.

### 2026-10-12 — feat(snyk): local integration review and corrections (Phase 06)

- Completed Phase 06 local integration review and corrections of General Snyk remediation cycles at 2026-10-12T23:41:05+07:00 (review 9/10 approved, 6/8 phases, 75% progress; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-06-integration-review-and-corrections.md`).
- Reconciled Phase 05 review warnings W1, W2, W3: removed fragile length heuristics, enforced explicit `Stimulus:` checks across all 49 evaluation scenarios, and aligned SNYK-035 storage boundary specifications with contract trace vocabulary (`current_stage`, `stop_reason`, `next_action`, access-controlled ancestor/leaf containment, single-writer ownership).
- Local integration verification: 46/46 package tests passing in `ext/snyk-expert`, 12/12 JS files syntax-verified via `node --check`, isolated direct install/dry-run sentinel preservation, 58/58 relative link resolution without repo escape, clean tarball packaging (24 assets) without test/report leakage, extracted package execution from unrelated cwd, and collision refusal preserving user modifications.
- Operational boundary: local smoke and specifications verified; live authenticated Snyk scans and model/tool trace qualification remain Phase 07 gates.

### 2026-10-12 — feat(snyk): register coordinator in installer inventory and qualify delivery scenarios (Phase 05)

- Completed Phase 05 delivery and acceptance scenarios of General Snyk remediation cycles at 2026-10-12T22:54:45+07:00 (5/8 phases complete, 62.5% progress; review approved 8.5/10 with 3 minor warnings noted for Phase 06 reconciliation; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-05-delivery-and-acceptance-scenarios.md`).
- Registered `skills/cmd-snyk-remediate/SKILL.md` in `ext/snyk-expert/lib/inventory.js`: `ASSET_INVENTORY` now contains 12 explicit assets (`agents/snyk-expert.md`, `skills/cmd-snyk-remediate/SKILL.md`, and 10 task skill and reference documents).
- Updated package scope description in `ext/snyk-expert/package.json` to reflect bounded remediation coordinator and ecosystem remediation scope.
- Expanded evaluation catalog `ext/snyk-expert/evals/evals.json` to 49 scenarios covering all acceptance matrix IDs SNYK-001 through SNYK-036 across Delivery, Specification, and Operational evidence classes, including multi-variant scenario specifications for SNYK-035 (storage boundaries: safe target-contained append vs. unsafe/tracked/unignored storage pause) and SNYK-036 (procedure learning observations and inert sanitized UNTRUSTED candidate notes without automated skill mutation).
- Hardened packaging and installer tests in `ext/snyk-expert/tests/cli-and-packaging.test.mjs`: verified asset uniqueness, verified new coordinator inclusion, verified pre-existing collision refusal preserving unrelated user sentinels while allowing authorized force replacement, and verified tarball packing, extraction, and installation execution from an unrelated cwd.
- Refactored `ext/snyk-expert/tests/workflow-qualification.test.mjs`: removed fragile phrase-pinning tests asserting arbitrary prose fragments; retained structural schema checks verifying schema adherence, acceptance ID coverage, SNYK-035/036 variants, and evidence-class categorization, explicitly labeled as non-runtime specification evidence.
- Verification & boundary: 49 eval scenarios structured, package installer and qualification suites updated (45/45 tests passing); static and delivery checks do not prove live coordinator runtime behavior or agent execution; integrated verification and code review scheduled for Phase 06, and live operational qualification scheduled for Phase 07.

### 2026-10-12 — feat(snyk): author main-owned command coordinator and 8-stage correction loop (Phase 04)

- Completed Phase 04 main-owned command and correction loop of General Snyk remediation cycles at 2026-10-12T22:20:46+07:00 (4/8 phases, 50% progress; review approved 8/10 with 6 non-blocking warnings noted for Phase 05/06 reconciliation; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-04-command-and-correction-loop.md`).
- Authored `ext/snyk-expert/.agents/skills/cmd-snyk-remediate/SKILL.md`: portable main-session procedure coordinating bounded Snyk Open Source remediation cycles without an executable runner or assumed slash-command/subagent registration; binds canonical installed `.agents/` bundle root separately from `target_root` and specifies honest explicit-read inline fallback when native specialist registration is unavailable.
- Bound intake, positive integer budget $N \ge 1$ with resume continuity, and private target-contained evidence storage before any artifact output (including initial baseline scan), keeping mutating initialization/scanner/resolver commands strictly non-exempt.
- Encoded the 8-stage runtime sequence (Steps 1–8): Main live scan/refresh (Step 1), 6-point ecosystem-neutral pre-edit procedure binding and read-only `dependency-upgrade-review` (Step 2), Main pre-edit gate where `reject`/`revise` consume 0 attempts (Step 3), persisted `attempts_started + 1` and single-set application (Step 4), native local verification handoff `local verification complete; Snyk verification pending` (Step 5), Main live final review scan and append-only every-finding/post-only ledger reconciliation (Step 6), review decision (Step 7), and post-review corrections before rescan (Step 8 returning to Step 1 fresh changed-state scan to close the corrective attempt and transition to Step 7 without duplicate label-only scans).
- Encoded append-only observed procedure learning in the private run record, inert sanitized `UNTRUSTED` candidate notes, and separate human-approved source-authoring maintenance proposals with zero runtime installed-skill mutation.
- Verification & boundary: 25/25 relative links resolved in `cmd-snyk-remediate/SKILL.md` and 53/53 existing package tests passing across 8 suites (prior to Phase 05 `ext/snyk-expert/lib/inventory.js` registration and scenario expansion; static/test checks do not prove live coordinator runtime behavior); local integration review remains pending Phase 06 and live operational qualification pending Phase 07.

### 2026-10-12 — feat(snyk): specialist and skill cutover for bounded remediation cycles (Phase 03)

- Completed Phase 03 specialist and skill cutover of General Snyk remediation cycles at 2026-10-12T22:02:47+07:00 (plan records review approved 8/10; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-03-specialist-and-skill-cutover.md`).
- One-set execution per mutating invocation: bound single coherent set execution with retained $N$, incrementing `attempts_started` once before first mutation with zero refunds on failure or rollback.
- Local verification handoff to Main: specialist and fix skills return `local verification complete; Snyk verification pending` with native graph, build, and test evidence upon successful checks, while failed local checks return partial or stopped evidence; Main retains exclusive ownership of live Snyk scans and terminal review.
- Neutral pre-edit procedure evaluation table: replaced blanket unsupported-ecosystem stops across all entrypoints and references with a neutral 6-point pre-edit procedure evaluation table; managers with complete official support and execution authorization run under existing authority without hardcoded ecosystem allowlists.
- Zero target writes in analyze and upgrade-review: analyze and upgrade-review instructions prohibit target edits, dependency mutations, and private evidence writes in those modes.
- Bound private ignored evidence storage: the `snyk-cli` skill instructions require a main-bound private ignored target-contained destination and mandate pausing on unauthorized, unignored, tracked, or coverage-affecting storage without silent fallback.
- Safe CLI troubleshooting: added proxy vs CA trust diagnostics (npm cafile, Node extra CA, standalone store distinct) strictly prohibiting TLS bypass.
- Preserved concrete safeguards: retained all Node.js/TypeScript (lockfile, peer, engines, compiler) and Maven/Spring (BOMs, profiles, reactor) safeguards in specialized remediation references.
- Package test verification: 53/53 package tests pass across 8 suites in `ext/snyk-expert/tests/`, including 14 workflow-contract tests in `ext/snyk-expert/tests/workflow-qualification.test.mjs`; live authenticated Snyk qualification and runtime remediation remain scheduled for Phase 07.
- Boundary: Specialist and skill cutover complete; command coordinator loop (`cmd-snyk-remediate`, Phase 04), delivery scenarios (Phase 05), integration review (Phase 06), and live operational qualification (Phase 07) remain scheduled for subsequent phases.

### 2026-10-12 — feat(snyk): establish general procedure and lossless ledger contracts (Phase 02)

- Completed Phase 02 reference-contract authoring of General Snyk remediation cycles at 2026-10-12T21:39:21+07:00 (review approved 8.5/10 with non-blocking W7 vocabulary follow-ups noted; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-02-procedure-and-ledger-contracts.md`, QA validation report: `plans/reports/qa-261012-2129-snyk-phase02-contracts-and-suite-validation.md`).
- Pre-edit procedure table contract: specified neutral 6-point evaluation covering manager/version/runtime, official support/parser evidence, authored/effective controls, native inspection, exact invocation authority, and test/graph/consumer coverage before any dependency-changing edit.
- Immutable source inventory & scan-zero authentic presence: established immutable first-scan source and duplicate occurrence tables in `finding-and-owner-contract.md`; distinct authentic scan-zero presence tracking prevents reconstructing missing originals from counts.
- Restart-safe counting: specified durable run record in `verification-and-results.md` with positive integer $N \ge 1$ bound at intake, count incremented exactly once before first mutation, zero refunds on failure or rollback, pause/resume state preservation, and unknown count stop gates.
- Private target-contained evidence storage: defined private target-contained evidence storage bindings with leaf/ancestor containment, strict permissions, git-ignored untracked isolation, affirmative non-input/non-coverage evidence, single writer, and fail-closed pause on unsafe storage without silent fallback.
- Every-attempt observation ledger: specified full observation rows for all original findings across every attempt (including unattempted, unchanged, and failed rows).
- Post-only provenance: established separate post-only inventory and provenance tracking, keeping advisory absence distinct from individual path disappearance and separating license evaluation from vulnerability remediation.
- Procedure learning observations: added procedure learning observation fields within run records capturing planned/executed commands, side effects, and environment limits with inert sanitized UNTRUSTED candidate notes without automatic source-skill mutation.
- Live scan terminal review ownership: assigned live scanner execution and terminal review post-scan ownership directly to Main in the common references (`snyk test` and live reconciliation), keeping actor scope strictly bound to local inspection and native verification.
- Boundary: Phase 02 establishes reference contract specifications; executable specialist/skill cutover, Main loop, and live authenticated qualification remain scheduled for subsequent phases.

### 2026-10-12 — test(vscode): integrated contract and isolated host qualification (Phase 09)
**Status:** Package gates and isolated Windows VS Code 1.140.0 receipts N-01–N-03 pass; interactive GUI and authenticated inference remain blocked. [Integrated report](../plans/261011-2349-vscode-runtime-model-bindings/reports/integrated-qualification.md) · [Native receipts](../plans/261011-2349-vscode-runtime-model-bindings/reports/native-qualification.md).
- **Candidate:** VSIX SHA-256 `833e982d1cb08139e4df4a4891a4622d5f001076ab55a66a77f80f70f449cc89`; buildIdentity `68a82c4549d3b68a8cab7b73b3252a46d195d87634e8a08023af64d1119bb965`.
- **N-01:** Disposable user-data/extensions install and reprobe pass; same-version identity mismatch requires exit-5 manual setup while committed stdout is preserved.
- **N-02:** Isolated Extension Host exercised five commands, 17 actors and precedence; `hostObservedModel` stayed null.
- **N-03:** All eight hook events pass; malformed calls fail closed; scout and privacy behavior observed.
- **Runtime:** Windows `code.cmd` resolves to `Code.exe` + `cli.js`; companion fixes cover drive-path roots, remote-authority fallback, proposal-disabled registration, frozen exports and atomic watcher swaps.
- **Automated gates:** Scoped QA suites passed 211/211 (`tester-261012-2000-phase-09-integrated-qualification.md`: companion+VSIX 54/54, adapters 98/98, CLI 48/48, integration 6/6, VS Code publication 5/5), plus separate manifest-reuse (6/6) and private release artifacts (18/18) runs. `test:vscode-companion` is wired into `npm test` (full monolithic `npm test` and four medium review follow-ups remain open).
- **Sidebar tree view:** Added the `EVCrate` Activity Bar icon (`evcrate-sidebar`, `media/evcrate-icon.svg`) and native Sidebar `TreeDataProvider` (`evcrate.modelBindingsView`, `EvcrateSidebarTreeProvider`); `sidebar-snapshot.ts` captures row state and `scripts/vscode-companion-media.mjs` validates/packages SVG media. Tier/actor rows invoke targeted configuration commands.
  Final VSIX SHA-256: `033f0b54466af9ba0ea4828c692cb7538bfbc14ba4c6389b7b2b236d93f4ff5a`; `buildIdentity`: `3285fa1e52d6f500095506b3c5b007828cac7646ed27e5aad3c52491aa58fdbe`; automated tests passed `163/163`. Automated verification is distinct from live interactive host UI checks; those remain unclaimed.
- **Boundary:** Interactive picker/Chat, authenticated inference, child model, live selection recovery and Linux GUI remain blocked; no broad Windows-support or rollout claim.

### 2026-10-12 — feat(cli): consented postpublish VS Code companion installation (Phase 08)

- Added consented postpublish installation via `--install-vscode-companion` / `--no-install-vscode-companion`, with `--vscode-editor` and profile selection, pre-mutation validation, post-commit execution and fail-safe noninteractive behavior.
- Verified committed VSIX identity and installation reprobe; preserves publication stdout on install failure, emits an `install-notice-v1` stderr notice and shows proposed-API enablement guidance. Live native install smoke moved to Phase 09.

### 2026-10-12 — feat(distribution): hashed VSIX, snapshot overlay, and build integration (Phase 07)

- Added deterministic offline VSIX build, target overlay, strict packed/development verifier, and release packaging bound to companion closure and byte parity.
- Verified distribution and snapshot-staging suites (82/82); packed install smoke moved to Phase 09.

### 2026-10-12 — feat(vscode): refresh, immutable generations, and runtime diagnostics (Phase 06)

- Added coalesced revisioned refresh, scoped atomic-swap template watching with fallback polling, and persistent authority storage with lockfile protection.
- Added `evcrate.vscode.showDiagnostics` Markdown/JSON report and verified companion tests (41/41) plus adapter tests (98/98).

### 2026-10-12 — feat(vscode): implement runtime tiers, actor overrides, and picker commands (Phase 05)

- Implemented runtime model catalog querying in `extensions/vscode-model-bindings/src/model-catalog.ts` via `vscode.lm.selectChatModels` (`queryChatModelCatalog`), validating entries (`validateCatalogEntry`), formatting selectors as `<name> (<vendor>)`, detecting ambiguous selectors (`findAmbiguousSelectors`), and compiling frozen snapshots (`buildCatalogSnapshot`) without inference probes or preferred-model heuristics.
- Implemented scoped versioned binding store in `binding-store.ts` (`ScopedBindingStore`), managing partitioned user defaults (`globalState`) and installation-scoped root workspace overrides (`workspaceState`), validating schema bounds (`validateBindingsV1` <= 64 KiB), checking CAS revisions, and rejecting unsupported remote authorities (`UNSUPPORTED_REMOTE_AUTHORITY`).
- Implemented pure inventory resolver in `binding-resolver.ts` (`resolveInventoryBindings`) enforcing strict precedence layering (`root.actor > user.actor > canonical.inherit > root.tier > user.tier > unresolved`), omitting frontmatter `model` selector for inherit actors unless explicitly overridden, validating catalog availability, and isolating withheld reasons.
- Implemented QuickPick configuration UX and commands in `configuration-pickers.ts`, `configuration-commands.ts`, `clear-commands.ts`, and `command-registration.ts` (`evcrate.configureAgentModels`, `evcrate.configureActorModel`, `evcrate.clearModelBindings`, `evcrate.showModelBindings`, `evcrate.selectInstallation`).
- Integrated dynamic provider refresh in `extension.ts` and `generation-loader.ts` with catalog change subscriptions (`vscode.lm.onDidChangeChatModels`), single-flight debounced refreshes, and fail-closed handling for corrupt states.
- Verified test suites in `tests/vscode-companion/` (34/34 companion tests pass, 232/232 core adapter tests pass; Review Cycle 2 approved 8/10, 0 critical issues; user approved). Live native editor qualification remains deferred to Phase 09 per user gate amendment.

### 2026-10-12 — feat(vscode): implement companion provider runtime (Phase 04)

- Resolved Phase 02 Review Cycle 2 contract items: idempotent canonical URI serialization across percent encoding/spaces/Unicode/Windows drives with control character rejection (`W-A`), extracted leaf module `binding-contracts.ts` eliminating circular value imports (`W-B`), and enforced `<=512` actor bounds, string length caps, and diagnostic coherence in `validateRuntimeDiagnosticsV1` (`W-C`).
- Implemented guarded host activation in `extensions/vscode-model-bindings/src/{extension.ts,installation-roots.ts}` (`inspectHostGuard` checking workspace trust, proposal availability, and non-remote authority). Non-local remote authorities (`ssh-remote`, `dev-container`, `wsl`) and untrusted workspaces fail closed without silent fallback to local HOME.
- Implemented candidate root resolution in `installation-roots.ts` enforcing strict precedence (`project > HOME`), directory discovery (`.evcrate-vscode/evcrate/agent-templates/` and `.evcrate-vscode/evcrate/agent-intent.json`), and approval filtering via workspace state.
- Implemented secure generation loader in `generation-loader.ts` validating relative template paths (`validateSafeTemplatePath` preventing path traversal, symlink escape, and null-bytes), verifying SHA-256 integrity, enforcing size limits (`<= 256 KiB`), and isolating per-actor errors into `withheldReasons`. Computes stable template inventory SHA-256 for generation deduplication.
- Implemented agent template renderer in `agent-renderer.ts` injecting validated model selectors into frontmatter, protecting code fences, preserving immutable intent body, omitted tools, arguments, and metadata, and rebasing relative references without modifying external URLs.
- Implemented atomic generation staging in `resource-storage.ts` using `mkdtemp` and directory rename into extension storage, validating storage budgets (`STORAGE_AND_SOURCE_BOUNDS`).
- Implemented single-instance `CompanionAgentProvider` in `agent-provider.ts` for VS Code's proposed `CustomAgentProvider` interface (`provideCustomAgents`), deduplicating change events on identical inventory and honoring cancellation tokens.
- Added comprehensive companion behavior suites in `tests/vscode-companion/{prerequisites-regressions,provider-runtime,storage-and-provider}.test.mjs` (13/13 companion tests pass; 232/232 core adapter tests pass; Review Cycle 3 approved 7/10, 0 critical issues).

### 2026-10-12 — feat(vscode): immutable agent templates and truthful build intent (Phase 03)

- Converted VS Code static agent projection to immutable templates at `.evcrate-vscode/evcrate/agent-templates/${name}.md` with disposition `immutable-template`; deleted all 17 static host-discovered agent files (`.evcrate-vscode/com.github.copilot/agents/*.agent.md`).
- Stripped actionable `model` frontmatter key from emitted templates while preserving tools, arguments, description, `user-invocable`, and supporting references.
- Emitted deterministic `evcrate/agent-intent.json` manifest (`evcrate-vscode-agent-intent-v1`) capturing canonical tier intent (`canonicalTier`), template path, SHA-256 digest, source path, and supporting reference base for all 17 canonical actors.
- Upgraded tool audit artifact `evcrate/agent-tool-audit.json` to schema v2 (`evcrate-vscode-agent-tool-audit-v2`), recording immutable-template disposition and canonical tier intent with zero falsified effective model claims.
- Deleted obsolete `src/adapters/vscode/models.ts` (`VSCODE_LOCAL_MODEL_MAP`, `resolveLocalModel`, `buildVscodeModelMap`) and generated `evcrate/model-map.json` without compatibility shims.
- Updated `src/adapters/vscode/{names,inventory,configuration-activation-guide,adapter,metadata,index}.ts`, `src/adapters/projection-utils.ts`, target manifest `.evcrate/targets/vscode/manifest.json`, projection inventory `evcrate/projection-inventory.json`, and activation guide `evcrate/examples/activation-guide.md`.
- Updated test suites in `tests/adapters/vscode-configuration.test.mjs` and `tests/adapters/vscode-resource-projection.test.mjs` (665 passed, 0 failed, 1 skipped; user approved).

### 2026-10-12 — feat(vscode): implement runtime model bindings contracts and ownership boundaries (Phase 02)

- Implemented pure contract and validation modules under `src/adapters/vscode/{model-intent.ts,companion-package-contracts.ts,companion-cli-contracts.ts}` (`evcrate-vscode-agent-intent-v1`, `evcrate-vscode-agent-tool-audit-v2`, `evcrate-vscode-companion-descriptor-v1`, `evcrate-vscode-companion-source-receipt-v1`, `evcrate-vscode-companion-install-v1`, `verifyCompanionLayoutContract`, `validateCompanionCliOptions`) and standalone extension workspace `extensions/vscode-model-bindings/{package.json,tsconfig.json,vscode.proposed.chatPromptFiles.d.ts,src/runtime-contracts.ts,src/diagnostics-contracts.ts,src/contracts.ts}` (`evcrate-vscode-bindings-v1`, `evcrate-vscode-runtime-bindings-v1`, `validateLocalRootUri`, `resolveInstallationRoot`, `resolveEffectiveActorBinding`, `STORAGE_AND_SOURCE_BOUNDS`).
- Verified standalone extension and root compilation plus boundary suites in `tests/vscode-companion/contracts.test.mjs` (4/4 companion contract tests + 97/97 VS Code adapter tests = 101/101 passing; Review Cycle 2 approved 8.5/10, 0 critical issues; [interface-freeze.md](../plans/261011-2349-vscode-runtime-model-bindings/reports/interface-freeze.md)).
- Existing static VS Code projection (`.evcrate/source/.evcrate-vscode/**`) and core CLI runtime closure remain untouched until Phase 03/07/08 cutover; live native editor qualification remains deferred to Phase 09 real-case verification per the explicit 2026-10-12 user gate amendment.

### 2026-10-12 — docs(vscode): native feasibility evaluation for runtime model bindings companion (Phase 01)

- Evaluated proposed `chatPromptFiles` API (`registerCustomAgentProvider`) for private companion model bindings on Linux x86_64 host (pinned candidate VS Code 1.140.0 commit `07f806f999227108933c2e30515b26eecc1fda74`).
- Offline spike test harness passed 10/10 checks as documented in [native feasibility](../plans/261011-2349-vscode-runtime-model-bindings/reports/native-feasibility.md) and [support matrix](../plans/261011-2349-vscode-runtime-model-bindings/reports/support-matrix.md). Validated selector formatting, ambiguity rejection (`SELECTOR_AMBIGUOUS`), precedence layering, fail-closed remote authority rejection (`vscode-remote://`, `wsl://`), local file URI acceptance, simulated generation retention bounds, frontmatter contracts, simulated in-turn generation immutability, and storage isolation. Temporary spike removed; artifact packaging and digest recorded in report.
- Native runtime qualification gates remain deferred to Phase 09 real-case verification per the explicit 2026-10-12 user gate amendment ([interface-freeze.md](../plans/261011-2349-vscode-runtime-model-bindings/reports/interface-freeze.md)); existing static projection remains unchanged.

### 2026-10-13 — docs(sonar): historical-report review, documentation, and partial offline handoff (Phase 08)

- Reviewed preserved historical report metrics (56 tests, 46.48% line coverage, 63.91% branch coverage; focused change unanalyzed) and vendor documentation contracts (CLI session vs scanner token auth separation, exact CE task and analysis binding, complete paging, overall vs new code separation, human owner hotspot reviews, verified CI trigger before push, active TLS) without transplanting corporate defaults.
- Updated extension README (`ext/sonarqube-test-quality/README.md`) and core documentation with explicit `--target agents|claude|both` installer semantics, 18 proposed assets and 2 skill entrypoints per selected root (36 destinations for `both`), offline verification receipts, duplicate-root ambiguity notes, and 5-point consumer server-success criteria.
- Compiled local-only offline implementation handoff report (`reports/implementation-handoff.md`): recorded 114/114 passing package tests and isolated packed installer smoke as verified offline capabilities; recorded live consuming-host LLM runtime discovery and independent-child execution as blocked/unexercised; recorded actual consumer Sonar server-success as a separate future consumer prerequisite.

### 2026-10-13 — feat(sonar): behavioral evals catalog, contract alignment, and test suite (Phase 07)

- Expanded standalone SonarQube behavioral evals catalog (`ext/sonarqube-test-quality/evals/evals.json`): 64 instruction scenarios with 195 authored prose assertions and monotonic integer IDs (1–64); covers four scanner lifecycle shapes, global budget $N$ enforcement, single correction batch invariant, two-round comparable no-progress escalation, neutral applicability and metric requirements, authority/auth invariants, and Stage $F$ server-verified success contracts with zero literal credentials or TLS bypass instructions.
- Halting contracts & evals test suite: aligned `declined-upload` trigger across references (`remediation-cycles.md`) and report templates (`remediation-cycle-report.md`, `run-guidance-report.md`); added 15-test suite (`tests/evals.test.mjs`) validating catalog schema, assertion density, lifecycle shapes, static matrix traceability (A01–A09, D01–D09, C01–C12, E01–E08), and security invariants.
- Verified package test and release inventory: all 114 package tests pass across 8 test suites (`tests/*.test.mjs`); release tarball packages exactly 23 verified entries (`package.json#files`). Packed installer extraction and offline scenario verification exercised; live LLM host execution and live Sonar server qualification remain unexercised boundaries.

### 2026-10-13 — feat(sonar): dual-root transactional two-skill installer and package (Phase 06)

- Extended standalone SonarQube installer (`ext/sonarqube-test-quality/lib/install.js`, `ext/sonarqube-test-quality/bin/install.js`): added explicit target selection via `--target agents|claude|both` and `--directory <project-root>`; unsupported or missing targets fail closed; `--target agents` preserves legacy behavior and paths (`<project>/.agents/skills/sonarqube-test-quality/`).
- Added multi-target two-skill installation layout: installs 18 assets and exactly two skill entrypoints per selected root (`skills/sonarqube-test-quality/SKILL.md` and `skills/cmd-sonar-remediate/SKILL.md`), writing 36 total destinations when `--target both` is selected; writes zero unselected root payload, settings, or native registrations.
- Implemented transactional multi-root lifecycle: plans, stages beside destination on the same volume, publishes, and verifies exact byte matches across selected roots; validates non-symlink regular files and ancestor directory containment before and during writes; caught failure triggers in-process rollback restoring replaced original bytes and removing only owned additions, preserving unrelated and concurrent content; reports partial rollback with affected paths if restoration encounters conflicts (no persistent journal, crash recovery, or atomic reader visibility claim).
- Implemented two-tier lock coordination: acquires project-level lock `<project>/.sonarqube-test-quality.install.lock`, followed by legacy lock `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever `agents` is selected; releases successfully acquired locks in reverse order on failure or completion.
- Updated package allowlist and CLI docs: added `commands`, `agents`, `templates` to `ext/sonarqube-test-quality/package.json#files` (23 packaged tarball files); updated `ext/sonarqube-test-quality/README.md` with explicit `--target agents|claude|both` guidance and failure semantics.
- Added comprehensive installer and regression test suite (`ext/sonarqube-test-quality/tests/install.test.mjs`): 19 unit, fault, collision, concurrency, and rollback tests (all 99/99 package tests pass across 7 suites; behavioral evals and host qualification handoff remain pending in Phases 07–08).

### 2026-10-13 — feat(sonar): bounded remediation command and final audit (Phase 05)

- Added thin portable command skill specification (`ext/sonarqube-test-quality/commands/cmd-sonar-remediate/SKILL.md`): specifies `cmd-sonar-remediate` orchestrator prompt sequencing real host subagents across 17 lifecycle stages within a mandatory global budget `N` (> 0, prompted interactively if omitted/invalid, never inferred or defaulted); contains zero native hooks, daemon processes, or `evc-*` registrations; resolves sibling domain assets strictly from loaded installed skill root (`.agents` or `.claude`), falling back to `../../` in repository source checkouts; defers all policy to sibling references (`remediation-cycles.md`, `project-discovery.md`, `local-analysis.md`, `run-guidance.md`).
- Specified role binding and independence contracts: requires assigning real host subagents to operational roles (`implementer_id`, `tester_id`, `reviewer_id`, `rereviewer_id`, `evidence_actor_id`, `auditor_id`); requires `implementer_id` to differ from all reviewers, evidence actor, and auditor; requires every ID in the five-role Stage `F` set (`implementer_id`, `reviewer_id`, `rereviewer_id`, `auditor_id`, `evidence_actor_id`) to be pairwise distinct; fails closed on `role-independence-violation` (prompt restrictions remain behavioral guidance, not an OS sandbox).
- Specified 17-stage lifecycle state machine and behavioral gate contracts: preflight baseline (`C0_BASELINE`, zero cost against `N`), 9 fix-round stages `Ck` (`CK_FIX`, `CK_TEST`, `CK_REVIEW`, `CK_CORRECTION`, `CK_REREVIEW`, `CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`), 6 non-editorial Stage `F` stages (`F_AGGREGATE_REVIEW`, `F_AWAITING_COMMIT`, `F_COMMITTED_INPUT_CHECK`, `F_FINAL_LIFECYCLE_UPLOAD`, `F_FINAL_TASK_WAIT`, `F_FINAL_AUDIT`), and terminal `HALTED`.
- Specified transition and stopping invariants: single correction batch per round (`CK_CORRECTION → CK_REREVIEW`); test failure halts `Ck` immediately without in-round retry (`test-or-build-failed`); initial review rejection halts with `failed-review`; Stage `F` aggregate review rejection returns to `C(k+1)` if budget `N` remains or halts if exhausted; separate user commit authorization with no auto-push (`awaiting commit` on decline); mandatory actual scanner upload on committed SHA; 11-point success contract certified by independent auditor.
- Defined private state persistence and exit guidance: specifies writing `<evidence-destination>/resume-checkpoint.json` on each transition; requires input hash check halting on drift (`drift-invalidated`); specifies emitting sanitized run guidance without telemetry.
- Updated domain entrypoint and policy: linked bounded remediation route in `ext/sonarqube-test-quality/SKILL.md`; added `failed-review` and `role-independence-violation` canonical triggers and clarified Stage `F` return vs post-`N` extension in `ext/sonarqube-test-quality/references/remediation-cycles.md`.
- Added specification and behavioral simulation test suite (`ext/sonarqube-test-quality/tests/cmd-sonar-remediate.test.mjs`): 31 tests across specification contracts, installed fixture resolution (`.agents` and `.claude`), and 15 simulated state transition scenarios (all 80/80 package tests pass; packaging in `lib/install.js` and `package.json#files`, live qualification, and installed-host behavioral testing remain pending in Phases 06–08).

### 2026-10-13 — feat(sonar): portable Sonar evidence actor and verification suite (Phase 04)

- Added portable Sonar evidence actor specification (`ext/sonarqube-test-quality/agents/sonar-evidence.md`): specifies `<evidence-actor-role>` generic host subagent contract with zero host frontmatter, native engine bindings, or `evc-*` registrations; prompt/policy resolution strictly from installed root (`skills/sonarqube-test-quality/agents/sonar-evidence.md`, with packaging pending Phase 06); restricts writes to build/scanner dirs (`.scannerwork/`), test/coverage reports, and owner-only private evidence dir (`<evidence-destination>/`, mode 0700, never inlined into reports); strictly prohibits checkout/source/test edits, server finding/hotspot status transitions, git mutations, CI changes, and toolchain installs.
- Specified mandatory role independence (`actor_id != implementer_id | reviewer_id | rereviewer_id | auditor_id`; fails closed on `role-independence-violation`); prohibits self-certifying Stage `F` final audit (`F_FINAL_AUDIT`) or reviewing Security Hotspots (human repository owner only).
- Defined three mutually exclusive operating modes: `snapshot` (read-only query/indexing, no checkout/source writes or uploads, private evidence index writes only), `verify-upload` (preflight upload authorization required, ordered lifecycle execution, report freshness, task polling, quality gate retrieval), and `verify-final` (strictly non-editorial Stage `F` verification with zero code edits permitted).
- Defined execution, task, and consistency mechanics: serial multi-target execution per checkout, pre/post working-copy drift checks, uninstrumented native semantic parity, crash-window handling and task resume without re-upload, exact `analysisId`-bound quality gate (rejects latest-project gate fallbacks), complete paging and ceiling detection, closed canonical enumerations, and 14 labeled offline scenario traces (`E-TR-01` through `E-TR-14`).
- Aligned remediation cycles reference (`ext/sonarqube-test-quality/references/remediation-cycles.md`) with evidence actor execution limits, global budget `N`, stage lifecycle, resume checkpoint, and server-verified success contracts.
- Added comprehensive specification test suite (`ext/sonarqube-test-quality/tests/sonar-evidence-actor.test.mjs`): 20 tests across 2 suites verifying specification existence, zero host frontmatter, root resolution, bounded writes/security, TLS rules, role independence, operating mode boundaries, multi-target support, drift checks, lifecycle parity, task resume, gate binding, paging/consistency, closed enums, guidance redaction/schema, 14 offline scenario traces, and embedded JSON request/terminal result block validation against canonical schemas. (All 48 extension tests pass 100%).

### 2026-10-13 — feat(sonar): cycle ledger and sanitized run guidance (Phase 03)

- Added repository-source cycle state, budget, and server-evidence policy (`ext/sonarqube-test-quality/references/remediation-cycles.md`): specifies policy for global entered-round budget `N` (excluding `C0` and non-editorial Stage `F`), stage transitions, single corrective batch (`CK_CORRECTION → CK_REREVIEW`), private `<private-evidence-dir>/resume-checkpoint.json` persistence, atomic multi-target checkpoints, `ceTaskId → analysisId → qualityGate` binding, local finding stage vs. bound server status separation, disappearance causation rules (`code-fixed` vs. non-code/unknown), owner-only hotspot reviews, and Stage `F` success criteria.
- Added sanitized run guidance, redaction, and promotion policy (`ext/sonarqube-test-quality/references/run-guidance.md`): specifies storing the private cycle ledger and raw evidence (`<private-evidence-dir>/`) outside the checkout or in an already-approved Git-ignored location (never committed, pushed, or distributed), emitting separate sanitized guidance with explicit owner permission required before any sharing, applying structural + key-name redaction placeholders (`<REDACTED_SECRET_TOKEN>`, `<REDACTED_ENV_VAR>`, `<REDACTED_SONAR_HOST>`, `<SYNTHETIC_CODE_FIXTURE>`, neutral `RUN-`/`GD-` slugs), enforcing provenance-capped confidence levels (`synthetic` capped at `hypothesized`), and requiring owner promotion gates without self-modification or telemetry.
- Added private cycle ledger template (`ext/sonarqube-test-quality/templates/remediation-cycle-report.md`) and sanitized run guidance template (`ext/sonarqube-test-quality/templates/run-guidance-report.md`) with `[ILLUSTRATIVE PLACEHOLDER]` markers and data-only notices; linked iterative cycle handoffs in `ext/sonarqube-test-quality/references/remediation-and-handoff.md` while preserving ordinary single-batch local remediation and `references/report-formats.md` JSON authority over converted Markdown views.
- Review & boundaries: Phase 03 marked approved in plan/roadmap after Review Cycle 3 (`8.0/10`, 0 critical issues, 8 warnings, 7 suggestions; review reported 28/28 existing extension tests passing and 0 broken relative links/anchors in an ad-hoc check of the 6 shipped Phase 03 Markdown files). Packaging of new Phase 02–03 references and `templates/` in `lib/install.js` and `package.json#files` remains gated on Phase 06; portable evidence actor, command skill, runtime orchestration, behavioral evals, and qualification handoff remain pending in Phases 04–08.

### 2026-10-12 — feat(sonar): neutral discovery and scanner lifecycles (Phase 02)

- Updated standalone extension `ext/sonarqube-test-quality/` references with language-neutral discovery, execution profile architecture, and ordered scanner lifecycles (installer, orchestration, and live qualification remain pending in later phases).
- Added project discovery reference (`ext/sonarqube-test-quality/references/project-discovery.md`): defines deterministic discovery order (manifests, scanner configuration, installed tool help, vendor documentation), safe actual-input identity with credential redaction, two-factor report freshness (temporal ordering and input provenance digest binding), requirement contracts (`required`, `optional`, justified `not-applicable`), data-only execution profiles, and labeled offline scenario traces.
- Added ordered scanner lifecycle reference (`ext/sonarqube-test-quality/references/local-analysis.md`): defines 8 ordered lifecycle stages (preparation, instrumentation, native build, native test, coverage generation, import/upload, submission tracking, finalization), 3 universal lifecycle shapes (integrated, standalone, begin/end), mandatory uninstrumented native semantic verification when scanner instrumentation alters compiler flags or build semantics, authentication separation (CLI query sessions vs scanner process credentials), TLS boundaries, and stage-specific failure recovery.
- Generalized test and coverage verification (`ext/sonarqube-test-quality/references/testing-and-coverage.md`): neutral runner principles, two-factor coverage freshness, and counter/denominator rules (zero denominator undefined, unsupported branch tracking) while retaining optional Java/JaCoCo recipes.
- Synchronized entrypoint (`ext/sonarqube-test-quality/SKILL.md`) and CLI reference (`ext/sonarqube-test-quality/references/sonar-cli-commands.md`) with neutral discovery/local analysis routes, dynamic server status checks, and preflight upload authorization requirements.

### 2026-10-11 — feat(vscode): shorten plugin identity and use container-local command names

- Changed `plugin.json` name from `evcrate-local` to `evc`; VS Code command/resource metadata uses the same plugin identity.
- Canonical `evc-cmd-*` commands now project to `.evcrate-vscode/skills/cmd-*/SKILL.md`, preserving `-x-` nesting and semantic advisor IDs. Copilot Chat displays `evc cmd-*`; host-qualified `/<plugin-name>:<skill-name>` becomes `/evc:cmd-*`, avoiding duplicate `evc` prefixing.
- `src/adapters/vscode/references.ts` (`replaceCommandInvocations`) rewrites `/evc-cmd-*` and `$evc-cmd-*` to local `/cmd-*` and `$cmd-*`, including wildcard command families.
- Shared `.evcrate/source/.claude/scripts/ev-help.py` scans both `evc-cmd-*/SKILL.md` and `cmd-*/SKILL.md`; canonical source naming and non-VS Code projections remain unchanged.

### 2026-10-11 — fix(vscode): correct subagent frontmatter tool references and qualify Linux candidate handoff (Phases 01–07)

- Repaired VS Code adapter frontmatter projection in `src/adapters/vscode/metadata-tools.ts` (`VSCODE_LOCAL_TOOL_MAP` and `mapAgentTools`) for pinned VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) and GitHub Copilot Chat `0.68.0` (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`, `web/fetch`, `edit/editNotebook`; keeping `WebSearch` unmapped). Separated frontmatter references from model-facing (`copilot_readFile`, `copilot_fetchWebPage`, `copilot_editNotebook`, `manage_todo_list`) and hook event namespaces; preserved `tools: []` deny-all, omitted-tool inheritance, `Task`-derived `canDelegate` (`agents: ['*']` vs. leaf `agents: []`), and expected Local child-subagent `todo` restriction without claiming a VS Code host defect.
- Paired `filePath`/`FilePath` operand normalization, `includePattern`/glob-root search scope enforcement, `edit/editNotebook` (`filePath`, `editType: "insert" | "edit" | "delete"`, and `cellId` required) and `read/getNotebookSummary` handling, and `web/fetch` HTTP(S) `urls` array + `query` validation (exempting remote URLs from local `.evcrateignore` and privacy rules) with nullish-coalescing (`??`) and null-prototype/`Object.hasOwn` lookup parity across `src/adapters/vscode/tool-inputs.ts`, `src/adapters/vscode/runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`), and emitted `evcrate/runtime/local-tool-inputs.cjs`.
- Regenerated VS Code projection and manifests (`.evcrate/build-manifest-vscode.json` SHA-256 `eb1597b4...`, `agent-tool-audit.json` SHA-256 `d0ec26b8...`, immutable candidate plugin tree `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b` across 761 files).
- Qualified on Linux x64: Phase 05 native delegation/permissions ([native-qualification.md](../plans/261010-1552-vscode-subagent-tool-references/reports/native-qualification.md), 11/11 PASS: `N01`–`N10`, `W04`) and Phase 06 documentation workflow ([docs-workflow-qualification.md](../plans/261010-1552-vscode-subagent-tool-references/reports/docs-workflow-qualification.md), 3/3 PASS: `W01`–`W03`, including `Explore` fallback to `evc-scout`). Delivered reviewed-candidate handoff ([candidate-handoff.md](../plans/261010-1552-vscode-subagent-tool-references/reports/candidate-handoff.md)); Windows Local qualification, incident closure, and production rollout remain explicitly blocked pending affected-host verification and operator deployment approval.
### 2026-10-10 — fix(distribution): recover retired cleanup and authenticate stable approval

- Retired Gemini cleanup carries an explicit schema-3 journal discriminator, validated against exact predecessor ownership and delete-only historical paths without adding retired targets to active publication metadata.
- HOME/project fault injection restores locally edited owned files; persisted-journal recovery handles child-process termination. Forged cleanup, unsafe paths, invalid progress, and symlink cases are rejected.
- Stable publication replaces self-generated approval JSON with live GitHub run/environment/review-history and reviewer-permission verification. Removed local approval-file options; unsupported protections, self-review, absent approval and stable reruns fail closed.
- Configured live `production` required reviewers (`loidinhm31`, `quochuy-vo`), prevented self-review, disabled admin bypass, and restricted deployment to `main`. The publisher verifies the live policy on every stable invocation.

### 2026-10-09 — feat(distribution)!: docs, changelog, prerelease and stable promotion pipeline (Phase 10)

- Dual-branch release pipeline: updated `.releaserc.json` with prerelease branch `next` (`channel: "next"`, `prerelease: "rc"`) and stable branch `main`. Workflow `.github/workflows/release.yml` triggers pushes on both `main` and `next`, establishing a protected `production` environment review gate for stable publication.
- Release candidate mirror seeding: updated `scripts/release/run-release-candidate.cjs` (`createLocalReleaseMirror`) to seed bare candidate mirror with triggering branch at `sourceCommit`, seed verified configured `main` (and `next`) refs from repository history, and seed all local tags.
- Stable candidate approval evidence validation: updated `scripts/release/publish-release.cjs` (`verifyStableApprovalEvidence`) to enforce branch topology guards (rejecting prereleases on `main` and stable releases on `next`) and require valid maintainer approval evidence binding candidate commit, version, tag, run ID, and file digests before publishing stable releases.
- Normative documentation reconciliation: updated `README.md`, `docs/code-standards.md`, `docs/system-architecture.md`, `docs/project-overview-pdr.md` (FR-12), `docs/codebase-summary.md`, `docs/project-roadmap.md`, `docs/pi-native-migration.md`, and `guide/SKILLS.md` covering universal `evc-cmd-*` / `evc-*` naming, `-x-` nesting reversibility, single `AGENTS.md` authority (`.evcrate/source/.claude/AGENTS.md`), pre-upgrade customization backup warnings, and local-asset installer installation procedures.

### 2026-10-08 — fix(advisor): accept omp requestControls and usage.cttl in assistant stream

- OMP advisor parser (`adapters/omp-parser.cjs`) accepts optional assistant `requestControls` (plain JSON object bounded to 4096 serialized bytes, depth 6, 256 nodes) and optional `usage.cttl` (plain object of at most 16 finite non-negative numbers) emitted by omp 18.8.x for the Anthropic provider; previously every `anthropic/claude-opus-5-5` backup consultation failed `PROTOCOL_INVALID`. Both fields stay optional, all other exact-key checks are unchanged, and message_end/turn_end/agent_end equivalence is unaffected. Regression tests added to `tests/advisor-controller/omp-adapter.test.cjs`.
### 2026-10-07 — fix(advisor): PR #19 advice activation hardening

- Phases 01–05 hardening & caveats: quote-span/boundary parsing to unescaped token delimiters; 1 KiB relative-POSIX selection paths; root realpath cwd verification (`ADVICE_CONTEXT_MISMATCH` fail closed); off mode decoupled from controller (receipt-attested, never calls `evcrate-advisor`); native-user admission (`handoff: null`, `source: "native-user"`); dead `executeDelegated`/`source: "delegated"` removed; delegated/direct-definition receiving evaluates HOME helper with caller handoff (model headers untrusted); prompt blocks rendered structurally via exported `COMMAND_NAMES`; fail-closed diagnostics; live matrix 8/8 PASS (M3 approval gate NOT QUALIFIED, M2b non-adversarial); manual `typecheck:omp-runtime` gate (not in npm test/CI); OMP blank-line paragraph boundary deferred.
- OMP advisor parser compatibility: accepts optional `serviceTier` and `usage.premiumRequests` from omp 18.7.0 JSON output; stream caps raised to 1 MiB and 8192 lines.

### 2026-10-06 — fix(advisor): repair activation quote parsing, OMP delegated receiving, and prompt duplication (PR #19)

- Repaired quoted-span, ordinary word apostrophe (`don't`), backslash escape (`\`), and unclosed quote parsing in shared evaluator (`.evcrate/source/.evcrate/bin/lib/advisor/activation.cjs`); strictly preserves duplicate flag rejection for eligible standalone `--advice` and byte-preserves task input.
- Added OMP delegated receiving path (`executeDelegated`) in `src/adapters/omp/activation.ts` and `src/adapters/omp/commands.ts` using the shared HOME helper with caller-supplied child context and handoff, distinguishing native-user admission from direct delegation without synthetic flags or fabricated native headers.
- Compacted OMP admitted command context to version 2 envelope (`evcrate_omp_command_context`) containing mode, reason, context, run, and source; eliminated duplicate `raw_arguments` and `activation_result.work_arguments` so task prose expands exactly once in prompt body (long input 56,706 -> 34,754 bytes; header 23,113 -> 339 bytes; 11,200-byte input delta yields 11,200-byte output delta vs 33,600 baseline; no tokenizer claims).
- Scoped canonical `primary-workflow.md` helper admission to supported implementation commands (`code`, `cook`, `bootstrap`, `fix` families); plain tasks and `/plan` retain ordinary off without synthetic helper identities.
- Preserved known phase path and ID in canonical `cook.md` pre-run handoffs (null only when unknown).
- Regenerated 9 build/target manifests across all 8 targets (`npm run generate:registry`, `npm run generate:manifests -- --jobs 2`).
- Verification: review scored 9.2/10, no critical findings; one misleading test-title warning resolved and verified (12/12 OMP tests); focused 6 files 66/66, adapters 142/142, distribution manifests 14/14 (counts overlap 12 OMP tests, not 222 unique); programmatic smoke verified 84 admissions (21 commands × 2 sizes × off/explicit) and 6 routed delegations with unchanged state fixtures. Distinguishes helper/runtime programmatic smoke from live model loops; no live inference or 8-host qualification invoked; no commit/push claims.

### 2026-10-06 — feat(advisor): implement deterministic advice activation helper, canonical separation, and multi-target projection cutover

- Added packaged `evcrate-advice-mode` CommonJS Node helper (`$HOME/.evcrate/bin/evcrate-advice-mode`) and shared parser/evaluator (`lib/advisor/activation.cjs`) for deterministic advice activation.
- Strict bounded JSON wire protocol (`protocol: "evcrate-advice-mode"`, version 1, max 64 KiB stdin, 32 KiB raw arguments, 256 KiB output, 2-second deadlines). Standalone final `--advice` token activates explicit mode (`EXPLICIT_FINAL_FLAG`); duplicate tokens reject (`ADVICE_MODE_DUPLICATE_FLAG`); quoted, embedded, suffixed, or non-final tokens remain ordinary work text.
- Separated canonical workflow advice activation, neutral historical inspection, and authorized mentoring across 30 canonical paths (`.evcrate/source/.claude/`). All 21 implementation commands resolve the helper before loading full mentoring.
- Off mode preserves ordinary debugging, reviewer corrections, validation, approvals, and command-scoped Git policy without advice lifecycle calls (L=0).
- Added neutral workflows `advice-activation.md` and `plan-progress.md`; identified historical `state get` does not activate advice, initialize state, or alter durable ledgers, while retaining existing lock creation, release, and provably dead lock reaping.
- Structured caller handoffs: pre-run (`INHERITED_PRE_RUN`) preserves known plan/phase context without synthetic flags or eager router state init (`run: null`); same-run (`INHERITED_SAME_RUN`) forwards verified binding validated by lazy get against durable state; completed or abandoned runs fail closed (`ADVICE_RUN_COMPLETED`).
- Multi-target projection cutover across all 8 targets: OMP native custom-command admission gate before model discovery with headless stderr reporting; Pi extension architecture with installation-root isolation, manifest-owned ESM boundary (`type: module`), and static TypeBox imports; removed Copilot unconditional workflow preload; converted Gemini projections to standalone transformed instruction files.
- Synchronized exact 46-file controller closure across generated inventory, manifests, and installers. Both `evcrate-advisor` and `evcrate-advice-mode` enforce canonical Node shebangs.
- Preserved V1 compatibility, direct APIs, V2 CAS/claim/evidence/human gates, and existing lock behavior without schema changes or new global authority.
- Qualification scope: Linux x64 bounded native qualification observed on OMP 18.6.1 across six scenario classes (Step 0 cap, prerequisite gate limits including uncaptured `s10` diagnostic and timed-out `s12`, incomplete A02/A22 historical proof, A12 retained-record escalation, A13/A16 native branches unexercised, other vendor model loops unqualified); native Windows and macOS excluded by user direction; ordinary Phase 04 user approved completed 2026-10-06T14:13:41+07:00 / 9.8 review, no durable completion/provider release/commit claim.

### 2026-10-04 — feat(vscode): add opt-in settings.json registration flow to VS Code publish

- Added surgical JSONC detection and updating for `chat.pluginLocations` in VS Code settings files (`src/distribution/vscode-settings.ts`). Supports both workspace `.vscode/settings.json` (`--scope project`) and platform User settings (`--scope home`) across Linux, macOS, and Windows.
- Preserves comments, indentation, BOM, newlines, and unrelated keys without destructively rewriting configuration files; creates 0600 mode file on POSIX when newly created.
- Integrated first-time registration prompting into `evcrate publish` when running on interactive TTYs with absent registration.
- Added explicit CLI flags: `--register-vscode-settings` (forces registration without prompting; works in non-TTY/CI/JSON) and `--no-register-vscode-settings` (suppresses detection and registration entirely).
- Maintained publication atomicity and recovery boundaries: `evcrate recover` remains strictly scoped to published artifacts and never mutates user `settings.json`.
- Added 21 unit and CLI integration tests in `tests/distribution/vscode-settings.test.mjs` and `tests/cli/vscode-settings-registration.test.mjs` (112/112 test suite passing).

### 2026-10-04 — docs(vscode): complete Phase 09 documentation, controlled rollout, and lifecycle governance

- Reconciled core architecture and documentation: updated system architecture (`docs/system-architecture.md`), codebase summary (`docs/codebase-summary.md`), code standards (`docs/code-standards.md`), project overview PDR (`docs/project-overview-pdr.md`, FR-25), roadmap (`docs/project-roadmap.md`), and README/guide.
- Established eighth persisted target `vscode` with isolated Agent Plugins 1.0 bundle (`evcrate-local`) at `.evcrate/source/.evcrate-vscode/` and published `.evcrate-vscode/`. Schema-2 manifests and build resolutions manage 8 targets; schema-1 registry maintains exact-seven read-only normalization for backward compatibility. Core release assets remain exactly seven files.
- Documented clear separation between GitHub Copilot CLI (`copilot`) and VS Code Local (`vscode`), user-controlled manual activation via `chat.pluginLocations`, and opt-in MCP examples without default activation or credential assumptions.
- Documented native hook protocol across eight Agent Plugins 1.0 events, fail-closed scout and privacy policies, atomic CAS v1 session context with 7-day bounded retention, direct HOME advisor caller (`~/.evcrate/bin/evcrate-advisor`), and explicit rejection of standalone `--agent` relay (`ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE`).
- Documented coexistence guidelines (project vs HOME scope), scope-isolated recovery runbook (`evcrate recover` without editor settings mutation), and lifecycle stop-trigger criteria for version drift and announced upstream Local retirement.

### 2026-10-04 — test(vscode): record Phase 08 Native Local qualification

- The [index](../plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md), [project receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-project/receipt.md), and [HOME receipt](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-home/receipt.md) account for 50 rows / 12 contexts (six contexts marked `QUALIFIED`, five `NOT EXERCISED`, one `UNSUPPORTED`). Reported gates: 8/8 Phase 08 tests, 737/737 full npm tests, [Cycle 2 review](../plans/reports/code-review-261004-0023-phase-08-native-local-qualification-cycle-2.md) 9.4/10. That review reports PreCompact/SubagentStart/SubagentStop exit 2, while the current [project log](../plans/261002-2213-vscode-local-native-support/reports/native-local/linux-x64-project/events-redacted.jsonl) and receipt show 0; the [wrong-harness record](../plans/261002-2213-vscode-local-native-support/reports/native-local/wrong-harness-isolation/events-redacted.jsonl) records a disposition but not an observed relay rejection.

### 2026-10-02 — refactor(advisor): retire Dam-Hopper plugin platform integration

- Retired the Dam-Hopper plugin runtime/backend, manifest, worker, and plugin distribution artifacts; preserved the core Advisor CLI/controller and shared viewer source (not the former standalone picker or plugin host).
- Updated the release workflow to publish only the seven core assets. E00–E05 and Workspace Advisor Phase 00–09 qualification records are historical plugin-era evidence, not qualification of the current native Dam-Hopper integration.

### 2026-10-02 — feat(snyk): integrate specialist and reusable task skills locally

- Imported `snyk-expert`, `snyk-fix` and `dependency-upgrade-review` through existing preview/apply machinery into canonical `.evcrate/source/.claude/`; retained the sealed standalone bundle unchanged. Neutral upgrade review remains read-only and usable without a Snyk report; concrete remediation remains Maven/Spring-only.
- Reproduced three broken Copilot sibling skill links, repaired relative Markdown link namespacing in the existing converter, and retained a path-resolution regression covering entrypoint/nested handoffs, external URLs and agent-only names.
- Local `generate:all`, seven-target distribution build and distribution check passed. Generated-resource smoke resolved 91 local links across 55 resource documents; Antigravity supplies the skills but not the general specialist agent.
- Local porting is not full behavioral parity or live remediation qualification. Native child loading, permission enforcement and Phase 05 graph/runtime/comparable-rescan gates remain unverified. No user HOME publication, real target edit, credential repair, commit or push. See the [qualification report](../plans/261001-0304-claude-snyk-agent-skill-pattern/reports/porting-qualification.md) for actual behavioral/suite evidence and limitations.

### 2026-10-02 — fix(workflows): separate live progress from sealed phase evidence

- Added mandatory identity/scope/completion reconciliation before phase selection and dependency batches. Successful completion requires a matching `complete` operation and resolved outcome; abandonment, stale tables and missing evidence cannot authorize dependent execution or duplicate implementation.
- Advice-controlled plans now publish immutable scope/run receipts and a derived uncaptured `progress.md`; ordinary default plans still update `plan.md`. Active/named-checkpoint lifecycle survives omitted flags; new default phases after historical advice retain normal approval/validation without invented durable completion.
- Updated code variants, related completion owners, planner/status writers, and archive/validation guards. Publication failure repairs administrative outputs only; reviewed evidence and selected index identities remain protected. No controller/schema/freshness change.
- Added the [Snyk current overview](../plans/261001-0304-claude-snyk-agent-skill-pattern/progress.md): recorded Phases 01–04 authoring/interface completion, Phase 05 live qualification pending, Phase 06 deferred. Existing plan and four receipts remained byte-identical; historical controller verification was not rerun.
- Verification: build, registry and all seven target/aggregate manifests generated; distribution check and release closure passed; existing targeted lifecycle suites **13/13 passed**. Actual generated OMP prompts passed **16/16 constructed decision cases**, ordinary-plan status publication, and sealed-plan overview publication with unchanged plan/receipt bytes. Snapshot smoke preserved freshness for an uncaptured overview and rejected captured status edits. Initial smoke assertion compared equivalent `05`/`phase-05` labels; normalized that throwaway assertion and reused the same model output, without rerunning inference.
- Constructed workflow smoke is not live completion/qualification evidence or a universal prompt-compliance guarantee. No production controller state mutation, HOME publication, commit or push.

### 2026-10-01 — docs(advisor): bind advice-mode callers to durable state

- Documented fresh/active ownership, mode and run-identity handoff, read-only baseline authority, writer/freeze barriers, finalization/index ordering, no-change requirements, distinct review/correction limits, and durable completion authority; linked the canonical caller lifecycle.
- Parent fixture-backed Node source/CLI smoke reached `STATE_READY` → `ADVICE_READY` → disposition → no-change outcome → completed with `correction_count: 0`; captured contract/artifact remained read-only, no edits were invented, and temporary storage was removed.
- This initial smoke was not live vendor counsel; live counsel was still pending at that smoke checkpoint. Later repair-run counsel and completion receipts are separate. Stale init-only authentic abandonment is separate and was not exercised.
- No controller API, freshness, or routing-policy change; no HOME publication or commit.

### 2026-09-30 - docs(advisor): strengthen tool-less mentor discipline

- Strengthened counsel instructions for outcome follow-through, evidence versus assumptions, boundary/error/interleaving analysis, ambiguity checks with expected observations, adversarial review, and caller-owned verification. Adapted bounded procedures from [fable-thinking](https://github.com/mrgoonie/fable-thinking), without claiming vendor reasoning authenticity or guaranteed model quality.
- Fresh formatter output and regenerated canonical brief matched the evaluated prompt (4,476 bytes; SHA-256 `16505a41eea260aefa64509602d3b3770b9c7f7c2e7520df5238edfbd91a294b`). Only repository-generated projections were rebuilt; no installed HOME runtime was published or activated.
- Gates passed: `npm run build`, `npm run generate:brief`, `npm run distribute:build`, `npm run distribute:check`, and `release:check`; advisor-controller 234 passed, 0 failed, 24 Windows-specific skipped; advisor-parity 4/4; `test:adapters` 26/26; `phase10-commands-and-evaluation` 5/5 (legacy canned evaluator structural tests, not model-quality evidence).
- Evaluation: eight isolated OMP (`openai-codex/gpt-6.1-sol`, high) runs across four synthetic paired cases; all parsed through the V2 adapter and emitted zero tool events. Both variants reached correct core decisions; the new variant was more specific, not empirical proof of improved production defect rates.
- Final recheck: controller/parity and release closure remained green. In-place distribution check was blocked by a newly present root `.omp/` (`PATH_UNSAFE`); the same all-target check passed in a temporary current-source package snapshot without that unrelated root. The existing `.omp/` was left untouched.

### 2026-09-30 — feat(advisor): paired qualification, documentation, and release handoff (Phase 09)

**Status:** Phase 09 DONE (2026-09-30; 100%); Workspace plan 10/10 phases complete (100%). Paired qualification verified across 11/11 browser scenarios, 4 screenshots, 49/49 EVCrate UI tests, and 13/13 DamHopper browser tests; production rollout and deployment remain subject to operator authorization.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 09](../plans/260929-1346-advisor-workspace-panel/phase-09-paired-qualification.md)
**Evidence:** [Qualification report](../plans/260929-1346-advisor-workspace-panel/reports/phase-09-qualification.md)

- Executed consolidated verification command groups V-E1, V-E2, V-E3, V-P1 in EVCrate and V-D1, V-D2, V-D3, V-D4 in DamHopper.
- Ran full browser qualification harness (`plugin:test-client`) against authenticated `dam-hopper-plugin-test-server`:
  - `authenticated remote plugin load`: PASSED (1,978 ms)
  - `opaque frame storage and network isolation`: PASSED (localStorage, sessionStorage, cookies, fetch all blocked with SecurityError/TypeError)
  - `embedded E03 identity`: PASSED
  - `overview refresh`: PASSED (captured `01-overview.png`)
  - `history list and detail`: PASSED (captured `02-history-detail.png`)
  - `current policy configuration`: PASSED (captured `03-configuration.png`)
  - `counsel evaluations`: PASSED (captured `04-evaluations.png`)
  - `protected inert asset`: PASSED (authenticated 200, anonymous 401, digest `2111bae2...` verified)
  - `same-route connection reuse`: PASSED (1 WebSocket connection maintained)
  - `profile owner switch revocation`: PASSED (stale frame immediately revoked on owner switch)
  - `reload creates fresh frame fence`: PASSED (fresh frame session generated on full reload)
- Synchronized documentation across EVCrate and DamHopper, established rollback handoff instructions, and confirmed all 16 verification matrix scenarios satisfied.

### 2026-09-30 — feat(advisor): cut over standalone navigation and regenerate package (Phase 08)

**Status:** Phase 08 DONE (2026-09-30; 100%; review approved 9.8/10); Workspace plan 9/10 phases complete (90%). Phase 09 paired qualification remains open; explicit user approval, end-to-end rollout, and production deployment are not claimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 08](../plans/260929-1346-advisor-workspace-panel/phase-08-navigation-and-package-cutover.md)
**Review:** [Code review](../plans/reports/code-review-260930-0707-phase-08-standalone-navigation-cutover.md)

- DamHopper filters only the exact installation ID `evcrate.advisor` from standalone navigation while preserving other plugins, including other `evcrate` publishers. Retired `/plugins/evcrate.advisor` returns `PluginUnavailableState reason="not-visible"` before metadata/list, asset, token, or frame preparation; generic `/plugins/:installationId` hosting remains.
- Regenerated EVCrate manifest uses `navigation: []` and `hostVersionRange: '>=0.7.0'`. Deterministic package: SHA-256 `ccd515bff7ec038b2e87a0c5f01b3d14a0d0f56d6e05d0c6779218a2737ea3d9` (46 members); candidate: SHA-256 `f76ec1afd670912e7df86bb49c0149b98117582a890e4fd4333cd35c76f1a73b` (44 inventory entries plus `manifest.json`).
- Qualification test server/client migrated `plugin_url`/`pluginUrl` to `workspace_url`/`workspaceUrl`; the client launches Advisor through the explicit Workspace Activity Bar launcher.
- Review records **41/41 tests passing** across EVCrate and DamHopper; package archive verification and `cargo check` passed.

### 2026-09-30 — feat(advisor): complete Workspace-integrated Advisor Phase 07

**Status:** Phase 07 DONE (2026-09-30; 100%; Cycle 2 review approved 9.6/10); Workspace plan 8/10 phases complete (80%). Phases 08–09, paired end-to-end rollout, and production deployment remain unclaimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 07](../plans/260929-1346-advisor-workspace-panel/phase-07-bound-source-disclosures.md)
**Review:** [Cycle 2 code review](../plans/reports/code-review-260930-0400-phase-07-cycle-2-disclosures.md)

- Completed bound-source Configuration and Evaluations disclosures: current owner policy remains distinct from History-filtered route metrics; Evaluation comparison and inspection stay explicit and lazy.
- Preserved candidate blinding, accessible disclosures, responsive narrow layouts, and source/error states.
- Cycle 2 review records 13/13 Phase 07 tests and 100/100 related tests passing, `tsc` with 0 errors, and a clean plugin UI build.
- Phase 07 does not claim paired end-to-end qualification or production rollout; Phases 08–09 remain.

### 2026-09-30 — feat(advisor): complete compact activity views and accessible tabs (Phase 06)

**Status:** Phase 06 DONE (2026-09-30; 100%; Cycle 2 review approved 10/10); Workspace plan 7/10 phases complete (70%). Phases 07–09, paired end-to-end rollout, and production deployment remain unclaimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 06](../plans/260929-1346-advisor-workspace-panel/phase-06-compact-activity-views.md)
**Review:** [Cycle 2 code review](../plans/reports/code-review-260930-0226-phase-06-cycle-2-compact-activity-views.md)

- Completed compact Overview/History composition and four keyboard-operable,
  hash-addressable tabs while preserving the existing tab routes.
- Shared Workspace Project/All scope, scan status, and manual Refresh/Cancel;
  tab, scope, filter, detail, and disclosure interactions do not call
  `history.refresh`.
- Preserved all six rate metrics, latency/outcome/missingness details, history
  fields, filters, cursor paging, and inspection states in narrow cards and wide
  layouts.
- Final phase status records 55/55 tests passed (43 EVCrate viewer and 12
  DamHopper browser); TypeScript checks are clean across both repositories.
- Compact-view implementation does not change backend/bridge contracts or claim
  the later paired qualification, end-to-end rollout, or production deployment.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 05

**Status:** Phase 05 DONE (2026-09-29; 100%; Cycle 2 review approved 9.8/10); Workspace plan 6/10 phases complete (60%). End-to-end rollout and production deployment remain unclaimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 05](../plans/260929-1346-advisor-workspace-panel/phase-05-workspace-panel-placement.md)
**Review:** [Cycle 2 code review](../plans/reports/code-review-260929-2332-phase-05-cycle-2-workspace-panel-placements.md)

- Completed persistent single-iframe placement across IDE dock, Terminal float and compact Workspace overlay. Checked-in browser assertions verify one iframe DOM node across placements and hide/reopen with inert/hidden state; the fixture mocks `PluginHost`, so it does not establish real `FrameSession`, snapshot or refresh-call continuity.
- Cycle 2 review records 106/106 unit tests, 12/12 Chromium tests, `tsc --noEmit` with 0 errors, and no critical issues or warnings. Source has a no-project early return before API preparation, but the host test passes `project={null}` with a mocked `PluginHost` and does not assert zero API calls; slot unregistration is tested while observer/listener cleanup is implemented but not directly asserted.
- Phases 06–09 remain pending; no end-to-end feature rollout or production deployment is claimed.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 04

**Status:** Phase 04 DONE (2026-09-29; 100%; review approved 9.5/10); Workspace plan 5/10 phases complete (50%). End-to-end rollout and production deployment remain unclaimed.
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 04](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md)
**Review:** [Code review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md)

- Completed shared Workspace-project/All activity scope, fail-closed history selection, authority/request fencing and revoke clearing, coherent snapshot queries, independent manual refresh, and lazy evaluation reads.
- Scoped proof: 28/28 targeted tests passed; strict TypeScript check and V-E3 delayed-response/call-count smoke passed. Review found no critical issues.
- The broader viewer/plugin run recorded 120 passed and one packaged-artifact checksum/size-delta mismatch, deferred to Phase 08 package regeneration. This phase does not claim end-to-end rollout or production deployment.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 03

**Status:** Phase 03 DONE (2026-09-29; review approved 9.7/10); Workspace plan 4/10 phases complete (40%). End-to-end rollout and production deployment remain unclaimed.  
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 03](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md)  
**Review:** [Cycle 2 code review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md)

- Completed the paired `workspace-advisor-v1` extension across SDK, host, and viewer: authorized context-ready sequencing, trusted workspace-selection updates, and gated UI-intent messages.
- Extracted the shared `usePluginHost`/`PluginHost` lifecycle with owner-change fencing, same-root in-place selection updates, verified assets, and session disposal; `PluginHostPage` remains a thin route wrapper.
- The implementation summary reports 145 test passes across EVCrate and DamHopper suites. Cycle 2 independently verifies all five Cycle 1 must-fix items and records 81 targeted tests passed; one SDK envelope-guard consistency suggestion remains non-blocking.
- Phase 04 and Phase 05 are unblocked. No navigation cutover, end-to-end rollout, or production deployment is claimed.

### 2026-09-29 — test(advisor): qualify Workspace Advisor history scope (Phase 02)

**Status:** Phase 02 DONE; review approved 9.6/10. The Workspace plan is 3/10 phases complete; end-to-end rollout and production deployment remain unclaimed.  
**Plan:** [Workspace-integrated Advisor](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 02](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md)  
**Evidence:** [Code review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md)

- Root All keeps valid-ID unmapped Project U despite missing registration and label; the fixture expects six discovered directories, seven accepted records, and two malformed/mismatched records accounted as invalid.
- Project-bound null queries do not widen, foreign IDs reject, cursor/query binding holds, and permitted policy/evaluation reads work without a history root. Bounded scan cancellation/deadline and framed dispatch scenarios were qualified.
- Existing production provider/scanner and v1/v2 data contracts did not change; no ID-less adapter or production-history census is claimed. Review records 59 passing test executions and zero failures.

### 2026-09-29 — feat(advisor): complete Workspace-integrated Advisor Phase 01

**Status:** Phase 01 DONE (2026-09-29; review approved 9.2/10); 2/10 phases complete (20%).  
**Plan:** [Workspace-integrated Advisor panel](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 01](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md)  
**Evidence:** [Phase 01 implementation and verification record](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md).

- Completed selected-project host admission, canonical trusted identity, per-operation authorization, actual scope/revision descriptor, and revalidation preservation across DamHopper server/API/SDK/host client.
- The phase record reports 102 passed and 0 failed across server integration/authorization, SDK contracts, and UI checks. Review recorded zero critical issues; two non-blocking warnings are tracked for Phase 02.
- Phase 02 (history scope and unmapped records) was next at the Phase 01 checkpoint; it completed later on 2026-09-29 (see the newer entry above). No end-to-end Workspace rollout or production deployment is claimed.

### 2026-09-29 — docs(advisor): close Workspace-integrated Advisor Phase 00

**Status:** Phase 00 DONE (10% at that checkpoint); Phase 01 completion and approval are recorded in the following entry.
**Plan:** [Workspace-integrated Advisor panel](../plans/260929-1346-advisor-workspace-panel/plan.md) · [Phase 00](../plans/260929-1346-advisor-workspace-panel/phase-00-evidence-and-contract-freeze.md)
**Evidence:** [Contract freeze](../plans/260929-1346-advisor-workspace-panel/reports/phase-00-contract-freeze.md) · [Review](../plans/260929-1346-advisor-workspace-panel/reports/code-review-260929-1543-phase-00-evidence-and-contract-freeze.md).

- G0-data, G0-auth and G0-wire are frozen; reviewed EVCrate code and sanitized fixtures support the reported valid-ID unmapped shape within existing v1/v2 contracts, without claiming an exhaustive production-history census.
- Sanitized A/B/U/worktree and invalid-record fixtures are prepared; review reports focused fixture/provider/schema checks passing.
- No application feature rollout, production change or live UI qualification is claimed.

### 2026-09-28 — test(windows): qualify native advisor and protect Linux (Phase 04)

**Status:** Phase 04 DONE (2026-09-28; review approved 9.2/10).  
**Plan:** Native Windows advisor support — Phase 04 (historical plan artifacts are not retained in this repository).
**Evidence:** The implementation and qualification results are summarized below; the original qualification report is not retained in this repository.

- Native Windows behavioral/security regressions passed **10/10** and lifecycle tests **10/10**; advisor parity passed **4/4**, release tests **34/34**, and `release:check` plus `distribute:check` passed.
- The canonical controller diagnostic protocol qualified OMP 18.4.1 and Codex 0.155.1. Claude 2.1.92 remains unverified (`AUTH_UNAVAILABLE`); Pi 0.84.1 remains unverified (`PROCESS_FAILED`). No mock credentials or fallback were used.
- Linux protection was confirmed by the full 400/400 test suite on native ext4 in WSL Ubuntu 22.04. The separate Phase 03 sandbox run observed live OMP inference return `ADVICE_READY`; no Codex, Claude, or Pi inference is claimed.
- Production HOME publication was not performed.

### 2026-09-28 — feat(windows): complete native advisor invocation and package closure (Phase 03)

**Status:** Phase 03 DONE (2026-09-28; review approved 9.0/10). Host invocation and both sandbox publication paths completed; no production HOME was modified.  
**Plan:** Native Windows advisor support — Phase 03 (historical plan artifacts are not retained in this repository).
**Verification:** Windows build, `distribute:check`, and `release:check` passed; scoped results recorded 357/357, post-fix 20/20, final adapter 9/9, and Windows controller 282/282 serial. Isolated `npm pack`/install and standalone `install.ps1` sandbox publication verified exact 36-file controller closures and hashes; routing policy was unchanged.

- The published controller handled Unicode and special-character input through Windows PowerShell 5.1 and returned `STATE_READY`; Linux/POSIX invocation remained unchanged.
- Full Linux qualification on WSL Ubuntu 22.04 native ext4 passed **400/400** tests. Live Windows OMP inference (`openai-codex/gpt-5.6-sol`) advanced state to revision 4, wrote history, and returned an authentic seven-field `ADVICE_READY` envelope.
- Third-cycle review scored 9.0/10 with no critical findings. Its accepted low warning notes possible PowerShell coercion of wire string `"1"` and unresolved concurrent state-CLI timeout behavior.

### 2026-09-28 — test(advisor): complete Windows advisor readiness verification (Repair Phase 04)

**Status:** Repair Phase 04 verification complete; readiness repairs 4/4 complete. At that checkpoint the original advisor plan had not yet completed native qualification; see the separate Phase 04 record above.
**Plan and evidence:** Windows advisor readiness Repair Phase 04 (historical plans and reports are not retained in this repository). Focused verification **20/20**; final required suites **390/390**, 0 failures and 0 skips; independent review **9.0/10**, no critical findings.

- Added `tests/advisor-controller/verification-regressions.test.cjs` for R1–R5 behavior: Job descendant cleanup, trusted-file permission behavior, provider path selection and rejection, no-clobber state creation under interleaving and competing processes, and replacement-workspace preservation.
- Added `tests/advisor-controller/verification-lifecycle.test.cjs` for pinned-file CAS, supervisor failure boundaries, launch-record and environment validation, isolated source CLI V2 lifecycle/history operations, and unattended/piped-console rejection.
- This repair verification did not itself establish external readiness; the subsequent native advisor Phase 04 qualification is recorded above. Production HOME publication remains unclaimed.

### 2026-09-28 — fix(advisor): restore Windows advisor storage and cleanup safety (Repair Phase 01)

**Status:** Phase 01 DONE (2026-09-28; review approved 9.5/10; user approved). 2/4 repair phases complete; Phase 03 (provider launch identity) next.  
**Plan and evidence:** Windows advisor readiness Repair Phase 01 (historical plan and report artifacts are not retained in this repository). 10/10 storage-safety regressions pass (`tests/advisor-controller/storage-safety.test.cjs`); 223/223 advisor-controller tests pass; 112/112 protocol, primitives, and scopes tests pass; release check verified.

- **C1 containment (no-replace publication):** Removed catch-all `linkSync` to `renameSync` fallback in `state-io.cjs` and `history-store.cjs`. On `EEXIST`, transactions fail closed with `STATE_CONFLICT` / `AUDIT_DEGRADED` without clobbering competing destinations (R4 closed).
- **C2 containment (workspace cleanup object identity):** Captured `dev` and `ino` identity on workspace and root during creation in `isolated-workspace.cjs`. Cleanup validates ancestor root *before* inspecting workspace path, verifies object identity, and fails closed (`CLEANUP_UNCONFIRMED`) on any junction/symlink or device mismatch without deleting outside trees (R5 closed).
- **H3 native pinned operations:** Implemented narrow Win32 handle-pinned operations in `windows-native.cs`, `windows-native.ps1`, and `windows-platform.cjs`. Root-to-leaf directory pinning with `FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT` rejects reparse points and locks ancestor directories against concurrent renames; `writePinnedFileWindows` performs staging with `CREATE_NEW`, flushes buffers, and executes atomic CAS replacement verifying expected device, inode, and SHA-256 digest on destination handle.
- **Caller migration:** Migrated `profile.cjs`, `state-baseline.cjs`, `history-query.cjs`, `history-prune.cjs`, `state-io.cjs`, `history-store.cjs`, and `isolated-workspace.cjs` to verified pinned context and native operations without breaking Linux descriptor traversal.

### 2026-09-28 — fix(advisor): repair Windows supervision and console observation (Repair Phase 02)

**Status:** Phase 02 DONE (2026-09-28; review approved 9.2/10). Readiness repairs are 2/4 complete; Phase 03 (provider launch identity) is next.  
**Plan and evidence:** Windows advisor readiness Repair Phase 02 (historical plan and review artifacts are not retained in this repository). Review records 9/9 focused supervision-console tests, 236/236 advisor-controller tests, a clean build, and `release:check`.

- Replaced Windows PID-tree teardown with native Job Object supervision: provider launch is assigned atomically to a kill-on-close Job; the creation token comes from the process handle; success requires positive confirmation that the Job is empty. Unconfirmed cleanup blocks success and relaunch.
- Added a separate supervisor control/lifetime channel and bounded provider output relay. Cancellation, probe timeout, output-limit, transport failure, and controller-channel EOF terminate the Job; removed `taskkill` and teardown-time PID lookup. The POSIX process-group path remains.
- Wired human-decision state preflight to a fixed console observer using verified `CONIN$`/`CONOUT$`, independent of piped JSON. Only the exact native `OBSERVED` result creates an event; state revision/replay checks remain. Unattended or detached console fails closed.
- Manual attached-console matching, Linux runtime, and vendor qualification remain Phase 04 prerequisites; provider-launch identity binding is Repair Phase 03.

### 2026-09-27 — fix(filesystem): complete Phase 02 durable cutover and host-specific qualification

**Status:** Phase 02 DONE (2026-09-27; review approved 9.6/10; user approved). Entire filesystem-policy cutover milestone is 100% complete (2/2 phases).  
**Plan and evidence:** Filesystem-policy cutover Phase 02 (historical plan and review artifacts are not retained in this repository). 279/279 targeted tests pass across publication-recovery, registry, integration, plugin qualification, and advisor controller suites.

- Implemented schema version 3 publication journal writer (`publication.ts`) and bounded authentic schema 1/2 mode-bearing journal migration in recovery (`publication-recovery.ts`). Negative test verifies rejection of schema 3 journals bearing mode fields.
- Applied absolute chmod-invariance across capabilities in `scanner.ts` and `source.ts`: script-execution capability is derived strictly from script extensions and shebang bytes, never from file mode bits.
- Fixed Windows integration test client in `dam-hopper-client.mjs` and `dam-hopper-test-fixture.mjs` to resolve package JS entrypoint and invoke Node with direct argv, eliminating `cmd.exe` shell parsing vulnerabilities.
- Removed `stat.mode` fingerprint false-positive from plugin qualification test (`tests/plugin/qualification.spec.mjs`).
- Reconciled code standards (`SettingsMode` removed) and roadmap documentation (Windows advisor Phase 03 preserved as NO-GO pending readiness repairs).
### 2026-09-27 — fix(filesystem): complete Phase 01 launchability and identity

**Status:** Phase 01 DONE (2026-09-27; review approved 10/10). Parent filesystem-policy cutover is 50% complete (1/2 phases); Phase 02 remains proposed.  
**Plan:** Filesystem-policy cutover Phase 01 (historical plan and review artifacts are not retained in this repository).
**Evidence:** The dated local summary records review approval 10/10 and 268 targeted tests plus a successful build.

- Completed launch-intent propagation for newly materialized publication files and role-based Linux installer execute provisioning; staged CLI smoke now invokes the real path directly.
- Removed permission-only drift from advisor evidence/CAS boundaries while retaining byte/object checks; registry and import file identities now distinguish file kind; mandatory staging chmod failures propagate.
- The dated review recorded 268 targeted tests passing and a successful build, with no critical findings. This is focused Phase 01 evidence, not a full release or Windows-readiness qualification.
- Phase 02 still owns durable journal recovery/migration policy and host-specific qualification; executable-capability policy and pre-upgrade recovery decisions remain unresolved.

### 2026-09-27 — refactor(repository): complete repository-wide removal of filesystem UID/ownership and mode enforcement

**Status:** IMPLEMENTED and PROVEN (2026-09-27). Replaced all ownership/UID/SID/DACL and private file-mode enforcement across the entire repository with the cross-platform trusted-files policy.  
**Scope:** Non-advisor runtime (`src/filesystem/`, `src/distribution/`, `src/adapters/`, `src/manifests/`, `src/imports/`, `src/registry/`, `src/scopes/`), standalone installers (`install.sh`, `install.ps1`), release archive pack/verify tools, advisor settings protocol/coordinator, canonical scripts (`.evcrate/source/.claude/scripts/`, `.evcrate/source/.evcrate/bin/`), and test harnesses.

- **Policy transition:** Removed all filesystem UID/SID/ACL/private-mode gates across both Linux and Windows. Default file/directory creation respects host umask; no forced `0o700` or `0o600` permissions.
- **Executable intent:** Preserved purely as an additive execute bit (`chmod | 0111`) on non-Windows platforms for runnable script assets (`install.sh`, release tar/zip staging, `.evcrate/bin/`, projected bash scripts).
- **Mode-free digests & verification:** `controllerTreeHash`, `completeTreeHash`, archive inventory digests (`Compute-InventoryDigest`, `computeInventoryDigest`), manifest verification, and publication CAS plans compare only content sha256, byte length, filesystem kind, and presence without mode comparison.
- **Settings contract clean cutover:** Exact-key schemas completely removed filesystem mode metadata (`SettingsMode` removed from request, result, preview, and journal contracts), rejecting legacy mode-bearing payloads without shims.
- **Review findings resolved:** Retained named-path device/inode/size check alongside descriptor validation in `hashFile`; propagated OS stat/chmod errors in `install.sh`; enforced additive execution in archive staging under umask 0002; wrapped canonical scanner YAML atomic write/flush/replace in single try/finally cleanup.
- **Verification evidence:**
  - Full protocol test suite: **54/54 passed**.
  - Filesystem & manifests primitives suite: **33/33 passed**.
  - Projection adapters suite: **13/13 passed**.
  - Resource registry & imports suite: **23/23 passed**.
  - Scopes & advisor settings suite: **24/24 passed**.
  - Advisor controller suite: **214/214 passed** on both Windows host and native Linux (WSL Ubuntu 22.04).
  - Distribution release & cutover suite: **7/7 passed**.
  - Distribution validation & rollout suite: **5/5 passed** (1 Linux installer test skipped on Windows host).
  - Integration suite: **14/14 passed**.
  - Linux standalone installer suite in WSL: **16/16 passed** (including broad-mode pre-existing directory install, repair, and launch).
  - Windows release qualification harness suite: **21/21 passed**.
  - Windows package smoke suite: **3/3 passed**.
  - Advisor plugin package & worker suites: **27/27 passed**.

### 2026-09-27 — refactor(advisor): replace filesystem UID/SID/DACL/mode restrictions with cross-platform trusted-files policy
**Status:** IMPLEMENTED and PROVEN (2026-09-27). Replaced advisor owner-only/0700/0600/SID/DACL enforcement with cross-platform trusted-files policy across Linux and Windows.  
**Scope:** CJS policy, state, history, baseline, and isolated workspace; TypeScript advisor settings read/preview/apply/recovery and locks; native Windows platform and bridge helpers; plugin reader binding, history scanner, policy provider, and evaluation provider.  

- **Policy transition:** Removed all advisor filesystem UID/SID/ACL/private-mode restrictions on both Linux and Windows. Replaced with cross-platform trusted-files policy: preserves OS permissions and errors, file kind, non-symlink invariants, single hardlink checks, file identity, canonical safe paths, JSON schemas, bounds, CAS replacement, process locks, and human approval gates. Preserved host/network owner authorization and unrelated installer/publication/import permission policy.
- **Settings & native changes:** `SettingsMode` is now observational numeric metadata rather than enforced bitmask validation. Native owner operations (`verifyWindowsFileOwnership`, `getCurrentUserSid`, `GetFileOwnerSid`, `VerifyFileOwnership`) removed from `windows-native.cs` and `windows-platform.cjs`. Prior Phase 03/04 follow-up requiring path-threaded Windows state/history ownership checks is superseded.
- **Build & contract verification:**
  - `npm run build`: PASS; corrective TypeScript compilation: PASS; `npm run release:check`: PASS.
  - Settings, filesystem, and protocol test suites: **87/87 passed on BOTH Windows and Linux**.
  - Windows full controller suite: **213/214 passed** (sole new history test typo fixed, then affected state/history suite passed **35/35**).
  - Linux full controller suite: **213/214 passed** (sole existing SIGTERM stdin test received signal instead of envelope; timing suspected not proven, diagnosis uncertain).
  - Linux root foreign UID state/history suite: **35/35 passed**.
- **Smoke & runtime proof:**
  - Windows (Everyone Modify) and Linux (foreign UID 12345, 0777/0666) policy, state, and workspace operations succeeded; settings get/preview/apply after chmod and rollback with shared foreign-owned journal/stage succeeded.
  - Native Linux actual smoke confirmed `umask 0002` creates advisor settings policy `0664`, runtime state `0664`, and state dir `0775`, while generic non-advisor `writeAtomicFile` retains `0600` file and `0700` parent defaults (assertions passed, confirming no hidden private defaults and unrelated helper defaults preserved).
  - Actual plugin reader smoke passed on Windows (Everyone Modify) and Linux (foreign UID 12345, 0777/0666): target binding accepted, policy ready, bound evaluation exact ID matched, history scan exact consultation matched; unauthorized policy operation correctly rejected.
- **Provider & worker test observations:**
  - Plugin provider suite: Linux **12/12 passed**; Windows **11/12 passed** (sole source-safety failure caused by test target `${normTarget}/./child` vs implementation `split(path.sep)` backslash: unrelated existing mixed-separator check, not an ownership issue).
  - Separate worker test: cannot load missing `@dam-hopper/plugin-sdk` on either platform (Worker SDK prerequisite exists only as a `plugin/vendor` reference blocked by configured ignore; worker suite not claimed passed).
- **Readiness state at this 2026-09-27 snapshot:** Descendant/Job supervision, spawn-time creation identity, no-replace publication, workspace replacement cleanup, provider-launch identity, and console approval remained open. Repair Phase 01 later closed the storage/cleanup items; Repair Phase 02 later closed Job supervision, creation-token capture, and console integration. Provider-launch identity remains Repair Phase 03.

### 2026-09-26 — feat(windows): prove native Windows advisor compatibility primitives (Phase 01)

**Status:** Phase 01 DONE (2026-09-26; feasibility gate passed; review approved **9.3/10**).  
**Plan:** Native Windows advisor support — Phase 01 (historical plan artifacts are not retained in this repository).
**Evidence:** The local historical summary records native proof feasibility and its verification; the original proof report and code review are not retained in this repository.

- Proved native Win32 compatibility primitives required for advisor execution without weakening Linux invariants or requiring WSL/Git Bash.
- **Filesystem & ownership:** Validated handle-based SID/DACL inspection, protected directory creation, junction and hardlink rejection, directory handle pinning preventing rename/delete races, and full-chain mutation with `NtSetInformationFile(FileRenameInformation)` atomic replacement under strict `FILE_SHARE_READ`.
- **Process supervision:** Validated decimal creation token identity, suspended process launch with pre-assignment `PROC_THREAD_ATTRIBUTE_JOB_LIST` assignment, kill-on-close Job termination, grandchild containment, and control-pipe EOF teardown.
- **Bounded transport & console:** Validated write-only pipe inheritance via `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, separated control/provider framing, flood byte capping with immediate Job kill, backpressure pacing, and direct CONIN$/CONOUT$ console challenge matching with fail-closed headless detachment (`FreeConsole`).
- Verification: **67/67 checks passed** (0 failed) across Windows PowerShell 5.1 and verified official PowerShell 7.6.6 runtime.
- **Boundary:** Records Win32 primitive and native bridge feasibility only. Phase 02 controller lifecycle is now complete with approved Phase 03/04 follow-ups; Phase 03 invocation/publication is unblocked; Phase 04 qualification remains pending. Production Windows runtime qualification is not claimed.
### 2026-09-26 — feat(windows): complete native advisor controller lifecycle (Phase 02)

**Status:** Phase 02 DONE (2026-09-26; parent-approved after Cycle 3 conditional review, score **7.4/10**). Phase 03 unblocked.  
**Plan and evidence:** Native Windows advisor support — Phase 02 (historical plan and review artifacts are not retained in this repository). The review summary recorded 213/213 advisor-controller tests, 16/16 viewer/manifest and package-inventory tests, and a 36-file controller closure.

- Integrated the native Windows controller lifecycle boundaries, including Windows environment canonicalization, package-bin resolution without shell invocation, IPC cancellation, and the inventoried 36-file controller closure.
- The dated review recorded **213/213 advisor-controller tests**, **16/16 viewer/manifest and package-inventory tests**, and **21/21 settings/filesystem distribution-primitives tests**.
- Two Cycle 3 findings were recorded as follow-ups for Phases 03/04: runner spawn-time process creation-token capture for PID-reuse-safe termination; state/history path-threaded Windows ownership checks (the latter since superseded by the 2026-09-27 cross-platform trusted-files policy).
- Phase 03 is unblocked. Production Windows runtime qualification remains unclaimed.

### 2026-09-24 — feat(history): complete paired qualification and release decision (Phase 05)

**Status:** Phase 05 DONE (2026-09-24; 100%; paired release qualified; review approved 9.8/10). **Plan:** [Phase 05](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md) · [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md). **Evidence:** [test report](../plans/reports/tester-260924-2115-phase-05-paired-qualification.md) · [review](../plans/reports/code-review-260924-2125-phase-05-paired-qualification.md) · [release manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md)
- Completed cross-repo qualification matrix across EVCrate and DamHopper, including negative authorization, owner-root admission, multi-project UI tests, and lifecycle revocation. The 10k local framed-worker benchmark stayed within frozen ceilings.
- Reproducible candidate and distribution packages passed verification against their inventory/checksums. Matched paired release approved; production deployment is not claimed.
- Direct owner-root provider scan discovered 21 project directories and accepted 237/237 consultations in 191.48ms with zero diagnostics; this was not a new live DamHopper browser-session qualification. The evcrate project filter returned 33 consultations.
- Validation: **273/273 tests passed** (0 failed, 0 skipped): plugin 65, viewer 27, qualification/performance 3, protocol 54, advisor metrics 6, DamHopper server 55, and DamHopper UI 63.
### 2026-09-24 — feat(history): complete account-wide project selector (Phase 04)

**Status:** Phase 04 DONE (2026-09-24; review approved **9.8/10**; **188/188 tests passed**). **Plan:** [Phase 04](../plans/260924-1055-all-project-advisor-history/phase-04-project-filter-ui.md); [validation](../plans/reports/phase04testerfinal-260924-1842-account-wide-project-selector-honest-ui-identity.md); [review](../plans/reports/code-review-260924-2004-phase-04-project-filter-ui-re-review.md)
- Same-snapshot inventory now drives server-filtered History/Overview; project switches clear cached rows, detail, and cursor. Labels fall back to abbreviated canonical IDs.
- Configuration identifies current owner policy, Evaluations their bound source; both say they are not filtered by History project. Provider labeling uses the custom/host plugin label rather than implying an account or project identity. Host navigation/page brands EVCrate only for matching plugin metadata.

### 2026-09-24 — fix(auth): guard production auth without breaking development

**Status:** Phase 00 DONE (2026-09-24); review approved **9.4/10**; user approved.  
**Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 00](../plans/260924-1055-all-project-advisor-history/phase-00-secure-auth-prerequisite.md)  
**Evidence:** [source review](../plans/260924-1055-all-project-advisor-history/reports/summary-review.md)

- Production startup with missing MongoDB configuration is guarded, and missing DB no longer triggers token issuance by itself.
- Explicit development/test token bootstrap and test-server login remain available; browser default-profile seeding is limited to development/test, and test-server access stays scoped to the fixture actor.
- Verification: **1,876/1,876 tests passed**.

### 2026-09-24 — feat(history): freeze cross-project advisor data contract (Phase 01)

**Status:** Phase 01 DONE (2026-09-24); review approved **9.5/10**; user approved.  
**Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 01](../plans/260924-1055-all-project-advisor-history/phase-01-cross-project-contract.md)

- Froze `evcrate-advisor-data` v2 while preserving strict v1 schema/behavior support, all eight method names, and on-disk execution/outcome history v1.
- Added `project_id: string | null` to v2 summary/page queries: `null` means All Projects only in owner-root context; single-project context remains bound.
- Defined a same-snapshot per-project inventory, capped at 500 entries and independent of active query filters, plus a versioned owner-safe display-name sidecar.
- Added runner scope contract `ContextScopeKind` (`project` | `history-root`) and `ContextScopeDescriptor` with optional root identity/source revision.
- Verification: **92/92 test executions passed** (86 test suite + 6 runner); review approved **9.5/10**.

### 2026-09-24 — feat(auth): complete owner-root history authorization and context (Phase 02)

**Status:** Phase 02 DONE (2026-09-24); review complete; user approved. **Plan:** [All-project advisor history](../plans/260924-1055-all-project-advisor-history/plan.md) · [Phase 02](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md). **Evidence:** [validation](../plans/reports/tester-260924-1424-phase02-host-root-authorization-context.md); [review](../plans/reports/code-review-260924-1436-phase-02-host-root-authorization.md)

- Bound history to the trusted owner source with authenticated admission, on-demand runner hydration, invoke-time reauthorization, and lifecycle revocation; kept project mode default-deny and non-history operations grant-protected. Original suite report: 2,550 pass, one Windows skip; later targeted checks cover restart/cache, ancestor-symlink, and wrong-owner UID. Phases 03–05 are complete; see their linked completion entries.

### 2026-09-24 — feat(history): complete owner-safe all-project worker (Phase 03; DONE, 9.5/10 review score)

**Plan:** [Phase 03](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md). **Evidence:** [tests](../plans/reports/testerphase03final-260924-1621-phase-03-owner-safe-history-worker.md) · [review](../plans/reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md). **Results:** 354/354 tests passed (0 failed, 0 skipped); review 9.5/10; canonical advisor checkpoint complete. Candidate manifest check: tester FAIL; later review PASS.
- Descriptor-pinned owner-root file checks; safe project names persist, and malformed/unknown metadata does not hide records (legacy unnamed projects show abbreviated IDs); HMAC-bound cursors tie-break `started_at DESC → project_id ASC → task_run_id ASC → consultation_id ASC`; candidate inventory reuses `collectPluginPackageRecords`. Phase 04 and the paired Phase 05 qualification/release are complete; see the Phase 05 record above.

### 2026-09-21 — feat(plugin): complete Phase E00 domain contracts and parity qualification

**Status:** Phase E00 DONE (2026-09-21); review approved **9.5/10**.  
**Plan:** [Phase E00 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-00-domain-contracts-and-parity.md)  
**Evidence:** [validation](../plans/reports/tester-260921-0805-phase-e00-domain-contracts-parity.md); [code review](../plans/reports/code-review-260921-0808-phase-e00-domain-contracts-and-parity.md)

- Completed the `evcrate-advisor-data` v1 domain contracts, strict schemas,
  generated manifest, positive/negative wire fixtures, exact path identity,
  canonical checkpoint digest, metric/evaluation parity fixtures, and reviewed
  read-closure feasibility artifact.
- Qualified the E00 verification matrix: build, schema generation check,
  advisor-plugin tests, advisor metrics, advisor parity, and evaluation tests
  passed **28/28** with no failures or skips.
- G0 budget/cancellation/UI-memory assumptions are recorded; E01 and E02 are
  complete; E03–E05 remain pending.

### 2026-09-21 — feat(plugin): complete Phase E01 owner-safe read provider

**Status:** Phase E01 DONE (2026-09-21; 100%); review approved **9.5/10**.  
**Plan:** [Phase E01 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-01-owner-safe-provider.md)  
**Evidence:** [verification](../plans/reports/audit-260921-1139-phase-e01-verification.md); [re-review](../plans/reports/code-review-260921-1216-phase-e01-fixes-re-review.md)

- Delivered a read-only, context-bound provider for all eight E00 operations:
  history refresh/summary/page/detail, current policy, and evaluation
  list/read/compare.
- Backend modules: `provider.cjs` dispatch/validation; `provider-errors.cjs`
  safe typed errors; `binding.cjs` target/owner identity; `snapshot-store.cjs`
  bounded retention; `cursor-manager.cjs` signed pagination;
  `history-scanner.cjs` cooperative scanning; `history-detail.cjs` fingerprinted
  rereads; `history-provider.cjs` refresh/summary/page/detail;
  `policy-provider.cjs` current policy; and `evaluation-provider.cjs` bound
  evaluation operations.
- Descriptor-pinned TOCTOU protection opens policy, evaluation, and history
  files with `O_RDONLY | O_NOFOLLOW`, rechecks descriptor ownership, regular-file,
  single-link, and size invariants, and closes the descriptor. History
  fingerprints include device/inode identity.
- Preserved cancellation/deadline behavior, same-context stale retention,
  cross-context isolation, deterministic code-point ordering, and `<= 1 MiB`
  pages. No provider mutators, HOME scan, path rebinding, or controller dispatch.
- The controller closure remains exactly 33 files: inventory delta `0`; no
  controller, installer, or distribution projection files changed.
- Verification: **56/56 tests passed** across 8 files: 9 plugin-provider tests,
  38 advisor-controller regressions, and 9 protocol/parity tests. E02 worker/SDK
  integration is complete; joint G1 owner-worker qualification remains unclaimed.

### 2026-09-21 — feat(plugin): complete Phase E02 framed Node plugin worker

**Status:** Phase E02 DONE (2026-09-21; implementation closure); Cycle 2 review approved **9.5/10**.  
**Plan:** [Phase E02 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-02-plugin-worker.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260921-1441-phase-e02-cycle2.md); [advisor checkpoint](../plans/reports/advisor-260921-1445-phase-e02-cycle2-checkpoint.json)

- Delivered pinned D00 SDK handshake, strict framed JSON-RPC worker, bounded
  context/revision lifecycle, capability dispatch, cancellation/settlement,
  safe error mapping, stdout purity, and process-failure handling.
- Built deterministic backend-only candidate with exact content-hash inventory;
  no root runtime dependency or standalone picker/UI.
- Verification: **53/53 plugin tests passed** (22 focused worker tests +
  31 plugin tests); candidate check and deterministic build passed. Joint G1
  owner-worker qualification remains downstream; E03 is next.

### 2026-09-21 — feat(plugin): complete Phase E03 embedded provider-neutral four-view UI

**Status:** Phase E03 DONE (2026-09-21; implementation closure); review approved **9.2/10**.  
**Plan:** [Phase E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md)  
**Evidence:** [validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md); [review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md)

- Replaced view-owned acquisition with shared provider/reducer/views and a
  temporary standalone picker (later removed by E05); DamHopper uses bounded
  `MessagePort` without credentials, paths, sockets, or arbitrary network.
- Added bridge 1.0.0's eight validated envelopes, single-use nonce ack, session/
  generation fences, cancellation, late-response suppression, availability,
  and revocation cleanup.
- Kept Overview, paged History/detail, current account-wide policy labels, and
  bound-source Evaluations with provenance and candidate masking.
- Built `plugin/ui/index.html` as opaque-srcdoc inlined CSS/IIFE (328,337 bytes,
  <=5 MiB), with no external assets/network/filesystem picker, `eval`, or
  `Function`. Manifest/candidate include UI, `/plugins/evcrate.advisor`
  navigation, and its SHA-256 inventory entry (64 records).
- Verification: **68/68 tests passed** — 23 focused E03 UI tests, 14 viewer
  browser/build tests, 22 worker tests, and 9 plugin contract tests. Host-enforced
  CSP/sandbox, joint G2 LAN acceptance, E04 packaging, and G4 cutover remain
  downstream gates.

### 2026-09-22 — feat(plugin): qualify E04 independent package and Gate G3

**Status:** Phase E04 DONE (2026-09-22); Gate G3 **QUALIFIED**; review approved **9.3/10**.  
**Plan:** [Phase E04 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-04-independent-package.md)  
**Evidence:** [G3 qualification receipt](../plans/260920-1603-dam-hopper-advisor-plugin/reports/g3-qualification-receipt.md); [lifecycle review](../plans/reports/code-review-260922-2336-g3-qualification-lifecycle.md)

- Verified the independently installable matched package `evcrate.advisor`
  v0.1.0: **45 logical members**, **176,842 bytes compressed** (747,008 bytes
  expanded), code-point-sorted exact closure, and archive SHA-256
  `1ada5334671ae854e6c406930f8705de02d85e02198adcb07c41936002011f9a`
  (`1ada5334...`).
- Verified transactional stage/approve, matched UI/backend activation,
  update/disable/remove, worker drain and context revocation, crash recovery,
  and clean restart without DamHopper rebuild or EVCrate source mutation.
- Verified rollback safety: current revoked grants and disabled intent dominate
  restored package/settings; activation generations never rewind and restored
  non-security settings are revalidated.
- Verified root exact-7 release isolation: plugin staging is excluded from root
  npm packaging and cannot become an eighth release asset.
- Qualification evidence: plugin lifecycle **5/5**, package integrity/hostile
  archive **5/5**, root isolation **1/1**, and companion DamHopper lifecycle
  **8/8**. Standalone viewer retirement remains gated on E05/D06 G4.

### 2026-09-19 — feat(viewer): complete packaging, CSP, preview, and release inventory (Phase 08)

**Status:** Phase 08 DONE (2026-09-19; 100%); **39/39 focused tests passed**.
**Plan:** [Phase 08 plan](../plans/260917-2308-advisor-visual-metrics/phase-08-packaging-csp-preview-and-release-inventory.md)
**Evidence:** `tests/viewer/package-inventory.test.mjs`; `tests/distribution/private-release-artifacts.test.mjs`

- Added the viewer TypeScript, Vite, and Playwright boundaries: strict ES2020
  browser typechecking, relative static assets, no sourcemaps, and one Chromium
  project served from the built preview.
- Added `build:viewer`, `build:all`, `viewer:preview`, and
  `test:advisor-viewer`; release preparation now builds the root and viewer
  together before collecting package inventory.
- Preview binds strictly to loopback `127.0.0.1:4173` and emits the exact HTTP
  CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'
  data:; connect-src 'none'; object-src 'none'; base-uri 'none';
  frame-ancestors 'none'`.
- Package inventory includes only built `viewer/dist/**` viewer assets; source,
  configs, tests, maps, and `node_modules` remain excluded. The measured bundle
  is **298.5 kB <= 5 MiB**.
- Exact-seven top-level release assets and the exact 33-file controller closure
  remain unchanged. The viewer is packed inside platform archives, never added
  as a release asset.
- Handoff: **Phase 09 — Focused qualification and performance benchmark**.

### 2026-09-19 — feat(viewer): historical React Explorer and view architecture (Phase 07)

- Added private static React explorer under `viewer/src/` with unified reducer, tab navigation, and telemetry-free view contracts. Detailed records preserved in [changelog archive](./project-changelog-archive.md).

### 2026-09-18 — feat(advisor): historical browser traversal, metrics CLI, and counsel evaluation (Phases 04–06)

- Completed read-only browser history traversal scanner (Phase 05), metrics CLI operation (Phase 04), and counsel evaluation protocol fixtures (Phase 06). Detailed records preserved in [changelog archive](./project-changelog-archive.md).

### 2026-09-18 — feat(advisor): historical checkpoint digest, metrics kernel, and controller closure (Phases 02–03)

- Completed the portable deterministic metrics kernel, exact history filters/formulas, and registered the generated four-file runtime closure in the 33-file controller inventory; focused test suites passed. Detailed records preserved in [changelog archive](./project-changelog-archive.md).

### 2026-09-15 — docs(release): complete Windows qualification and bounded support cutover (Phases 09–10)

- Completed the hosted `windows-2025` x64 matrix for PowerShell 5.1/7 and Node `22.19.0`/`24.21.0` for standalone installer lifecycle (`install`, `repair`, `upgrade`, `rollback`, `uninstall`) and `version --json`.
- Bounded support covers standalone installer and version reporting only. Detailed records preserved in [changelog archive](./project-changelog-archive.md).
### 2026-09-14–2026-09-15 — feat(release): historical Windows qualification harness and CI workflow (Phases 05–08)

- Historical Windows qualification milestone: self-contained qualification harness (Phase 05), semantic-release candidate/publisher wrappers (Phase 06), split producer/matrix/publisher CI workflow (Phase 07), and unprivileged PR smoke workflow with qualified asset labels (Phase 08).
- Retained evidence: release orchestration 12/12, `npm run test:release` 29/29, scoped harness checks 60/60. Detailed phase records preserved in [changelog archive](./project-changelog-archive.md).

### 2026-09-11–2026-09-13 — feat(distribution): historical hook materialization scope distribution (Phases 01–07)

- Scope distribution baseline: scalar `--scope home|project`, normalized project descriptors and identity hashing, runtime closures, single-snapshot planning, generic transaction engine, schema-2 state migration/recovery, and contract proofs across all targets.
- Retained evidence: `npm run build`, `npm run test:publication`, `npm run test:integration`, and all target manifests green. Detailed records preserved in [changelog archive](./project-changelog-archive.md).
## Historical entries

Older phase detail is preserved in the [project changelog archive](./project-changelog-archive.md); this document remains the maintained phase mirror for the active milestone.
