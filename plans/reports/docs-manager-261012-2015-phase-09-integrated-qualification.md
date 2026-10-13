# Documentation report — Phase 09 integrated qualification

**Date:** 2026-10-12  
**Scope:** Phase 09 (`phase-09-integrated-qualification`); documentation only.

## Current state assessment

The prior architecture and codebase summaries deferred native editor qualification to Phase 09. They now describe the integrated companion contract, isolated Windows host receipts, candidate identity, cross-platform runtime corrections, and remaining qualification boundary. No broad Windows parity or release-rollout claim is made.

## Changes made

- `docs/system-architecture.md`: documented N-01–N-03, the frozen `CompanionExtensionExports`, path/remote-authority and proposal-registration handling, Windows atomic watcher behavior, CLI launcher resolution, and the boundary between isolated host evidence and blocked interactive qualification.
- `docs/codebase-summary.md`: updated companion and CLI module summaries, including `resolveVscodeEditorLaunchTarget`, Windows `code.cmd` resolution to `Code.exe` plus `cli.js`, isolated runner directory semantics, and `test:vscode-companion` integration into `npm test`.
- `docs/project-changelog.md`: added a Phase 09 entry with candidate receipts, automated suite counts, implementation changes, and blocked scenarios; condensed older Phase 06–08 entries while retaining their milestones and corrected the Phase 08 option to `--vscode-editor`.

## Qualification evidence and limits

Candidate VSIX SHA-256: `c4638015d732945f85f3a6040a8864ac6b004d2fffdcf02f974e53fe7bed97a2`; `buildIdentity`: `caf354b6a8a2276f25e80fff3cef77be7529e061f122c3aab12150325f998dab`.

- **N-01:** isolated disposable installation and reprobe passed; a same-version identity mismatch returns exit 5 for manual setup while preserving committed stdout.
- **N-02:** isolated Extension Host exercised five commands and 17 actors with precedence; `hostObservedModel` remained null.
- **N-03:** all eight native hook lifecycle events passed; malformed calls failed closed; scout/privacy behavior was observed.
- Reported suites: QA receipt (`tester-261012-2000-phase-09-integrated-qualification.md`) ran 211/211 Node tests across five invocations (companion+VSIX 54/54, VS Code adapters 98/98, CLI companion/settings 48/48, installed runtime integration 6/6, VS Code publication 5/5); separate main-session runs passed single-projection manifest reuse (6/6) and private release artifacts (18/18). Full monolithic `npm test` was not run.
- Interactive picker/Chat, authenticated inference, child host-observed model, live cached-selection/reselection, hook/tool denial during a Chat turn, and Linux GUI/CLI smoke remain blocked in the qualification evidence. These are not implied as passing.

## Gaps and recommendations

The outstanding product evidence is interactive GUI and authenticated inference qualification, plus the other blocked scenarios listed above. Retain the current narrow Windows claim; revise it only when corresponding evidence is available. Keep both qualification reports linked from future documentation updates.

## Metrics and validation

Phase 09 documentation coverage: **3/3 requested project docs (100%)**. Updated: 2026-10-12. The requested `repomix` compaction ran to stdout; it was not written as `repomix-output.xml` because the writable-path allowlist excludes that file.

The requested validator path `.omp/evcrate/scripts/validate-docs.cjs` was absent. The active copy at `.evcrate/source/.omp/evcrate/scripts/validate-docs.cjs` ran against `docs/`: 10 files scanned; 26 code references and 143 internal links verified; warnings reported 52 code-reference, 161 internal-link, and 109 config-key issues across the documentation set. No baseline was compared, so warning provenance is not established; this is not a clean validation. The newly linked integrated/native receipt files and architecture anchor were confirmed present. Unrelated documentation was outside this task's ownership. No builds or tests were run for this documentation-only assignment.

## Unresolved questions

- When an authenticated interactive VS Code Chat session is available to qualify the remaining GUI/inference scenarios.