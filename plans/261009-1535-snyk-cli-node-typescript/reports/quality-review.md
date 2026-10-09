> **Superseding Note (2026-10-10):**
> Following user direction, all legacy resources have been completely removed from `ext/snyk-expert`.
> The package, installer, and tests now target exclusively `.agents/`. References below to retained legacy resources reflect the initial review baseline and are superseded.

## Code Review Summary

### Scope
- Score: **9/10 for the scoped feature authoring/cutover**. Not a production/live-scanner qualification score.
- Review focus: common `.agents` clean cutover; installer safety; CLI/auth/scan contracts; Node.js/TypeScript ownership, compatibility and verification; consumer tests and packaging.
- Inspected implementation: `ext/snyk-expert/bin/install.js`; all six `ext/snyk-expert/lib/*.js` files; `package.json`; all three `tests/*.test.mjs` files.
- Inspected payload: all 11 files under `ext/snyk-expert/.agents/` — specialist; three skills; CLI workflow; finding/owner, Maven, Node and verification references; compatibility and review-output references.
- Inspected documentation/evidence: `ext/snyk-expert/docs/usage.md`, `docs/snyk-expert-cli.md`, current plan and `installer-smoke.json`. Historical README lines 1–128 read only to assess package-reader impact. PDR/code standards and development rules read for governing scope.
- Approximately 2,100 relevant implementation/test/payload/documentation lines analyzed, plus governing documents and primary vendor contracts.
- Updated plans: none. Plan/source/shared docs are main-owned; only this report written.
- Code-review skill read directly. Official claims checked with primary documentation; no automatic/native skill-discovery claim.

### Overall Assessment
The requested procedure authoring and common-folder cutover are substantively implemented. All inspected executable callers, destination messages and source inventory use `.agents`; `targetClaudeDir` has been removed in favor of `targetAgentsDir`. Historical resources are not copied or included as runtime assets. No shim, second installer, scanner wrapper, new dependency or unnecessary abstraction introduced.

No new critical/high defect identified in this scoped change. Two medium warnings below describe an inherited installer limitation and a deliberately retained packaging/documentation conflict; neither is presented as a newly introduced exploitable regression. One low-priority test-maintainability issue remains.

### Critical Issues
- **None identified.** No credential inclusion, automatic scanner acquisition/login, unapproved Code upload, suppression-as-fix or automatic major upgrade found in the inspected new payload.

### High Priority Findings
- **None identified in the scoped feature changes.** This does not establish authenticated scanning, effective host isolation or concurrency-safe installer behavior.

### Medium Priority Warnings

#### W1 — Installer authorization uses a stale plan if the destination changes before execution
- Location: `ext/snyk-expert/lib/install-planner.js:27–41,74–97`; `ext/snyk-expert/lib/install-executor.js:65–88`; interactive window at `ext/snyk-expert/bin/install.js:102–124`.
- Evidence: containment, physical kind and collision bytes are checked only during planning. Execution subsequently calls `mkdirSync`, `copyFileSync` and replacing `renameSync` without rechecking destination identity. The CLI may wait for human confirmation between those stages.
- Impact: [INFERENCE] a concurrent writer can create a previously absent destination, which is then replaced without being part of the approved collision list; replacing an ancestor with an escaping symlink after planning can redirect writes. Existing planner tests establish preflight symlink rejection, not protection against this transition.
- Classification: **inherited limitation**, not a `.agents` migration regression; diff changes only destination labels in the executor. No race or adversarial attack executed in this review.
- Action: maintain exclusive/trusted ownership of the installation tree. If concurrent installation is a supported requirement, bind planned destination identities and revalidate immediately before application; use no-clobber addition semantics and an appropriate writer boundary. Do not claim that a simple second path check alone supplies adversarial race-proof filesystem isolation.

#### W2 — npm's package entry README still describes the incompatible historical runtime
- Location: `ext/snyk-expert/package.json:13–17`; `ext/snyk-expert/docs/usage.md:34–36`; protected `ext/snyk-expert/README.md:3,39–61,86`.
- Evidence: historical README described a prototype bundle with two skills and Maven-only remediation. The package ships `.agents`, three skills and Node procedures. The supplied actual-pack evidence confirms a historical README is included; the current guide explicitly acknowledges npm automatic inclusion.
- Impact: a consumer arriving through the README can follow unavailable runtime links. The caveat in `docs/usage.md` is accurate but requires the reader to find that guide first.
- Classification: **known protected-file/release caveat**, not a request to alter the sealed README or a reason to reintroduce legacy runtime assets. Public release is explicitly outside this assignment.
- Action: keep the caveat prominent in handoff/install guidance. Before any separately authorized publication, resolve the package landing-document strategy without changing sealed history or shipping obsolete resources. Do not describe the current packed README as current usage documentation.

### Low Priority Suggestions

#### L1 — A few inherited unit assertions still pin human diagnostic wording
- Location: `ext/snyk-expert/tests/unit-and-planner.test.mjs:65,118,130`.
- Evidence: `/not found/`, `reason.includes('symbolic link')`, and `reason.includes('escaping target directory')` remain assertions against English diagnostics. Unlike an error code or blocker/destination identity, these are not stable consumer authorization semantics.
- Action: on the next authorized test edit, retain the missing-source throw and blocked destination/zero-write outcomes, but stop matching sentence fragments. Do not add a new error schema merely for these assertions.
- Positive contrast: changed CLI tests now assert exits, preserved collision bytes, zero dry-run writes, common destination files and packed paths instead of output copy or fixed asset counts. Fresh/repeat executor checks and legacy-tree preservation remain meaningful. Inventory-driven byte equality is stronger than an incidental count.

### Positive Observations
- Setup/install/auth/config authority is explicitly separate from scan authority and dependency writes. Human browser OAuth and operator-injected `SNYK_TOKEN` avoid assistant credential handling; endpoint binding precedes authentication; boolean presence is not equated to authentication.
- SCA dependency data and Code source transmission are separate gates. Code locations/rules/dataflows remain a read-only source-analysis lane, not dependency owners or automatic source edits.
- Scan templates preserve exit 1 under `set -e`; no `scan && convert` or `|| true`. Exit 2/3, omissions, malformed output and individual project errors cannot become clean/fixed evidence.
- Distinct original baseline/post and SCA/Code artifacts, exact-byte identities and optional HTML conversion provenance are required. Native HTML is product/help/version-gated; clean Code JSON omission is a narrowly scoped exception, not a missing-artifact waiver.
- Node procedure covers npm shrinkwrap precedence, conflicting manager evidence, real workspace membership, shared lockfiles, Yarn Classic/Modern, PnP coverage checks, pnpm format/version support, root overrides/catalogs and actual controlling manifest sections.
- Compatibility gates cover peers, optionality, installed TypeScript/compiler syntax, companion declarations, Node engines, ESM/CJS/exports and native ABI/platform behavior. No universal `ERR_REQUIRE_ESM` assumption or incidental deduplication requirement.
- Exact approvals bind current full baseline and intent. Patch/minor is not automatically safe; major/breaking/uncertain/scope changes remain gated. Independent eligible sets can proceed under existing policy without a new blanket gate; drift invalidates prior decisions.
- Baseline graph/runtime/scan evidence precedes edits. Same-scope post-scan plus graph and actual affected runtime are necessary for `fixed`; unavailable checks remain `unverified`. Selective rollback protects unrelated user state.
- Installer retains zero dependencies, explicit inventory, stable CLI names, byte verification, ordinary collision confirmation and non-transactional partial-install disclosure.

### Official Claim Checks
Primary sources read during this review:
- [Snyk auth](https://docs.snyk.io/developer-tools/snyk-cli/commands/auth): browser OAuth default beginning 1.1293; CI `SNYK_TOKEN` supported without token argv.
- [Snyk test](https://docs.snyk.io/developer-tools/snyk-cli/commands/test): documented exits 0/1/2/3, default dev exclusion, manager-specific `--dev`, per-project discovery limits, JSON/path restriction and HTML support beginning 1.1308.
- [Snyk Code test](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test): source-analysis lane, JSON omission for no issues, separate SARIF outputs, HTML version boundary and publication via `--report`.
- [JavaScript CLI](https://docs.snyk.io/supported-languages/supported-languages-list/javascript/snyk-cli-for-javascript): default first-manifest scan, all-projects/Yarn-workspace scope and Code from the project root.
- [JavaScript support matrix](https://docs.snyk.io/supported-languages/supported-languages-list/javascript): pnpm root/member file requirements and lockfile formats 5.4/6.x/9.x; npm/Yarn support and peer/dev/optional distinctions. New documents appropriately require deployed parser/result proof instead of treating a help flag as workspace coverage.
- [pnpm dependency resolution](https://pnpm.io/settings/dependency-resolution): current root `pnpm-workspace.yaml` overrides/selectors/catalogs; version-matched configuration remains required for older deployments.
- [Snyk configuration](https://docs.snyk.io/developer-tools/snyk-cli/configure-the-snyk-cli): configuration is a distinct environment/API/proxy boundary. No guessed endpoint/credential value was tested or retrieved.

### Task Completeness Against Plan
- Common payload/installer/package/test cutover: inspected and present; no obsolete runtime caller found in scoped search.
- Secure CLI login/setup, SCA/Code scans, optional HTML and artifact/exit semantics: authored with concrete procedures and primary-source support.
- Node.js/TypeScript manager/lockfile/workspace/compatibility/approval/verification: authored with concrete bound-argv procedures and explicit supported-version limits.
- Actual installer/pack verification: existing evidence read; it records dry-run, fresh/repeat install, nested reference collision, noninteractive refusal, explicit overwrite, real pack/extract and packed-artifact installation. Records 11 assets, 28 installed links and 21 packed files.
- Parent reports 24 package tests passed and seven implementation syntax checks passed. **Not rerun or independently claimed as reviewer execution.** Protected-file preservation is parent evidence, not a hash check performed by this reviewer.
- Independent quality review: this report. Bounded prompt behavior is a separate review slice; no result inferred here.
- Human approval/final documentation/evidence/commit choice: remain main-owned gates. Current unchecked plan items are not rewritten or declared complete by this reviewer.

### Recommended Actions
1. Integrate this review and the independent bounded-behavior report; main reconciles current plan status with actual evidence and human decision.
2. Retain W1 as an explicit inherited trusted/exclusive-writer limit; address concurrency mechanics only if that support requirement is selected.
3. Preserve W2's sealed-history boundary and resolve consumer landing docs before a separately authorized public release.
4. Remove residual diagnostic-wording assertions on the next authorized test maintenance pass; retain behavioral safety checks.
5. Qualify live scans only when an authorized target, scanner, organization, credential mechanism and product-specific transmission permissions exist. Do not demand live scans as proof that the authored procedure exists.

### Metrics and Validation Limits
- Critical/high scoped findings: **0 / 0**.
- Medium warnings: **2** (one inherited installer limitation; one known protected-README release caveat).
- Low suggestions: **1** concrete diagnostic-wording assertion issue.
- Type coverage: not measured; installer is plain ESM JavaScript, not a TypeScript compilation change.
- Test coverage percentage: unavailable; test pass count is not coverage.
- Lint issues: not measured; standalone package defines no lint/build/typecheck scripts.
- Reviewer commands: `git diff --stat && git diff -- ext/snyk-expert` for change identification only; scoped filesystem/source/reference reads and searches; primary-doc retrieval. No test, build, lint, formatter, scanner, login or source-edit execution.
- No live target, authenticated Snyk, package-manager remediation, native host discovery/permission or adversarial installer-race qualification. Missing scanner/auth/target authority is a qualification limit, not an authoring defect.

### Unresolved Questions
- No unresolved implementation question within this assigned authoring review. Future live qualification needs the exact authorized target/tool/org/auth/transmission boundary; public release needs a landing-document decision consistent with sealed history.
