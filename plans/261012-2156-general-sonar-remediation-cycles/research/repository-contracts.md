# Repository contracts — planning research

**Baseline research, not current scope:** [Validation decisions](../validation-decisions.md) expand targets to agents/claude/both and remove new live-run completion gates. Observed existing installer remains agents-only until implementation.

Date: 2026-10-12. Source: terminal result `SonarRepoContracts` plus parent section reads. No implementation/tests executed.

## Observed baseline

- Authoring boundary: `ext/sonarqube-test-quality/`; standalone ESM package, Node >=18.11.0. Core EVCrate engine is separate.
- `lib/install.js:57-68`: ten-file `SKILL_FILES` allowlist; `planInstallation:131-157` puts every asset under one domain skill.
- `executeInstallation:159-257`: one domain-skill lock; changed files staged beside destinations; concurrent destination checks; verification; in-memory replacement backups and in-process rollback.
- Rollback restoration errors are currently swallowed (`240-243`). Neither crash recovery nor simultaneous-reader atomic visibility is guaranteed. Preserve existing safety; ensure partial rollback is reported honestly when broadening the payload.
- `bin/install.js`: existing agents-only CLI, directory required; dry-run, force, yes, interactive confirmation, help/version. No new installer or flags needed.
- `package.json`: package allowlist lacks commands, agents, templates. npm test invokes `node --test tests/*.test.mjs`; no eval-runner script.
- `tests/install.test.mjs:12-23,47-61,100-120,287-339`: duplicated expected file fixture, idempotence, preview, unrelated-content protection, locking, concurrent writes, `_beforePublish` fault injection.
- `tests/report-format.test.mjs`: retain offline JSON fidelity and one-way Markdown-view coverage; do not make converter a remote evidence engine.
- `evals/evals.json`: existing 20 scenarios; descriptions alone are not executable behavioral evaluation evidence.

## Minimal changes

1. Replace single-destination mapping with fixed explicit source→destination entries. Retain existing exported APIs and CLI shapes; no second installer/adapter registry.
2. Keep one bundle lock shared by all old/new installer invocations; domain lock location may remain for compatibility. Apply all sibling assets through one plan/stage/publish/rollback sequence.
3. Add seven nested domain assets and one sibling command entrypoint: 18 total installed payload files when using precisely the brainstorm inventory.
4. Package new commands/agents/templates and verify packed—not only repository—installation.
5. Expand consumer-visible regressions: sibling-only collision blocks entire plan; failure after mixed additions/replacements restores both skills; concurrent user files survive; force never overrides symlink/type guards; unchanged repeats write nothing.
6. Add cycle behavioral evaluations with actual host execution and terminal transcripts; record unavailable runner/host as blocked rather than asserting JSON passed.

## Future verification commands

From extension root: `npm test`; `node bin/install.js --help`; dry-run and actual agents-only installation into disposable project; idempotent reinstall; authorized replacement and injected rollback; `npm pack --json --pack-destination <temp>` then install extracted package from outside source checkout. Existing CLI parsing/output assertions should check behavior/results, not re-pin incidental prose.

## Compatibility / limits

Ordinary local-only fixes retain intended executed tests without Sonar auth, Jenkins, N or child capability. Existing Jenkins push-to-scan stays separately authorized. Worktree creation for this planning task does not change consuming-project remediation policy.

Core docs disagree on 137/140 resource counts and contain retired command references. Do not treat counts as extension acceptance or perform unrelated cleanup.

## Unresolved questions

None for selected design. Actual host behavioral runner and approved live projects remain implementation preflight prerequisites.
